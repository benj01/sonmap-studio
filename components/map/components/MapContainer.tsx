'use client';

import { useEffect, useRef, memo, useMemo } from 'react';
import { useMapInstanceStore } from '@/store/map/mapInstanceStore';
import { useViewStateStore } from '@/store/view/viewStateStore';
import { LogManager } from '@/core/logging/log-manager';
import { MapView } from './MapView';
import { LayerPanel } from './LayerPanel';
import { SyncTo3DButton } from './SyncTo3DButton';
import { ResetButton } from './ResetButton';
import { useProjectLayers } from '../hooks/useProjectLayers';
import { LayerList } from './LayerList';
import { StatusMonitor } from './StatusMonitor';
import { CesiumViewWithProvider } from './cesium/CesiumViewWithProvider';

const SOURCE = 'MapContainer';
const logManager = LogManager.getInstance();

const logger = {
  info: (message: string, data?: any) => {
    logManager.info(SOURCE, message, data);
  },
  warn: (message: string, error?: any) => {
    logManager.warn(SOURCE, message, error);
  },
  error: (message: string, error?: any) => {
    logManager.error(SOURCE, message, error);
  },
  debug: (message: string, data?: any) => {
    logManager.debug(SOURCE, message, data);
  }
};

export interface MapContainerProps {
  accessToken: string;
  style: string;
  initialViewState2D?: {
    latitude: number;
    longitude: number;
    zoom: number;
    bearing?: number;
    pitch?: number;
  };
  initialViewState3D?: {
    latitude: number;
    longitude: number;
    height: number;
    heading?: number;
    pitch?: number;
  };
  projectId?: string;
}

