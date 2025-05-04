// MIGRATION: Logger usage migrated to async/await dbLogger. Legacy LogManager and inline logger removed.
// See debug.mdc and cursor_rules.mdc for migration details.

import { create } from 'zustand';
import { dbLogger } from '@/utils/logging/dbLogger';
import type { Viewer, Cesium3DTileset } from "cesium";
import type { CesiumWidget } from "@cesium/engine";

const SOURCE = 'mapInstanceStore';

// Union type for all supported Cesium instance types
export type CesiumInstance = Viewer | Cesium3DTileset | CesiumWidget | null;

interface NormalizedMapInstanceState {
  cesium: {
    instance: CesiumInstance;
    instanceId: string | null;
    status: 'initializing' | 'ready' | 'error' | 'destroyed';
    error?: string;
  };
}

interface MapInstanceStore {
  // State
  mapInstances: NormalizedMapInstanceState;
  
  // Actions
  setCesiumInstance: (instance: CesiumInstance, instanceId?: string) => void;
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

// Type guard for Cesium instances with _removed
function hasRemovedProp(obj: unknown): obj is { _removed: boolean } {
  return typeof obj === 'object' && obj !== null && '_removed' in obj;
}

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

      (async () => {
        await dbLogger.debug('Cesium instance set', {
          hasInstance: !!instance,
          instanceId: updatedCesium.instanceId,
          source: SOURCE
        });
      })();
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

      (async () => {
        await dbLogger.debug('Cesium status updated', { status, error, source: SOURCE });
      })();
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
      const cesiumInstance = state.mapInstances.cesium.instance;
      const status = state.mapInstances.cesium.status;
      let shouldDestroy = false;
      let isRemoved = false;
      if (cesiumInstance && (status === 'error' || status === 'destroyed')) {
        shouldDestroy = true;
      } else if (hasRemovedProp(cesiumInstance)) {
        isRemoved = cesiumInstance._removed;
        if (isRemoved) shouldDestroy = true;
      }
      if (shouldDestroy && cesiumInstance && typeof cesiumInstance.destroy === 'function') {
        cesiumInstance.destroy();
      }
      return {
        mapInstances: {
          ...state.mapInstances,
          cesium: isRemoved
            ? { ...initialState.cesium, instanceId: null }
            : state.mapInstances.cesium
        }
      };
    });
    (async () => {
      await dbLogger.info('Cesium instance cleanup check complete', { action: 'cleanup', source: SOURCE });
    })();
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
    (async () => {
      await dbLogger.info('Map instance store reset', { action: 'reset', source: SOURCE });
    })();
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