import { create } from 'zustand';
import { LogManager } from '@/core/logging/log-manager';
import type { Map as MapboxMap } from 'mapbox-gl';

const SOURCE = 'mapInstanceStore';
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

interface MapInstanceStore {
  // State
  mapboxInstance: MapboxMap | null;
  cesiumInstance: any | null;
  
  // Actions
  setMapboxInstance: (instance: MapboxMap | null) => void;
  setCesiumInstance: (instance: any | null) => void;
  cleanup: () => void;
  reset: () => void;
}

export const useMapInstanceStore = create<MapInstanceStore>()((set) => ({
  // Initial state
  mapboxInstance: null,
  cesiumInstance: null,

  // Actions
  setMapboxInstance: (instance) => {
    set({ mapboxInstance: instance });
    logger.debug('Mapbox instance set', { hasInstance: !!instance });
  },

  setCesiumInstance: (instance) => {
    set({ cesiumInstance: instance });
    logger.debug('Cesium instance set', { hasInstance: !!instance });
  },

  cleanup: () => {
    set((state) => {
      // Cleanup map instances
      if (state.mapboxInstance) {
        state.mapboxInstance.remove();
      }
      if (state.cesiumInstance) {
        state.cesiumInstance.destroy();
      }
      return {
        mapboxInstance: null,
        cesiumInstance: null
      };
    });
    logger.info('Map instances cleaned up');
  },

  reset: () => {
    set((state) => {
      // Clean up existing map instances
      if (state.mapboxInstance) {
        state.mapboxInstance.remove();
      }
      if (state.cesiumInstance) {
        state.cesiumInstance.destroy();
      }

      return {
        mapboxInstance: null,
        cesiumInstance: null
      };
    });
    logger.info('Map instance store reset');
  }
})); 