// Memoize the MapContainer component with a custom comparison function
export const MapContainer = memo(function MapContainer({
  accessToken,
  style,
  initialViewState2D,
  initialViewState3D,
  projectId
}: MapContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { cleanup } = useMapInstanceStore();
  const { setViewState2D, setViewState3D } = useViewStateStore();
  const renderCount = useRef(0);
  const mountCount = useRef(0);
  useProjectLayers(projectId || '');

  // Log render and mount cycles
  renderCount.current++;
  logger.info('MapContainer: Render', {
    renderCount: renderCount.current,
    mountCount: mountCount.current,
    props: {
      hasAccessToken: !!accessToken,
      hasStyle: !!style,
      hasInitialViewState2D: !!initialViewState2D,
      hasInitialViewState3D: !!initialViewState3D,
      hasProjectId: !!projectId
    },
    timestamp: new Date().toISOString()
  });

  // Log mount/unmount cycles
  useEffect(() => {
    mountCount.current++;
    logger.info('MapContainer: Mounted', { 
      mountCount: mountCount.current,
      renderCount: renderCount.current,
      timestamp: new Date().toISOString()
    });

    // Log container dimensions
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      logger.debug('MapContainer dimensions', {
        width: rect.width,
        height: rect.height,
        top: rect.top,
        left: rect.left,
        bottom: rect.bottom,
        right: rect.right
      });
    }

    logger.debug('MapContainer effect starting', {
      mountCount: mountCount.current,
      hasInitialState2D: !!initialViewState2D,
      hasInitialState3D: !!initialViewState3D
    });

    // Skip first mount in development due to strict mode
    if (process.env.NODE_ENV === 'development' && mountCount.current === 1) {
      logger.debug('Skipping first mount in development');
      return;
    }

    // Set initial view states if provided
    if (initialViewState2D) {
      logger.debug('Setting initial 2D view state', initialViewState2D);
      setViewState2D({
        longitude: initialViewState2D.longitude ?? 0,
        latitude: initialViewState2D.latitude ?? 0,
        zoom: initialViewState2D.zoom ?? 1,
        pitch: initialViewState2D.pitch ?? 0,
        bearing: initialViewState2D.bearing ?? 0
      });
    }

    if (initialViewState3D) {
      logger.debug('Setting initial 3D view state', initialViewState3D);
      setViewState3D({
        longitude: initialViewState3D.longitude ?? 0,
        latitude: initialViewState3D.latitude ?? 0,
        height: initialViewState3D.height ?? 10000000,
        heading: initialViewState3D.heading ?? 0,
        pitch: initialViewState3D.pitch ?? -45
      });
    }

    return () => {
      logger.info('MapContainer: Unmounting', { 
        mountCount: mountCount.current,
        renderCount: renderCount.current,
        timestamp: new Date().toISOString()
      });

      // Only cleanup on final unmount in development
      if (process.env.NODE_ENV === 'development' && mountCount.current <= 2) {
        logger.debug('Cleanup skipped - not final unmount');
        return;
      }

      cleanup();
      logger.info('Map container cleanup complete');
    };
  }, [cleanup, setViewState2D, setViewState3D, initialViewState2D, initialViewState3D]);

  return (
    <div ref={containerRef} className="w-full h-full flex flex-col">
      <div className="flex-1 flex flex-col gap-20 p-4">
        <section className="h-[400px] flex flex-col gap-2">
          <div className="flex justify-between items-center px-2 mb-2">
            <h2 className="text-lg font-semibold">2D Map View</h2>
            <div className="flex gap-2">
              <SyncTo3DButton />
              <ResetButton />
            </div>
          </div>
          <div className="relative flex-1">
            <div className="absolute left-0 top-0 z-10 h-full">
              <LayerPanel>
                <LayerList />
              </LayerPanel>
            </div>
            <MapView accessToken={accessToken} style={style} />
          </div>
        </section>

        <section className="h-[400px] flex flex-col gap-2 mt-4">
          <div className="flex justify-between items-center px-2 mb-4">
            <h2 className="text-lg font-semibold">3D Map View</h2>
          </div>
          <div className="relative flex-1">
            <CesiumViewWithProvider />
          </div>
        </section>
      </div>

      <div className="flex-none p-4 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <StatusMonitor />
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function for memo
  const propsEqual = 
    prevProps.accessToken === nextProps.accessToken &&
    prevProps.style === nextProps.style &&
    prevProps.projectId === nextProps.projectId &&
    // Compare view states using shallow comparison of their properties
    (!prevProps.initialViewState2D && !nextProps.initialViewState2D) ||
    (prevProps.initialViewState2D?.latitude === nextProps.initialViewState2D?.latitude &&
     prevProps.initialViewState2D?.longitude === nextProps.initialViewState2D?.longitude &&
     prevProps.initialViewState2D?.zoom === nextProps.initialViewState2D?.zoom &&
     prevProps.initialViewState2D?.bearing === nextProps.initialViewState2D?.bearing &&
     prevProps.initialViewState2D?.pitch === nextProps.initialViewState2D?.pitch) &&
    (!prevProps.initialViewState3D && !nextProps.initialViewState3D) ||
    (prevProps.initialViewState3D?.latitude === nextProps.initialViewState3D?.latitude &&
     prevProps.initialViewState3D?.longitude === nextProps.initialViewState3D?.longitude &&
     prevProps.initialViewState3D?.height === nextProps.initialViewState3D?.height &&
     prevProps.initialViewState3D?.heading === nextProps.initialViewState3D?.heading &&
     prevProps.initialViewState3D?.pitch === nextProps.initialViewState3D?.pitch);

  logger.debug('MapContainer: Props comparison', {
    propsEqual,
    prevProps: {
      hasAccessToken: !!prevProps.accessToken,
      hasStyle: !!prevProps.style,
      hasInitialViewState2D: !!prevProps.initialViewState2D,
      hasInitialViewState3D: !!prevProps.initialViewState3D,
      hasProjectId: !!prevProps.projectId
    },
    nextProps: {
      hasAccessToken: !!nextProps.accessToken,
      hasStyle: !!nextProps.style,
      hasInitialViewState2D: !!nextProps.initialViewState2D,
      hasInitialViewState3D: !!nextProps.initialViewState3D,
      hasProjectId: !!nextProps.projectId
    }
  });

  return propsEqual;
});