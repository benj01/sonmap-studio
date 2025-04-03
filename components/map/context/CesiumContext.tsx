'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import * as Cesium from 'cesium';
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
  setInitialized: (initialized: boolean) => void;
}

// Create the context with default values
const CesiumContext = createContext<CesiumContextType>({
  viewer: null,
  isInitialized: false,
  setViewer: () => {},
  setInitialized: () => {},
});

interface CesiumProviderProps {
  children: ReactNode;
}

export function CesiumProvider({ children }: CesiumProviderProps) {
  const [viewer, setViewer] = useState<Cesium.Viewer | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    // Don't automatically set initialized here anymore
    // Let the CesiumView component control this
    
    return () => {
      // Clean up Cesium resources when the provider unmounts
      if (viewer && !viewer.isDestroyed()) {
        viewer.destroy();
      }
      setIsInitialized(false);
    };
  }, [viewer]);

  const contextValue = {
    viewer,
    isInitialized,
    setViewer,
    setInitialized: setIsInitialized,
  };

  return (
    <CesiumContext.Provider value={contextValue}>
      {children}
    </CesiumContext.Provider>
  );
}

// Custom hook for using the Cesium context
export function useCesium() {
  const context = useContext(CesiumContext);
  if (context === undefined) {
    throw new Error('useCesium must be used within a CesiumProvider');
  }
  return context;
} 