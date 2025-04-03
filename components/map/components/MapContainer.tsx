'use client';

import { useEffect, useRef } from 'react';
import { useMapInstanceStore } from '@/store/map/mapInstanceStore';
import { useViewStateStore } from '@/store/view/viewStateStore';
import { LogManager } from '@/core/logging/log-manager';
import { MapView } from './MapView';
import { CesiumView } from './cesium/CesiumView';
import { LayerPanel } from './LayerPanel';
import { SyncTo3DButton } from './SyncTo3DButton';
import { ResetButton } from './ResetButton';
import { useProjectLayers } from '../hooks/useProjectLayers';
import { LayerList } from './LayerList';
import { StatusMonitor } from './StatusMonitor';

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

export function MapContainer({
  accessToken,
  style,
  initialViewState2D,
  initialViewState3D,
  projectId
}: MapContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { cleanup } = useMapInstanceStore();
  const { setViewState2D, setViewState3D } = useViewStateStore();
  const mountCount = useRef(0);
  useProjectLayers(projectId || '');

  useEffect(() => {
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

    // Increment mount count
    mountCount.current += 1;

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
      logger.debug('MapContainer cleanup called', {
        mountCount: mountCount.current
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
    <div ref={containerRef} className="relative w-full h-full min-h-[600px]">
      <div className="absolute inset-0 flex flex-col gap-8 p-4">
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center px-2">
            <h2 className="text-lg font-semibold">2D Map View</h2>
            <div className="flex gap-2">
              <SyncTo3DButton />
              <ResetButton />
            </div>
          </div>
          <div className="relative w-full h-1/2 min-h-[400px]">
            <div className="absolute left-0 top-0 z-10 h-full">
              <LayerPanel>
                <LayerList />
              </LayerPanel>
            </div>
            <MapView accessToken={accessToken} style={style} />
          </div>
          <div className="px-2">
            <StatusMonitor />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold px-2">3D Map View</h2>
          <div className="relative w-full h-1/2 min-h-[400px]">
            <CesiumView />
          </div>
        </div>
      </div>
    </div>
  );
}