'use client';

import { useState, useEffect } from 'react';
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
  const [was3dActive, setWas3dActive] = useState(false);
  
  // Update 3D active tracking
  useEffect(() => {
    if (currentView === '3d') {
      setWas3dActive(true);
    }
  }, [currentView]);
  
  return (
    <div className={`relative w-full h-full ${className}`}>
      {/* View Toggle Button */}
      <div className="absolute top-4 right-4 z-50">
        <ViewToggle 
          currentView={currentView} 
          onViewChange={setCurrentView} 
        />
      </div>

      {/* Map Views */}
      <MapProvider>
        {/* 2D Map View */}
        <div 
          className={`w-full h-full absolute inset-0 transition-opacity duration-300 ${
            currentView === '2d' ? 'opacity-100 z-10' : 'opacity-0 z-0'
          }`}
        >
          <MapView initialViewState={initialViewState2D} />
        </div>
        
        {/* 3D View - only render if it's active or was previously active */}
        <CesiumProvider>
          {(currentView === '3d' || was3dActive) && (
            <div 
              className={`w-full h-full absolute inset-0 transition-opacity duration-300 ${
                currentView === '3d' ? 'opacity-100 z-10' : 'opacity-0 z-0'
              }`}
            >
              <CesiumView initialViewState={initialViewState3D} />
            </div>
          )}
        </CesiumProvider>
      </MapProvider>
    </div>
  );
} 