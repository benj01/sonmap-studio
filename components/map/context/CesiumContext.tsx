'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import * as Cesium from 'cesium';
import { initCesium } from '@/lib/cesium/init';
import { LogManager } from '@/core/logging/log-manager';

const SOURCE = 'CesiumContext';
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

// Define the context shape
interface CesiumContextType {
  viewer: Cesium.Viewer | null;
  isInitialized: boolean;
  setViewer: (viewer: Cesium.Viewer | null) => void;
  scene: Cesium.Scene | null;
  camera: Cesium.Camera | null;
  globe: Cesium.Globe | null;
  initializationError: string | null;
}

// Create the context with default values
const CesiumContext = createContext<CesiumContextType>({
  viewer: null,
  isInitialized: false,
  setViewer: () => {},
  scene: null,
  camera: null,
  globe: null,
  initializationError: null
});

// Hook for using the Cesium context
export const useCesium = () => useContext(CesiumContext);

interface CesiumProviderProps {
  children: ReactNode;
}

export function CesiumProvider({ children }: CesiumProviderProps) {
  const [viewer, setViewerState] = useState<Cesium.Viewer | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [initializationError, setInitializationError] = useState<string | null>(null);
  const isUnmountingRef = useRef(false);

  // Initialize Cesium when the provider mounts
  useEffect(() => {
    logger.info('CesiumProvider mounted, initializing Cesium...');
    
    // Use a timeout to ensure the DOM is fully rendered
    const initTimeout = setTimeout(() => {
      try {
        // Check if Cesium is already loaded
        if (typeof Cesium === 'undefined') {
          const error = 'Cesium is not defined';
          logger.error(error);
          setInitializationError(error);
          return;
        }
        
        // Check if required Cesium components are available
        if (!Cesium.Viewer) {
          const error = 'Cesium.Viewer is not defined';
          logger.error(error);
          setInitializationError(error);
          return;
        }
        
        // Initialize Cesium
        initCesium();
        
        // Set initialization flag
        setIsInitialized(true);
        logger.info('Cesium initialized successfully');
      } catch (error: any) {
        const errorMessage = error?.message || 'Unknown error initializing Cesium';
        logger.error('Failed to initialize Cesium', error);
        setInitializationError(errorMessage);
      }
    }, 500);
    
    return () => {
      clearTimeout(initTimeout);
    };
  }, []);

  // Set viewer
  const setViewer = (newViewer: Cesium.Viewer | null) => {
    logger.debug('Setting Cesium viewer', { viewerExists: !!newViewer });
    
    // If we're setting a new viewer and already have one, clean up the old one
    if (newViewer && viewer && newViewer !== viewer) {
      try {
        logger.info('Replacing existing Cesium viewer');
        viewer.destroy();
      } catch (error) {
        logger.error('Error destroying previous Cesium viewer', error);
      }
    }
    
    setViewerState(newViewer);
  };

  // Clean up viewer only when the application is actually unmounting
  useEffect(() => {
    // Set up beforeunload event to detect actual page unload
    const handleBeforeUnload = () => {
      isUnmountingRef.current = true;
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    // Clean up function that runs when component unmounts
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      
      // Only destroy the viewer if the page is actually unloading
      // This prevents destroying the viewer when just switching views
      if (isUnmountingRef.current && viewer) {
        try {
          logger.info('Destroying Cesium viewer on page unload');
          viewer.destroy();
        } catch (error) {
          logger.error('Error destroying Cesium viewer', error);
        }
      } else {
        logger.debug('CesiumProvider unmounting but not destroying viewer (view switch)');
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
    globe,
    initializationError
  };

  return (
    <CesiumContext.Provider value={contextValue}>
      {children}
    </CesiumContext.Provider>
  );
} 