'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import * as Cesium from 'cesium';
import { initCesium } from '@/lib/cesium/init';
import { LogManager } from '@/core/logging/log-manager';

const SOURCE = 'CesiumContext';
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

// Define the context shape
interface CesiumContextType {
  viewer: Cesium.Viewer | null;
  isInitialized: boolean;
  setViewer: (viewer: Cesium.Viewer | null) => void;
  scene: Cesium.Scene | null;
  camera: Cesium.Camera | null;
  globe: Cesium.Globe | null;
}

// Create the context with default values
const CesiumContext = createContext<CesiumContextType>({
  viewer: null,
  isInitialized: false,
  setViewer: () => {},
  scene: null,
  camera: null,
  globe: null
});

// Hook for using the Cesium context
export const useCesium = () => useContext(CesiumContext);

interface CesiumProviderProps {
  children: ReactNode;
}

export function CesiumProvider({ children }: CesiumProviderProps) {
  const [viewer, setViewerState] = useState<Cesium.Viewer | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize Cesium when the provider mounts
  useEffect(() => {
    try {
      initCesium();
      setIsInitialized(true);
      logger.info('Cesium initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Cesium', error);
    }
  }, []);

  // Set viewer and clean up when unmounting
  const setViewer = (newViewer: Cesium.Viewer | null) => {
    logger.debug('Setting Cesium viewer', { viewerExists: !!newViewer });
    setViewerState(newViewer);
  };

  // Clean up viewer when component unmounts
  useEffect(() => {
    return () => {
      if (viewer) {
        try {
          logger.info('Destroying Cesium viewer');
          viewer.destroy();
          setViewerState(null);
        } catch (error) {
          logger.error('Error destroying Cesium viewer', error);
        }
      }
    };
  }, [viewer]);

  // Compute derived state
  const scene = viewer?.scene || null;
  const camera = scene?.camera || null;
  const globe = scene?.globe || null;

  const contextValue: CesiumContextType = {
    viewer,
    isInitialized,
    setViewer,
    scene,
    camera,
    globe
  };

  return (
    <CesiumContext.Provider value={contextValue}>
      {children}
    </CesiumContext.Provider>
  );
} 