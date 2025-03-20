'use client';

import { useState, useEffect, useCallback } from 'react';
import { MapView } from './MapView';
import { CesiumView } from './cesium/CesiumView';
import { ViewToggle } from './ViewToggle';
import { CesiumProvider } from '../context/CesiumContext';
import { MapProvider, useMapContext } from '../hooks/useMapContext';
import { SharedLayerProvider } from '../context/SharedLayerContext';
import { LayerPanel } from './LayerPanel';
import { LayerList } from './LayerList';
import { CesiumLayerList } from './cesium/CesiumLayerList';
import { LogManager } from '@/core/logging/log-manager';
import { useViewSync, ViewState, CesiumViewState } from '../hooks/useViewSync';
import { useCesium } from '../context/CesiumContext';

const SOURCE = 'MapContainer';
const logManager = LogManager.getInstance();

const logger = {
  info: (message: string, data?: any) => {
    logManager.info(SOURCE, message, data);
    console.log(`[${SOURCE}] ${message}`, data);
  },
  warn: (message: string, error?: any) => {
    logManager.warn(SOURCE, message, error);
    console.warn(`[${SOURCE}] ${message}`, error);
  },
  error: (message: string, error?: any) => {
    logManager.error(SOURCE, message, error);
    console.error(`[${SOURCE}] ${message}`, error);
  },
  debug: (message: string, data?: any) => {
    logManager.debug(SOURCE, message, data);
    console.debug(`[${SOURCE}] ${message}`, data);
  }
};

interface MapContainerProps {
  className?: string;
  initialViewState2D?: ViewState;
  initialViewState3D?: CesiumViewState;
  projectId?: string;
}

// Inner component to use hooks within providers
function MapContainerInner({
  className = '',
  initialViewState2D,
  initialViewState3D,
  projectId,
  currentView,
  isTransitioning,
  onViewChange
}: MapContainerProps & {
  currentView: '2d' | '3d';
  isTransitioning: boolean;
  onViewChange: (view: '2d' | '3d') => void;
}) {
  const { map } = useMapContext();
  const { viewer } = useCesium();
  const { syncViews, useCameraSync } = useViewSync();

  // Handle view state synchronization
  useEffect(() => {
    let isMounted = true;

    const syncViewState = async () => {
      try {
        if (!map || !viewer) return;

        // When switching views, sync the current view state to the target view
        if (currentView === '3d') {
          const center = map.getCenter();
          const state = {
            center: [center.lng, center.lat] as [number, number],
            zoom: map.getZoom(),
            pitch: map.getPitch(),
            bearing: map.getBearing()
          };
          
          if (isMounted) {
            await syncViews('2d', state, map, viewer);
          }
        } else if (currentView === '2d') {
          if (isMounted) {
            await syncViews('3d', viewer.camera, map, viewer);
          }
        }
      } catch (error) {
        logger.error('Error syncing view state:', error);
      }
    };

    // Only sync when transitioning is complete
    if (!isTransitioning) {
      syncViewState();
    }

    return () => {
      isMounted = false;
    };
  }, [currentView, isTransitioning, map, viewer, syncViews]);

  // Use camera sync hook to handle continuous camera movement
  useCameraSync(currentView, map || undefined, viewer || undefined);

  return (
    <div className={`relative w-full h-full ${className}`}>
      {/* Map Views Container */}
      <div className="relative w-full h-full">
        {/* 2D Map View - Only render when active */}
        {currentView === '2d' && (
          <div className="w-full h-full absolute inset-0">
            <MapView initialViewState={initialViewState2D} />
          </div>
        )}
        
        {/* 3D View - Use proper mounting/unmounting instead of opacity */}
        {currentView === '3d' && (
          <div 
            className="w-full h-full absolute inset-0"
            style={{
              backgroundColor: '#000'
            }}
            data-container="cesium-outer-container"
          >
            <CesiumView initialViewState={initialViewState3D} />
          </div>
        )}
      </div>

      {/* Controls Layer - Always on top */}
      <div className="absolute inset-0 pointer-events-none z-[1000]">
        {/* View Toggle Button - Restore pointer events */}
        <div className="absolute top-4 right-4 pointer-events-auto">
          <ViewToggle 
            currentView={currentView} 
            onViewChange={onViewChange}
            disabled={isTransitioning}
          />
        </div>

        {/* Layer Panel - Always render but with different content based on view */}
        {projectId && (
          <div className="absolute top-4 left-4 pointer-events-auto">
            <LayerPanel 
              currentView={currentView}
              children2D={<LayerList projectId={projectId} />}
              children3D={<CesiumLayerList projectId={projectId} />}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export function MapContainer(props: MapContainerProps) {
  const [currentView, setCurrentView] = useState<'2d' | '3d'>('2d');
  const [isTransitioning, setIsTransitioning] = useState(false);
  
  // Handle view change with proper cleanup and state management
  const handleViewChange = useCallback(async (view: '2d' | '3d') => {
    if (isTransitioning) {
      logger.warn('View transition already in progress, ignoring request');
      return;
    }

    try {
      setIsTransitioning(true);
      logger.info(`Switching to ${view} view`);

      // Set the new view immediately
      setCurrentView(view);

      // Wait for the view to be fully mounted and initialized
      await new Promise(resolve => {
        // Use requestAnimationFrame to ensure DOM updates are complete
        requestAnimationFrame(() => {
          // Add a small delay for initialization
          setTimeout(resolve, 50);
        });
      });

    } catch (error) {
      logger.error('Error during view transition:', error);
    } finally {
      setIsTransitioning(false);
    }
  }, [isTransitioning]);
  
  return (
    <SharedLayerProvider>
      <MapProvider>
        <CesiumProvider>
          <MapContainerInner
            {...props}
            currentView={currentView}
            isTransitioning={isTransitioning}
            onViewChange={handleViewChange}
          />
        </CesiumProvider>
      </MapProvider>
    </SharedLayerProvider>
  );
}