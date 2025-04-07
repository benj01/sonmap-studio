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

interface NormalizedMapInstanceState {
  mapbox: {
    instance: MapboxMap | null;
    status: 'initializing' | 'ready' | 'error';
    error?: string;
  };
  cesium: {
    instance: any | null;
    instanceId: string | null;
    status: 'initializing' | 'ready' | 'error' | 'destroyed';
    error?: string;
  };
}

interface MapInstanceStore {
  // State
  mapInstances: NormalizedMapInstanceState;
  
  // Actions
  setMapboxInstance: (instance: MapboxMap | null) => void;
  setCesiumInstance: (instance: any | null, instanceId?: string) => void;
  setMapboxStatus: (status: NormalizedMapInstanceState['mapbox']['status'], error?: string) => void;
  setCesiumStatus: (status: NormalizedMapInstanceState['cesium']['status'], error?: string) => void;
  cleanup: () => void;
  reset: () => void;
}

const initialState: NormalizedMapInstanceState = {
  mapbox: {
    instance: null,
    status: 'initializing'
  },
  cesium: {
    instance: null,
    instanceId: null,
    status: 'initializing'
  }
};

export const useMapInstanceStore = create<MapInstanceStore>()((set) => ({
  // Initial state
  mapInstances: {
    ...initialState,
    cesium: {
      ...initialState.cesium,
      instanceId: null
    }
  },

  // Actions
  setMapboxInstance: (instance) => {
    set((state) => {
      const updatedMapbox = {
        ...state.mapInstances.mapbox,
        instance,
        status: instance ? 'ready' as const : 'initializing' as const
      };

      logger.debug('Mapbox instance set', { hasInstance: !!instance });
      return {
        mapInstances: {
          ...state.mapInstances,
          mapbox: updatedMapbox
        }
      };
    });
  },

  setCesiumInstance: (instance, instanceId) => {
    set((state) => {
      const updatedCesium = {
        ...state.mapInstances.cesium,
        instance,
        instanceId: instance ? instanceId || null : null,
        status: instance ? 'ready' as const : 'initializing' as const
      };

      logger.debug('Cesium instance set', { 
        hasInstance: !!instance,
        instanceId: updatedCesium.instanceId
      });
      return {
        mapInstances: {
          ...state.mapInstances,
          cesium: updatedCesium
        }
      };
    });
  },

  setMapboxStatus: (status, error) => {
    set((state) => {
      const updatedMapbox = {
        ...state.mapInstances.mapbox,
        status,
        error
      };

      logger.debug('Mapbox status updated', { status, error });
      return {
        mapInstances: {
          ...state.mapInstances,
          mapbox: updatedMapbox
        }
      };
    });
  },

  setCesiumStatus: (status, error) => {
    set((state) => {
      const updatedCesium = {
        ...state.mapInstances.cesium,
        status,
        error
      };

      logger.debug('Cesium status updated', { status, error });
      return {
        mapInstances: {
          ...state.mapInstances,
          cesium: updatedCesium
        }
      };
    });
  },

  cleanup: () => {
    set((state) => {
      // Only cleanup instances that are in an error state or explicitly marked for removal
      if (state.mapInstances.mapbox.instance && 
          (state.mapInstances.mapbox.status === 'error' || state.mapInstances.mapbox.instance._removed)) {
        state.mapInstances.mapbox.instance.remove();
      }
      if (state.mapInstances.cesium.instance && 
          (state.mapInstances.cesium.status === 'error' || 
           state.mapInstances.cesium.status === 'destroyed' || 
           state.mapInstances.cesium.instance._removed)) {
        state.mapInstances.cesium.instance.destroy();
      }

      // Only reset instances that were actually cleaned up
      return {
        mapInstances: {
          ...state.mapInstances,
          mapbox: state.mapInstances.mapbox.instance?._removed ? initialState.mapbox : state.mapInstances.mapbox,
          cesium: state.mapInstances.cesium.instance?._removed ? 
            { ...initialState.cesium, instanceId: null } : 
            state.mapInstances.cesium
        }
      };
    });
    logger.info('Map instances cleanup check complete');
  },

  reset: () => {
    set((state) => {
      // Clean up existing map instances
      if (state.mapInstances.mapbox.instance) {
        state.mapInstances.mapbox.instance.remove();
      }
      if (state.mapInstances.cesium.instance) {
        state.mapInstances.cesium.instance.destroy();
      }

      return {
        mapInstances: initialState
      };
    });
    logger.info('Map instance store reset');
  }
}));

// Map instance selectors
export const mapInstanceSelectors = {
  // Get Mapbox instance
  getMapboxInstance: (state: MapInstanceStore) => {
    return state.mapInstances.mapbox.instance;
  },

  // Get Cesium instance
  getCesiumInstance: (state: MapInstanceStore) => {
    return state.mapInstances.cesium.instance;
  },

  // Get Mapbox status
  getMapboxStatus: (state: MapInstanceStore) => {
    return state.mapInstances.mapbox.status;
  },

  // Get Cesium status
  getCesiumStatus: (state: MapInstanceStore) => {
    return state.mapInstances.cesium.status;
  },

  // Get Mapbox error
  getMapboxError: (state: MapInstanceStore) => {
    return state.mapInstances.mapbox.error;
  },

  // Get Cesium error
  getCesiumError: (state: MapInstanceStore) => {
    return state.mapInstances.cesium.error;
  },

  // Check if both instances are ready
  areInstancesReady: (state: MapInstanceStore) => {
    return state.mapInstances.mapbox.status === 'ready' && 
           state.mapInstances.cesium.status === 'ready';
  },

  // Check if any instance has an error
  hasInstanceError: (state: MapInstanceStore) => {
    return state.mapInstances.mapbox.status === 'error' || 
           state.mapInstances.cesium.status === 'error';
  }
};

// Custom hooks for map instance operations
export const useMapboxInstance = () => {
  return useMapInstanceStore(mapInstanceSelectors.getMapboxInstance);
};

export const useCesiumInstance = () => {
  return useMapInstanceStore(mapInstanceSelectors.getCesiumInstance);
};

export const useMapboxStatus = () => {
  return useMapInstanceStore(mapInstanceSelectors.getMapboxStatus);
};

export const useCesiumStatus = () => {
  return useMapInstanceStore(mapInstanceSelectors.getCesiumStatus);
};

export const useMapboxError = () => {
  return useMapInstanceStore(mapInstanceSelectors.getMapboxError);
};

export const useCesiumError = () => {
  return useMapInstanceStore(mapInstanceSelectors.getCesiumError);
};

export const useInstancesReady = () => {
  return useMapInstanceStore(mapInstanceSelectors.areInstancesReady);
};

export const useInstanceError = () => {
  return useMapInstanceStore(mapInstanceSelectors.hasInstanceError);
}; 