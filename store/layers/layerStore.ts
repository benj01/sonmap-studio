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
      if (!layer || layer.visible === visible) return state; // No change needed

      const updatedLayer = { ...layer, visible };
      const updatedById = {
        ...state.layers.byId,
        [layerId]: updatedLayer
      };

      logger.debug('Layer visibility updated', { layerId, visible });
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
      if (state.layers.byId[layerId]) return state; // Layer already exists

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
        ? {
            ...state.layers.metadata,
            [layerId]: metadata
          }
        : state.layers.metadata;

      logger.debug('Layer added to store', { layerId, sourceId, initialVisibility, metadata });
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
      if (!state.layers.byId[layerId]) return state; // Layer doesn't exist

      const { [layerId]: removedLayer, ...updatedById } = state.layers.byId;
      const updatedAllIds = state.layers.allIds.filter(id => id !== layerId);
      const { [layerId]: removedMetadata, ...updatedMetadata } = state.layers.metadata;

      logger.debug('Layer removed', { layerId });
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
        return state; // No change needed
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

      logger.debug('Layer status updated', { layerId, status, error });
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
      const layersToRemove: string[] = [];

      // Find all layers associated with the deleted file
      Object.entries(state.layers.metadata).forEach(([layerId, metadata]) => {
        if (metadata.fileId === fileId) {
          layersToRemove.push(layerId);
        }
      });

      // Remove each layer
      const updatedById = { ...state.layers.byId };
      const updatedAllIds = [...state.layers.allIds];
      const updatedMetadata = { ...state.layers.metadata };

      layersToRemove.forEach(layerId => {
        delete updatedById[layerId];
        const index = updatedAllIds.indexOf(layerId);
        if (index > -1) {
          updatedAllIds.splice(index, 1);
        }
        delete updatedMetadata[layerId];
      });

      logger.debug('Layers removed for deleted file', { fileId, removedLayers: layersToRemove });
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
    logger.info('Layer store reset');
  }
}));

// Layer selectors
export const layerSelectors = {
  // Get a single layer by ID
  getLayerById: (state: LayerStore) => (layerId: string) => {
    return state.layers.byId[layerId];
  },

  // Get all layers
  getAllLayers: (state: LayerStore) => {
    return state.layers.allIds.map(id => state.layers.byId[id]);
  },

  // Get visible layers
  getVisibleLayers: (state: LayerStore) => {
    return state.layers.allIds
      .map(id => state.layers.byId[id])
      .filter(layer => layer.visible);
  },

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
  getLayersWithErrors: (state: LayerStore) => {
    return state.layers.allIds
      .map(id => state.layers.byId[id])
      .filter(layer => layer.error);
  }
};

// Custom hooks for layer operations
export const useLayer = (layerId: string) => {
  return useLayerStore((state) => layerSelectors.getLayerById(state)(layerId));
};

export const useLayers = () => {
  return useLayerStore(layerSelectors.getAllLayers);
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