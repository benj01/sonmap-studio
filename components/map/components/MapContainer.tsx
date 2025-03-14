'use client';

import { useState } from 'react';
import { MapView } from './MapView';
import { CesiumView } from './cesium/CesiumView';
import { ViewToggle } from './ViewToggle';
import { CesiumProvider } from '../context/CesiumContext';
import { MapProvider } from '../hooks/useMapContext';
import { LogManager } from '@/core/logging/log-manager';

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

interface MapContainerProps {
  className?: string;
  initialViewState2D?: {
    center: [number, number];
    zoom: number;
  };
  initialViewState3D?: {
    latitude: number;
    longitude: number;
    height: number;
  };
}

export function MapContainer({
  className = '',
  initialViewState2D = {
    center: [0, 0],
    zoom: 1
  },
  initialViewState3D = {
    latitude: 0,
    longitude: 0,
    height: 10000000
  }
}: MapContainerProps) {
  const [currentView, setCurrentView] = useState<'2d' | '3d'>('2d');

  const handleViewChange = (view: '2d' | '3d') => {
    logger.info(`Switching to ${view} view`);
    setCurrentView(view);
  };

  return (
    <div className={`relative w-full h-full ${className}`}>
      {/* View Toggle Button */}
      <div className="absolute top-4 right-4 z-10">
        <ViewToggle 
          currentView={currentView} 
          onViewChange={handleViewChange} 
        />
      </div>

      {/* Map Views */}
      <div className="w-full h-full">
        {currentView === '2d' ? (
          <MapProvider>
            <MapView 
              initialViewState={initialViewState2D}
              className={currentView === '2d' ? 'block' : 'hidden'}
            />
          </MapProvider>
        ) : (
          <CesiumProvider>
            <CesiumView 
              initialViewState={initialViewState3D}
              className={currentView === '3d' ? 'block' : 'hidden'}
            />
          </CesiumProvider>
        )}
      </div>
    </div>
  );
} 