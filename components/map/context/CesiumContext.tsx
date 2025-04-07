'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useMemo, useCallback, useRef } from 'react';
import * as Cesium from 'cesium';
import { LogManager, LogLevel } from '@/core/logging/log-manager';

const SOURCE = 'CesiumContext';
const logManager = LogManager.getInstance();

// Configure logging for CesiumContext
logManager.setComponentLogLevel(SOURCE, LogLevel.INFO);

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
  // Remove state management, keep only essential utilities
  getCesiumDefaults: () => any;
  getTerrainProvider: () => Promise<any>;
}

// Create the context with default values
const CesiumContext = createContext<CesiumContextType>({
  getCesiumDefaults: () => ({}),
  getTerrainProvider: async () => null
});

interface CesiumProviderProps {
  children: ReactNode;
}

export function CesiumProvider({ children }: CesiumProviderProps) {
  // Remove state management
  const getCesiumDefaults = useCallback(() => ({
    animation: false,
    baseLayerPicker: false,
    fullscreenButton: false,
    geocoder: false,
    homeButton: false,
    navigationHelpButton: false,
    sceneModePicker: false,
    timeline: false
  }), []);

  const getTerrainProvider = useCallback(async () => {
    return await Cesium.createWorldTerrainAsync();
  }, []);

  // Memoize the context value
  const contextValue = useMemo(() => ({
    getCesiumDefaults,
    getTerrainProvider
  }), [getCesiumDefaults, getTerrainProvider]);

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