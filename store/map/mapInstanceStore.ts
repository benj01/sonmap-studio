import { create } from 'zustand';
import { LogManager } from '@/core/logging/log-manager';

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
  setCesiumInstance: (instance: any | null, instanceId?: string) => void;
  setCesiumStatus: (status: NormalizedMapInstanceState['cesium']['status'], error?: string) => void;
  cleanup: () => void;
  reset: () => void;
}

const initialState: NormalizedMapInstanceState = {
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
      if (state.mapInstances.cesium.instance && 
          (state.mapInstances.cesium.status === 'error' || 
           state.mapInstances.cesium.status === 'destroyed' || 
           state.mapInstances.cesium.instance._removed)) {
        state.mapInstances.cesium.instance.destroy();
      }
      return {
        mapInstances: {
          ...state.mapInstances,
          cesium: state.mapInstances.cesium.instance?._removed ? 
            { ...initialState.cesium, instanceId: null } : 
            state.mapInstances.cesium
        }
      };
    });
    logger.info('Cesium instance cleanup check complete');
  },

  reset: () => {
    set((state) => {
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

// Map instance selectors (Cesium only)
export const mapInstanceSelectors = {
  // Get Cesium instance
  getCesiumInstance: (state: MapInstanceStore) => {
    return state.mapInstances.cesium.instance;
  },

  // Get Cesium status
  getCesiumStatus: (state: MapInstanceStore) => {
    return state.mapInstances.cesium.status;
  },

  // Get Cesium error
  getCesiumError: (state: MapInstanceStore) => {
    return state.mapInstances.cesium.error;
  }
};

// Custom hooks for Cesium instance operations only
export const useCesiumInstance = () => {
  return useMapInstanceStore(mapInstanceSelectors.getCesiumInstance);
};

export const useCesiumStatus = () => {
  return useMapInstanceStore(mapInstanceSelectors.getCesiumStatus);
};

export const useCesiumError = () => {
  return useMapInstanceStore(mapInstanceSelectors.getCesiumError);
}; 