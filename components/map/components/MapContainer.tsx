'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { MapView } from './MapView';
import { CesiumView } from './cesium/CesiumView';
import { CesiumProvider } from '../context/CesiumContext';
import { MapProvider, useMapContext } from '../hooks/useMapContext';
import { SharedLayerProvider } from '../context/SharedLayerContext';
import { LayerPanel } from './LayerPanel';
import { LayerList } from './LayerList';
import { LogManager } from '@/core/logging/log-manager';
import { useViewSync, ViewState, CesiumViewState } from '../hooks/useViewSync';
import { useCesium } from '../context/CesiumContext';
import { SyncTo3DButton } from './SyncTo3DButton';

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
  initialViewState2D = {
    center: [0, 0],
    zoom: 1,
    pitch: 0,
    bearing: 0
  },
  initialViewState3D = {
    latitude: 0,
    longitude: 0,
    height: 10000000
  },
  projectId
}: MapContainerProps) {
  const [mapboxLoaded, setMapboxLoaded] = useState(false);
  const [cesiumLoaded, setCesiumLoaded] = useState(false);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const cesiumRef = useRef<any>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const handleMapboxLoad = useCallback(() => {
    setMapboxLoaded(true);
    logger.info('Mapbox map loaded successfully');
  }, []);

  const handleCesiumLoad = useCallback(() => {
    setCesiumLoaded(true);
    logger.info('Cesium viewer loaded successfully');
  }, []);

  // Handle map resize when container becomes visible
  useEffect(() => {
    const container = document.querySelector('.map-container');
    if (!container) return;

    const resizeObserver = new ResizeObserver(() => {
      // Ensure maps are properly sized even when container visibility changes
      requestAnimationFrame(() => {
        if (mapRef.current) {
          mapRef.current.resize();
        }
        if (cesiumRef.current) {
          cesiumRef.current.resize();
        }
      });
    });

    resizeObserver.observe(container);
    resizeObserverRef.current = resizeObserver;

    // Also handle visibility changes
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (mapRef.current) {
          mapRef.current.resize();
        }
        if (cesiumRef.current) {
          cesiumRef.current.resize();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      resizeObserver.disconnect();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Cleanup function
  useEffect(() => {
    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
      // Only cleanup map instances if we're actually unmounting the component
      // not just hiding it with CSS
      const mapContainer = mapRef.current?.getContainer();
      const cesiumContainer = cesiumRef.current?.container;
      
      if (mapContainer && document.body.contains(mapContainer)) {
        mapRef.current?.remove();
      }
      if (cesiumContainer && document.body.contains(cesiumContainer)) {
        cesiumRef.current?.destroy();
      }
    };
  }, []);

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden map-container">
      {/* Map Views Container */}
      <div className="flex-1 flex flex-col gap-4 p-4 bg-background h-full">
        {/* Top row: Layer Panel + 2D Map */}
        <div className="flex gap-4" style={{ height: '45%' }}>
          {/* Layer Panel - Always visible */}
          <div className="w-[300px] border border-border rounded-lg shadow-md overflow-auto bg-background">
            {projectId ? (
              <LayerPanel defaultCollapsed={false}>
                {mapboxLoaded && cesiumLoaded && (
                  <div className="p-4 border-b border-border">
                    <SyncTo3DButton />
                  </div>
                )}
                <LayerList projectId={projectId} defaultVisibility={true} />
              </LayerPanel>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                No project selected
              </div>
            )}
          </div>

          {/* 2D Map View */}
          <div className="flex-1 relative border border-border rounded-lg shadow-md overflow-hidden min-w-0">
            <MapView 
              initialViewState={initialViewState2D} 
              onLoad={handleMapboxLoad}
              onMapRef={(map) => {
                mapRef.current = map;
                // Ensure map is properly sized after ref is set
                requestAnimationFrame(() => map.resize());
              }}
            />
          </div>
        </div>
        
        {/* Bottom row: 3D Map View */}
        <div className="relative border border-border rounded-lg shadow-md overflow-hidden" style={{ height: '55%' }}>
          <CesiumView 
            initialViewState={initialViewState3D}
            onLoad={handleCesiumLoad}
            onViewerRef={(viewer) => {
              cesiumRef.current = viewer;
              // Ensure viewer is properly sized after ref is set
              requestAnimationFrame(() => viewer.resize());
            }}
          />
        </div>
      </div>
    </div>
  );
}

export function MapContainer(props: MapContainerProps) {
  return (
    <SharedLayerProvider>
      <MapProvider>
        <CesiumProvider>
          <MapContainerInner {...props} />
        </CesiumProvider>
      </MapProvider>
    </SharedLayerProvider>
  );
}