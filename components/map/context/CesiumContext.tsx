'use client';

import { createContext, useContext, ReactNode, useMemo, useCallback } from 'react';
import * as Cesium from 'cesium';
import { dbLogger } from '@/utils/logging/dbLogger';

const SOURCE = 'CesiumContext';

// Define proper types for Cesium defaults
interface CesiumDefaults {
  animation: boolean;
  baseLayerPicker: boolean;
  fullscreenButton: boolean;
  geocoder: boolean;
  homeButton: boolean;
  navigationHelpButton: boolean;
  sceneModePicker: boolean;
  timeline: boolean;
}

// Define the context shape with proper types
interface CesiumContextType {
  getCesiumDefaults: () => CesiumDefaults;
  getTerrainProvider: () => Promise<Cesium.TerrainProvider>;
}

// Create the context with default values
const CesiumContext = createContext<CesiumContextType>({
  getCesiumDefaults: () => ({
    animation: false,
    baseLayerPicker: false,
    fullscreenButton: false,
    geocoder: false,
    homeButton: false,
    navigationHelpButton: false,
    sceneModePicker: false,
    timeline: false
  }),
  getTerrainProvider: async () => {
    // This is just a placeholder - it will be overridden by the provider
    return await Cesium.createWorldTerrainAsync();
  }
});

interface CesiumProviderProps {
  children: ReactNode;
}

export function CesiumProvider({ children }: CesiumProviderProps) {
  const getCesiumDefaults = useCallback((): CesiumDefaults => ({
    animation: false,
    baseLayerPicker: false,
    fullscreenButton: false,
    geocoder: false,
    homeButton: false,
    navigationHelpButton: false,
    sceneModePicker: false,
    timeline: false
  }), []);

  const getTerrainProvider = useCallback(async (): Promise<Cesium.TerrainProvider> => {
    try {
      await dbLogger.info('getTerrainProvider.start', { source: SOURCE });
      const terrainProvider = await Cesium.createWorldTerrainAsync();
      await dbLogger.info('getTerrainProvider.success', { source: SOURCE });
      return terrainProvider;
    } catch (error) {
      await dbLogger.error('getTerrainProvider.error', { source: SOURCE, error });
      throw error;
    }
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
export function useCesium(): CesiumContextType {
  const context = useContext(CesiumContext);
  if (context === undefined) {
    throw new Error('useCesium must be used within a CesiumProvider');
  }
  return context;
} 