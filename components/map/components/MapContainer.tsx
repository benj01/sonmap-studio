'use client';

import { useState, useEffect, useCallback } from 'react';
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

  const handleMapboxLoad = useCallback(() => {
    setMapboxLoaded(true);
    logger.info('Mapbox map loaded successfully');
  }, []);

  const handleCesiumLoad = useCallback(() => {
    setCesiumLoaded(true);
    logger.info('Cesium viewer loaded successfully');
  }, []);

  return (
    <div className={`relative w-full h-full ${className}`}>
      {/* Map Views Container */}
      <div className="grid grid-rows-2 w-full h-full">
        {/* 2D Map View (Top) */}
        <div className="relative border-b border-border">
          <MapView 
            initialViewState={initialViewState2D} 
            onLoad={handleMapboxLoad}
          />
          {mapboxLoaded && cesiumLoaded && (
            <div className="absolute bottom-4 right-4 z-[1000]">
              <SyncTo3DButton />
            </div>
          )}
        </div>
        
        {/* 3D Map View (Bottom) */}
        <div className="relative">
          <CesiumView 
            initialViewState={initialViewState3D}
            onLoad={handleCesiumLoad}
          />
        </div>
      </div>

      {/* Layer Panel - Always on top */}
      {projectId && (
        <div className="absolute top-4 left-4 pointer-events-auto z-[1000]">
          <LayerPanel>
            <LayerList projectId={projectId} />
          </LayerPanel>
        </div>
      )}
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