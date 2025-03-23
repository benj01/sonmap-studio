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

export interface LayerState {
  id: string;
  sourceId?: string;
  visible: boolean;
  added: boolean;
  setupStatus: 'pending' | 'adding' | 'complete' | 'error';
  metadata?: LayerMetadata;
  error?: string;
}

interface LayerStore {
  // State
  layers: Map<string, LayerState>;
  
  // Actions
  setLayerVisibility: (layerId: string, visible: boolean) => void;
  addLayer: (layerId: string, initialVisibility?: boolean, sourceId?: string, metadata?: LayerMetadata) => void;
  removeLayer: (layerId: string) => void;
  updateLayerStatus: (layerId: string, status: LayerState['setupStatus'], error?: string) => void;
  handleFileDeleted: (fileId: string) => void;
  reset: () => void;
}

export const useLayerStore = create<LayerStore>()((set, get) => ({
  // Initial state
  layers: new Map(),

  // Actions
  setLayerVisibility: (layerId, visible) => {
    set((state) => {
      const layer = state.layers.get(layerId);
      if (!layer || layer.visible === visible) return state; // No change needed

      state.layers.set(layerId, { ...layer, visible });
      logger.debug('Layer visibility updated', { layerId, visible });
      return { layers: new Map(state.layers) };
    });
  },

  addLayer: (layerId, initialVisibility = true, sourceId, metadata) => {
    set((state) => {
      if (state.layers.has(layerId)) return state; // Layer already exists

      state.layers.set(layerId, {
        id: layerId,
        sourceId,
        visible: initialVisibility,
        added: false,
        setupStatus: 'pending',
        metadata
      });
      logger.debug('Layer added to store', { layerId, sourceId, initialVisibility, metadata });
      return { layers: new Map(state.layers) };
    });
  },

  removeLayer: (layerId) => {
    set((state) => {
      const layer = state.layers.get(layerId);
      if (!layer) return state; // Layer doesn't exist
      
      state.layers.delete(layerId);
      logger.debug('Layer removed', { layerId });
      return { layers: new Map(state.layers) };
    });
  },

  updateLayerStatus: (layerId: string, status: LayerState['setupStatus'], error?: string) => {
    set((state) => {
      const layer = state.layers.get(layerId);
      if (!layer || (layer.setupStatus === status && layer.error === error)) {
        return state; // No change needed
      }

      state.layers.set(layerId, {
        ...layer,
        setupStatus: status,
        error: error,
        added: status === 'complete'
      });
      logger.debug('Layer status updated', { layerId, status, error });
      return { layers: new Map(state.layers) };
    });
  },

  handleFileDeleted: (fileId: string) => {
    set((state) => {
      const newLayers = new Map(state.layers);
      const layersToRemove: string[] = [];

      // Find all layers associated with the deleted file
      newLayers.forEach((layer, layerId) => {
        if (layer.metadata?.fileId === fileId) {
          layersToRemove.push(layerId);
        }
      });

      // Remove each layer
      layersToRemove.forEach(layerId => {
        newLayers.delete(layerId);
      });

      logger.debug('Layers removed for deleted file', { fileId, removedLayers: layersToRemove });
      return { layers: newLayers };
    });
  },

  reset: () => {
    set({ layers: new Map() });
    logger.info('Layer store reset');
  }
})); 