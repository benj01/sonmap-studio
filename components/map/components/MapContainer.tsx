'use client';

import { useEffect, useRef, memo, useCallback } from 'react';
import { useMapInstanceStore } from '@/store/map/mapInstanceStore';
import { useViewStateStore } from '@/store/view/viewStateStore';
import { dbLogger } from '@/utils/logging/dbLogger';
import { LayerPanel } from './LayerPanel';
import { ResetButton } from './ResetButton';
import { useProjectLayers } from '../hooks/useProjectLayers';
import { LayerList } from './LayerList';
import { StatusMonitor } from './StatusMonitor';
import { CesiumViewWithProvider } from './cesium/CesiumViewWithProvider';

export interface MapContainerProps {
  initialViewState3D?: {
    latitude: number;
    longitude: number;
    height: number;
    heading?: number;
    pitch?: number;
  };
  projectId?: string;
}

export const MapContainer = memo(function MapContainer({
  initialViewState3D,
  projectId
}: MapContainerProps) {
  // Remove previous diagnostic logs
  // Keep only essential logs if needed
  const mapInstanceStore = useMapInstanceStore();
  const cleanup = useMapInstanceStore(state => state.cleanup);
  const viewStateStore = useViewStateStore();
  const setViewState3D = useViewStateStore(state => state.setViewState3D);
  const projectLayers = useProjectLayers(projectId || '');
  const { isInitialized } = projectLayers;
  const containerRef = useRef<HTMLDivElement>(null);
  const renderCount = useRef(0);
  const mountCount = useRef(0);
  const shouldRenderChildren = useRef(process.env.NODE_ENV === 'production');

  // Memoize logging function to prevent it from causing re-renders
  const logRender = useCallback(async () => {
    renderCount.current++;
    await dbLogger.info('MapContainer: Render', {
      renderCount: renderCount.current,
      mountCount: mountCount.current,
      shouldRenderChildren: shouldRenderChildren.current,
      isInitialized,
      props: {
        hasProjectId: !!projectId,
        initialViewState3D
      },
      timestamp: new Date().toISOString()
    }, { source: 'MapContainer' });
  }, [isInitialized, projectId, initialViewState3D]);

  // Log render in effect to avoid render cycle
  useEffect(() => {
    logRender();
  }, [logRender]);

  useEffect(() => {
    mountCount.current++;
    // Copy ref values to local variables for use in cleanup
    const localMountCount = mountCount.current;
    const localRenderCount = renderCount.current;
    
    const logMount = async () => {
      await dbLogger.info('MapContainer: Mounted', {
        mountCount: localMountCount,
        renderCount: localRenderCount,
        timestamp: new Date().toISOString()
      }, { source: 'MapContainer' });
    };
    logMount();

    // In development, wait for the second mount (after Strict Mode)
    // In production, render immediately
    if (process.env.NODE_ENV === 'development') {
      if (localMountCount === 2) {
        shouldRenderChildren.current = true;
        dbLogger.debug('Development: Second mount - enabling child rendering', {
          mountCount: localMountCount
        }, { source: 'MapContainer' });
      }
    } else {
      shouldRenderChildren.current = true;
      dbLogger.debug('Production: First mount - enabling child rendering', {
        mountCount: localMountCount
      }, { source: 'MapContainer' });
    }

    if (initialViewState3D) {
      dbLogger.debug('Setting initial 3D view state', { initialViewState3D }, { source: 'MapContainer' });
      setViewState3D({
        longitude: initialViewState3D.longitude ?? 0,
        latitude: initialViewState3D.latitude ?? 0,
        height: initialViewState3D.height ?? 10000000,
        heading: initialViewState3D.heading ?? 0,
        pitch: initialViewState3D.pitch ?? -45
      });
    }

    return () => {
      const logUnmount = async () => {
        await dbLogger.info('MapContainer: Unmounting', {
          mountCount: localMountCount,
          renderCount: localRenderCount,
          timestamp: new Date().toISOString()
        }, { source: 'MapContainer' });
      };
      logUnmount();

      // Only cleanup and disable children on final unmount
      const isFinalUnmount = process.env.NODE_ENV === 'production' || localMountCount > 2;

      if (isFinalUnmount) {
        cleanup();
        shouldRenderChildren.current = false;
        dbLogger.info('Map container final cleanup complete', {
          mountCount: localMountCount,
          renderCount: localRenderCount
        }, { source: 'MapContainer' });
      } else {
        dbLogger.debug('Cleanup skipped - not final unmount', {
          mountCount: localMountCount
        }, { source: 'MapContainer' });
      }
    };
  }, [cleanup, setViewState3D, initialViewState3D]);

  // Only render children after the first mount cycle in development AND when layers are initialized
  const shouldRender = (process.env.NODE_ENV === 'production' || shouldRenderChildren.current) && isInitialized;
  
  // Move logging to effect
  useEffect(() => {
    dbLogger.debug('MapContainer: shouldRender value', { 
      shouldRender,
      isInitialized,
      shouldRenderChildren: shouldRenderChildren.current,
      environment: process.env.NODE_ENV
    }, { source: 'MapContainer' });
  }, [shouldRender, isInitialized]);

  return (
    <div ref={containerRef} className="w-full h-full flex flex-col">
      <div className="flex-1 flex flex-col gap-20 p-4">
        {shouldRender ? (
          <>
            {/* --- Only 3D Map View (Cesium) and Layer Panel --- */}
            <section className="h-full flex flex-col gap-2">
              <div className="flex justify-between items-center px-2 mb-4">
                <h2 className="text-lg font-semibold">3D Map View</h2>
                <div className="flex gap-2">
                  <ResetButton />
                </div>
              </div>
              <div className="relative w-full min-h-[400px] h-full">
                <div className="absolute left-0 top-0 z-10 h-full">
                  <LayerPanel>
                    <LayerList />
                  </LayerPanel>
                </div>
                <CesiumViewWithProvider />
              </div>
            </section>
          </>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <h3 className="text-lg font-semibold mb-2">Loading Map View</h3>
              <p className="text-gray-500">Please wait while we initialize the map...</p>
            </div>
          </div>
        )}
      </div>

      <div className="flex-none p-4 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <StatusMonitor />
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function for memo
  const propsEqual = 
    prevProps.projectId === nextProps.projectId &&
    (!prevProps.initialViewState3D && !nextProps.initialViewState3D) ||
    (prevProps.initialViewState3D?.latitude === nextProps.initialViewState3D?.latitude &&
     prevProps.initialViewState3D?.longitude === nextProps.initialViewState3D?.longitude &&
     prevProps.initialViewState3D?.height === nextProps.initialViewState3D?.height &&
     prevProps.initialViewState3D?.heading === nextProps.initialViewState3D?.heading &&
     prevProps.initialViewState3D?.pitch === nextProps.initialViewState3D?.pitch);

  // Move logging to effect in parent component
  return propsEqual;
});