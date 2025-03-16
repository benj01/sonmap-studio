'use client';

import { useState, useEffect } from 'react';
import { MapView } from './MapView';
import { CesiumView } from './cesium/CesiumView';
import { ViewToggle } from './ViewToggle';
import { CesiumProvider } from '../context/CesiumContext';
import { MapProvider } from '../hooks/useMapContext';
import { LayerPanel } from './LayerPanel';
import { LayerList } from './LayerList';
import { CesiumLayerList } from './cesium/CesiumLayerList';
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
  projectId?: string;
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
  },
  projectId
}: MapContainerProps) {
  const [currentView, setCurrentView] = useState<'2d' | '3d'>('2d');
  
  // Handle view change
  const handleViewChange = (view: '2d' | '3d') => {
    logger.info(`Switching to ${view} view`);
    setCurrentView(view);
  };
  
  return (
    <div className={`relative w-full h-full ${className}`}>
      {/* View Toggle Button */}
      <div className="absolute top-4 right-4 z-50">
        <ViewToggle 
          currentView={currentView} 
          onViewChange={handleViewChange} 
        />
      </div>

      {/* Map Views */}
      <MapProvider>
        {/* 2D Map View - Only render when active */}
        {currentView === '2d' && (
          <div className="w-full h-full absolute inset-0 z-10">
            <MapView initialViewState={initialViewState2D} />
          </div>
        )}
        
        {/* 3D View - Use proper mounting/unmounting instead of opacity */}
        <CesiumProvider>
          {currentView === '3d' && (
            <div 
              className="w-full h-full absolute inset-0 z-10"
              style={{
                backgroundColor: '#000'
              }}
              data-container="cesium-outer-container"
            >
              <CesiumView initialViewState={initialViewState3D} />
            </div>
          )}
        </CesiumProvider>
        
        {/* Layer Panel - Always render but with different content based on view */}
        {projectId && (
          <LayerPanel 
            currentView={currentView}
            children2D={<LayerList projectId={projectId} />}
            children3D={<CesiumLayerList projectId={projectId} />}
          />
        )}
      </MapProvider>
    </div>
  );
} 