import { create } from 'zustand';
import { LogManager } from '@/core/logging/log-manager';

const SOURCE = 'layerStore';
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

// Cache for memoized selectors
const selectorCache = new WeakMap();

// Helper function to create a memoized selector
function createMemoizedSelector<T>(selector: (state: LayerStore) => T): (state: LayerStore) => T {
  return (state: LayerStore) => {
    if (!selectorCache.has(state)) {
      selectorCache.set(state, selector(state));
    }
    return selectorCache.get(state);
  };
}

export interface LayerMetadata {
  name: string;
  type: string;
  properties: Record<string, any>;
  fileId?: string;
}

export interface Layer {
  id: string;
  sourceId?: string;
  visible: boolean;
  added: boolean;
  setupStatus: 'pending' | 'adding' | 'complete' | 'error';
  metadata?: LayerMetadata;
  error?: string;
}

interface NormalizedLayerState {
  byId: Record<string, Layer>;
  allIds: string[];
  metadata: Record<string, LayerMetadata>;
}

interface LayerStore {
  // State
  layers: NormalizedLayerState;
  
  // Actions
  setLayerVisibility: (layerId: string, visible: boolean) => void;
  addLayer: (layerId: string, initialVisibility?: boolean, sourceId?: string, metadata?: LayerMetadata) => void;
  removeLayer: (layerId: string) => void;
  updateLayerStatus: (layerId: string, status: Layer['setupStatus'], error?: string) => void;
  handleFileDeleted: (fileId: string) => void;
  reset: () => void;
}

const initialState: NormalizedLayerState = {
  byId: {},
  allIds: [],
  metadata: {}
};

export const useLayerStore = create<LayerStore>()((set, get) => ({
  // Initial state
  layers: initialState,

  // Actions
  setLayerVisibility: (layerId, visible) => {
    set((state) => {
      const layer = state.layers.byId[layerId];
      if (!layer || layer.visible === visible) return state;

      const updatedLayer = { ...layer, visible };
      const updatedById = {
        ...state.layers.byId,
        [layerId]: updatedLayer
      };

      return {
        layers: {
          ...state.layers,
          byId: updatedById
        }
      };
    });
  },

  addLayer: (layerId, initialVisibility = true, sourceId, metadata) => {
    set((state) => {
      if (state.layers.byId[layerId]) return state;

      const newLayer: Layer = {
        id: layerId,
        sourceId,
        visible: initialVisibility,
        added: false,
        setupStatus: 'pending',
        metadata
      };

      const updatedById = {
        ...state.layers.byId,
        [layerId]: newLayer
      };

      const updatedAllIds = [...state.layers.allIds, layerId];
      const updatedMetadata = metadata
        ? { ...state.layers.metadata, [layerId]: metadata }
        : state.layers.metadata;

      logger.debug(`Layer added: ${layerId}`);
      return {
        layers: {
          byId: updatedById,
          allIds: updatedAllIds,
          metadata: updatedMetadata
        }
      };
    });
  },

  removeLayer: (layerId) => {
    set((state) => {
      if (!state.layers.byId[layerId]) return state;

      const { [layerId]: removedLayer, ...updatedById } = state.layers.byId;
      const updatedAllIds = state.layers.allIds.filter(id => id !== layerId);
      const { [layerId]: removedMetadata, ...updatedMetadata } = state.layers.metadata;

      logger.debug(`Layer removed: ${layerId}`);
      return {
        layers: {
          byId: updatedById,
          allIds: updatedAllIds,
          metadata: updatedMetadata
        }
      };
    });
  },

  updateLayerStatus: (layerId: string, status: Layer['setupStatus'], error?: string) => {
    set((state) => {
      const layer = state.layers.byId[layerId];
      if (!layer || (layer.setupStatus === status && layer.error === error)) {
        return state;
      }

      const updatedLayer = {
        ...layer,
        setupStatus: status,
        error: error,
        added: status === 'complete'
      };

      const updatedById = {
        ...state.layers.byId,
        [layerId]: updatedLayer
      };

      if (error) {
        logger.error(`Layer error: ${layerId}`, { error });
      }

      return {
        layers: {
          ...state.layers,
          byId: updatedById
        }
      };
    });
  },

  handleFileDeleted: (fileId: string) => {
    set((state) => {
      const layersToRemove = state.layers.allIds
        .map(id => state.layers.byId[id])
        .filter(layer => layer.metadata?.fileId === fileId);

      if (layersToRemove.length === 0) return state;

      const updatedById = { ...state.layers.byId };
      const updatedMetadata = { ...state.layers.metadata };

      layersToRemove.forEach(layer => {
        delete updatedById[layer.id];
        delete updatedMetadata[layer.id];
      });

      const updatedAllIds = state.layers.allIds.filter(id => !layersToRemove.some(l => l.id === id));

      logger.debug(`Removed ${layersToRemove.length} layers for deleted file: ${fileId}`);
      return {
        layers: {
          byId: updatedById,
          allIds: updatedAllIds,
          metadata: updatedMetadata
        }
      };
    });
  },

  reset: () => {
    set({ layers: initialState });
  }
}));

// Layer selectors
export const layerSelectors = {
  // Get a single layer by ID
  getLayerById: (state: LayerStore) => (layerId: string) => {
    return state.layers.byId[layerId];
  },

  // Get all layers
  getAllLayers: createMemoizedSelector((state: LayerStore) => {
    return state.layers.allIds.map(id => state.layers.byId[id]);
  }),

  // Get visible layers
  getVisibleLayers: createMemoizedSelector((state: LayerStore) => {
    return state.layers.allIds
      .map(id => state.layers.byId[id])
      .filter(layer => layer.visible);
  }),

  // Get layer metadata
  getLayerMetadata: (state: LayerStore) => (layerId: string) => {
    return state.layers.metadata[layerId];
  },

  // Get layers by setup status
  getLayersByStatus: (state: LayerStore) => (status: Layer['setupStatus']) => {
    return state.layers.allIds
      .map(id => state.layers.byId[id])
      .filter(layer => layer.setupStatus === status);
  },

  // Get layers with errors
  getLayersWithErrors: createMemoizedSelector((state: LayerStore) => {
    return state.layers.allIds
      .map(id => state.layers.byId[id])
      .filter(layer => layer.error !== undefined);
  })
};

// Custom hooks for layer operations
export const useLayer = (layerId: string) => {
  return useLayerStore((state) => layerSelectors.getLayerById(state)(layerId));
};

export const useLayers = () => {
  const store = useLayerStore();
  const layers = useLayerStore((state) => state.layers.allIds.map(id => state.layers.byId[id]));
  const visibleLayers = useLayerStore((state) => state.layers.allIds
    .map(id => state.layers.byId[id])
    .filter(layer => layer.visible));

  return {
    layers,
    visibleLayers
  };
};

export const useVisibleLayers = () => {
  return useLayerStore(layerSelectors.getVisibleLayers);
};

export const useLayerMetadata = (layerId: string) => {
  return useLayerStore((state) => layerSelectors.getLayerMetadata(state)(layerId));
};

export const useLayersByStatus = (status: Layer['setupStatus']) => {
  return useLayerStore((state) => layerSelectors.getLayersByStatus(state)(status));
};

export const useLayersWithErrors = () => {
  return useLayerStore(layerSelectors.getLayersWithErrors);
}; 