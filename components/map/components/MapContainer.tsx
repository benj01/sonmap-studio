'use client';

import { useEffect } from 'react';
import { useMapInstanceStore } from '@/store/map/mapInstanceStore';
import { useViewStateStore } from '@/store/view/viewStateStore';
import { LogManager } from '@/core/logging/log-manager';
import { MapView } from './MapView';
import { CesiumView } from './cesium/CesiumView';
import { LayerPanel } from './LayerPanel';
import { SyncTo3DButton } from './SyncTo3DButton';
import { ResetButton } from './ResetButton';
import { useProjectLayers } from '../hooks/useProjectLayers';

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
  const { cleanup } = useMapInstanceStore();
  const { setViewState2D, setViewState3D } = useViewStateStore();
  useProjectLayers(projectId || '');

  useEffect(() => {
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

    // Cleanup on unmount
    return () => {
      cleanup();
      logger.info('Map container cleanup complete');
    };
  }, []);

  return (
    <div className="relative w-full h-full">
      <div className="absolute inset-0 grid grid-cols-2 gap-4">
        <div className="relative">
          <MapView accessToken={accessToken} style={style} />
        </div>
        <div className="relative">
          <CesiumView />
        </div>
      </div>
      
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
        <LayerPanel>
          <div className="flex flex-col gap-2">
            <SyncTo3DButton />
            <ResetButton />
          </div>
        </LayerPanel>
      </div>
    </div>
  );
}