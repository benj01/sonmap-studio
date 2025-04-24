import { create } from 'zustand';
import { LogManager, LogLevel } from '@/core/logging/log-manager';
import { shallow } from 'zustand/shallow';
import { useCallback, useMemo } from 'react';
import type { Layer, LayerMetadata } from './types';
import { isEqual } from 'lodash';
import type { FeatureCollection } from 'geojson';

const SOURCE = 'layerStore';
const logManager = LogManager.getInstance();
logManager.setComponentLogLevel(SOURCE, LogLevel.DEBUG);

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

interface NormalizedLayerState {
  byId: Record<string, Layer>;
  allIds: string[];
  metadata: Record<string, LayerMetadata>;
}

export interface LayerStore {
  // State
  layers: NormalizedLayerState;
  isInitialLoadComplete: boolean;
  
  // Actions
  setLayerVisibility: (layerId: string, visible: boolean) => void;
  addLayer: (layerId: string, initialVisibility?: boolean, sourceId?: string, metadata?: LayerMetadata) => void;
  removeLayer: (layerId: string) => void;
  updateLayerStatus: (layerId: string, status: Layer['setupStatus'], error?: string) => void;
  handleFileDeleted: (fileId: string) => void;
  updateLayerStyle: (layerId: string, style: { paint?: Record<string, any>; layout?: Record<string, any> }, geometryTypes?: { hasPolygons: boolean; hasLines: boolean; hasPoints: boolean }) => void;
  updateLayerHeightSource: (layerId: string, heightSource: { type: 'z_coord' | 'attribute' | 'none'; attributeName?: string; }) => void;
  setInitialLoadComplete: (complete: boolean) => void;
  setLayerGeoJsonData: (layerId: string, geojsonData: FeatureCollection | null) => void;
  reset: () => void;
}

export const initialState: NormalizedLayerState = {
  byId: {},
  allIds: [],
  metadata: {}
};

// Layer selectors with detailed logging
export const layerSelectors = {
  getLayerById: (state: LayerStore) => (layerId: string): Layer | undefined => {
    logger.debug('SELECTOR RUN: getLayerById', { layerId });
    return state.layers.byId[layerId];
  },

  getAllLayers: (state: LayerStore): Layer[] => {
    logger.debug('SELECTOR RUN: getAllLayers', { 
      layerCount: state.layers.allIds.length
    });
    return state.layers.allIds.map(id => state.layers.byId[id]);
  },

  getVisibleLayers: (state: LayerStore): Layer[] => {
    logger.debug('SELECTOR RUN: getVisibleLayers', { 
      totalLayers: state.layers.allIds.length,
      visibleCount: state.layers.allIds.filter(id => state.layers.byId[id].visible).length
    });
    return state.layers.allIds
      .map(id => state.layers.byId[id])
      .filter(layer => layer.visible);
  },

  getLayerMetadata: (state: LayerStore) => (layerId: string): LayerMetadata | undefined => {
    logger.debug('SELECTOR RUN: getLayerMetadata', { layerId });
    return state.layers.metadata[layerId];
  },

  getLayersByStatus: (state: LayerStore) => (status: Layer['setupStatus']): Layer[] => {
    logger.debug('SELECTOR RUN: getLayersByStatus', { status });
    return state.layers.allIds
      .map(id => state.layers.byId[id])
      .filter(layer => layer.setupStatus === status);
  },

  getLayersWithErrors: (state: LayerStore): Layer[] => {
    logger.debug('SELECTOR RUN: getLayersWithErrors', { 
      totalLayers: state.layers.allIds.length,
      errorCount: state.layers.allIds.filter(id => state.layers.byId[id].error !== undefined).length
    });
    return state.layers.allIds
      .map(id => state.layers.byId[id])
      .filter(layer => layer.error !== undefined);
  }
};

// Create store with shallow equality support
export const useLayerStore = create<LayerStore>()((set, get) => ({
  // Initial state
  layers: initialState,
  isInitialLoadComplete: false,

  // Actions
  setLayerVisibility: (layerId, visible) => {
    logger.debug('ACTION START: setLayerVisibility', { layerId, visible });
    set((state) => {
      const layer = state.layers.byId[layerId];
      logger.debug('LAYER BEFORE VISIBILITY TOGGLE', { layer });
      if (!layer || layer.visible === visible) {
        logger.debug('ACTION SKIP: setLayerVisibility - no change needed', { layerId, visible });
        return state;
      }
      const updatedLayer = { ...layer, visible };
      const updatedById = {
        ...state.layers.byId,
        [layerId]: updatedLayer
      };
      logger.debug('LAYER AFTER VISIBILITY TOGGLE', { updatedLayer });
      logger.debug('ALL LAYERS AFTER VISIBILITY TOGGLE', {
        allIds: state.layers.allIds,
        byId: Object.entries(updatedById).map(([id, l]) => ({
          id,
          visible: l.visible,
          setupStatus: l.setupStatus,
          metadata: l.metadata
        }))
      });
      logger.debug('ACTION END: setLayerVisibility', { layerId, visible });
      return {
        layers: {
          ...state.layers,
          byId: updatedById
        }
      };
    });
  },

  addLayer: (layerId, initialVisibility = true, sourceId, metadata) => {
    logger.debug('ACTION START: addLayer', { layerId, initialVisibility, sourceId, hasMetadata: !!metadata });
    set((state) => {
      if (state.layers.byId[layerId]) {
        logger.debug('ACTION SKIP: addLayer - layer already exists', { layerId });
        return state;
      }

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

      logger.debug('ACTION END: addLayer', { 
        layerId, 
        storeState: {
          byId: Object.keys(updatedById),
          allIds: updatedAllIds,
          metadata: Object.keys(updatedMetadata)
        }
      });
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
    logger.debug('ACTION START: removeLayer', { layerId });
    set((state) => {
      if (!state.layers.byId[layerId]) {
        logger.debug('ACTION SKIP: removeLayer - layer does not exist', { layerId });
        return state;
      }

      const { [layerId]: removedLayer, ...updatedById } = state.layers.byId;
      const updatedAllIds = state.layers.allIds.filter(id => id !== layerId);
      const { [layerId]: removedMetadata, ...updatedMetadata } = state.layers.metadata;

      logger.debug('ACTION END: removeLayer', { layerId });
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
    logger.debug('ACTION START: updateLayerStatus', { layerId, status, error });
    set((state) => {
      const layer = state.layers.byId[layerId];
      if (!layer) {
        logger.debug('ACTION SKIP: updateLayerStatus - layer not found', { layerId });
        return state;
      }

      // Check if any relevant fields actually changed
      const statusChanged = layer.setupStatus !== status;
      const errorChanged = layer.error !== error;
      const addedChanged = layer.added !== (status === 'complete');

      if (!statusChanged && !errorChanged && !addedChanged) {
        logger.debug('ACTION SKIP: updateLayerStatus - no changes needed', { 
          layerId, 
          status, 
          error,
          currentState: {
            status: layer.setupStatus,
            error: layer.error,
            added: layer.added
          }
        });
        return state;
      }

      // Create a new object ONLY for the updated layer
      const updatedLayer = {
        ...layer,
        setupStatus: status,
        error: error,
        added: status === 'complete'
      };

      // Create a new byId object, replacing only the updated layer
      const updatedById = {
        ...state.layers.byId,
        [layerId]: updatedLayer
      };

      logger.debug('ACTION END: updateLayerStatus', { 
        layerId, 
        status, 
        error,
        changes: {
          statusChanged,
          errorChanged,
          addedChanged
        },
        references: {
          layerRefChanged: layer !== updatedLayer,
          byIdRefChanged: state.layers.byId !== updatedById,
          layersRefChanged: state.layers.byId !== updatedById
        }
      });

      // Return new state object, keeping refs for unchanged parts
      return {
        layers: {
          ...state.layers,
          byId: updatedById
        }
      };
    });
  },

  handleFileDeleted: (fileId: string) => {
    logger.debug('ACTION START: handleFileDeleted', { fileId });
    set((state) => {
      const layersToRemove: string[] = [];

      // Find all layers associated with the deleted file
      Object.entries(state.layers.metadata).forEach(([layerId, metadata]) => {
        if (metadata.fileId === fileId) {
          layersToRemove.push(layerId);
        }
      });

      if (layersToRemove.length === 0) {
        logger.debug('ACTION SKIP: handleFileDeleted - no layers to remove', { fileId });
        return state;
      }

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

      logger.debug('ACTION END: handleFileDeleted', { fileId, removedLayers: layersToRemove });
      return {
        layers: {
          byId: updatedById,
          allIds: updatedAllIds,
          metadata: updatedMetadata
        }
      };
    });
  },

  updateLayerStyle: (layerId: string, style: { paint?: Record<string, any>; layout?: Record<string, any> }, geometryTypes?: { hasPolygons: boolean; hasLines: boolean; hasPoints: boolean }) => {
    logger.debug('ACTION START: updateLayerStyle', { layerId, style, geometryTypes });
    set((state) => {
      const layer = state.layers.byId[layerId];
      if (!layer) {
        logger.debug('ACTION SKIP: updateLayerStyle - layer does not exist', { layerId });
        return state;
      }

      // Create new style object with deep cloning of existing properties
      const currentMetadata = state.layers.metadata[layerId] || { name: '', type: '', properties: {} };
      const currentStyle = currentMetadata.style || {};
      const currentPaint = currentStyle.paint || {};
      const currentLayout = currentStyle.layout || {};

      // Create new paint and layout objects
      const newPaint = style.paint 
        ? { ...currentPaint, ...style.paint }
        : currentPaint;

      const newLayout = style.layout
        ? { ...currentLayout, ...style.layout }
        : currentLayout;

      // Create new style object
      const newStyle = {
        ...currentStyle,
        paint: newPaint,
        layout: newLayout
      };

      // Create new metadata object
      const newMetadata: LayerMetadata = {
        ...currentMetadata,
        style: newStyle,
        geometryTypes: geometryTypes || currentMetadata.geometryTypes
      };

      logger.debug('ACTION UPDATE: updateLayerStyle', { 
        layerId, 
        oldPaint: currentPaint,
        newPaint,
        paintChanged: newPaint !== currentPaint,
        styleChanged: newStyle !== currentStyle,
        metadataChanged: newMetadata !== currentMetadata,
        geometryTypesChanged: geometryTypes && !isEqual(geometryTypes, currentMetadata.geometryTypes)
      });

      // Create new layer object
      const newLayer = {
        ...layer,
        metadata: newMetadata
      };

      // Create new state with all new objects
      return {
        layers: {
          ...state.layers,
          metadata: {
            ...state.layers.metadata,
            [layerId]: newMetadata
          },
          byId: {
            ...state.layers.byId,
            [layerId]: newLayer
          }
        }
      };
    });
  },

  updateLayerHeightSource: (layerId: string, heightSource: { type: 'z_coord' | 'attribute' | 'none'; attributeName?: string; }) => {
    logger.debug('ACTION START: updateLayerHeightSource', { layerId, heightSource });
    set((state) => {
      const layer = state.layers.byId[layerId];
      if (!layer) {
        logger.debug('ACTION SKIP: updateLayerHeightSource - layer does not exist', { layerId });
        return state;
      }

      // Get current metadata or create new one
      const currentMetadata = state.layers.metadata[layerId] || { name: layerId, type: 'vector', properties: {} };
      
      // Create new metadata object with the height source information
      const newMetadata: LayerMetadata = {
        ...currentMetadata,
        height: {
          ...currentMetadata.height,
          sourceType: heightSource.type,
          attributeName: heightSource.attributeName
        }
      };

      // Create new layer object
      const newLayer = {
        ...layer,
        metadata: newMetadata
      };

      logger.debug('ACTION END: updateLayerHeightSource', { 
        layerId,
        heightSourceType: heightSource.type,
        attributeName: heightSource.attributeName
      });

      return {
        layers: {
          ...state.layers,
          metadata: {
            ...state.layers.metadata,
            [layerId]: newMetadata
          },
          byId: {
            ...state.layers.byId,
            [layerId]: newLayer
          }
        }
      };
    });
  },

  setInitialLoadComplete: (complete: boolean) => {
    logger.debug('ACTION START: setInitialLoadComplete', { complete });
    set({ isInitialLoadComplete: complete });
    logger.debug('ACTION END: setInitialLoadComplete', { complete });
  },

  setLayerGeoJsonData: (layerId, geojsonData) => {
    logger.debug('ACTION START: setLayerGeoJsonData', { layerId, hasData: !!geojsonData });
    set((state) => {
      const layer = state.layers.byId[layerId];
      if (!layer) {
        logger.warn('ACTION SKIP: setLayerGeoJsonData - layer not found', { layerId });
        return state;
      }

      // Get current metadata or create new one
      const currentMetadata = layer.metadata || {
        name: layerId,
        type: 'vector',
        properties: {}
      };

      // Check if data is identical
      if (isEqual(currentMetadata.properties?.geojson, geojsonData)) {
        logger.debug('ACTION SKIP: setLayerGeoJsonData - GeoJSON data is already the same', { layerId });
        return state;
      }

      // Create new metadata object immutably
      const newMetadata: LayerMetadata = {
        ...currentMetadata,
        properties: {
          ...currentMetadata.properties,
          geojson: geojsonData
        }
      };

      // Create new layer object with updated metadata
      const newLayer: Layer = {
        ...layer,
        metadata: newMetadata
      };

      logger.debug('ACTION END: setLayerGeoJsonData', { 
        layerId,
        hasGeojson: !!geojsonData,
        featureCount: geojsonData?.features?.length
      });

      return {
        layers: {
          ...state.layers,
          byId: {
            ...state.layers.byId,
            [layerId]: newLayer
          },
          metadata: {
            ...state.layers.metadata,
            [layerId]: newMetadata
          }
        }
      };
    });
  },

  reset: () => {
    logger.debug('ACTION START: reset');
    set({ 
      layers: initialState,
      isInitialLoadComplete: false 
    });
    logger.debug('ACTION END: reset');
  }
}));

// Custom hooks for layer operations
export const useLayer = (layerId: string) => {
  logger.debug('HOOK RUN: useLayer', { layerId });
  const store = useLayerStore();
  const layer = useLayerStore((state) => layerSelectors.getLayerById(state)(layerId));
  const metadata = useLayerStore((state) => layerSelectors.getLayerMetadata(state)(layerId));

  const setVisibility = useCallback((visible: boolean) => {
    logger.debug('HOOK ACTION: useLayer.setVisibility', { layerId, visible });
    store.setLayerVisibility(layerId, visible);
  }, [layerId, store]);

  const updateStatus = useCallback((status: Layer['setupStatus'], error?: string) => {
    logger.debug('HOOK ACTION: useLayer.updateStatus', { layerId, status, error });
    store.updateLayerStatus(layerId, status, error);
  }, [layerId, store]);

  const updateStyle = useCallback((style: { paint?: Record<string, any>; layout?: Record<string, any> }) => {
    logger.debug('HOOK ACTION: useLayer.updateStyle', { layerId, style });
    store.updateLayerStyle(layerId, style);
  }, [layerId, store]);

  const remove = useCallback(() => {
    logger.debug('HOOK ACTION: useLayer.remove', { layerId });
    store.removeLayer(layerId);
  }, [layerId, store]);

  return {
    layer,
    metadata,
    setVisibility,
    updateStatus,
    updateStyle,
    remove,
    isVisible: layer?.visible ?? false,
    setupStatus: layer?.setupStatus ?? 'pending',
    error: layer?.error
  };
};

export const useLayers = () => {
  logger.debug('HOOK RUN: useLayers');
  const store = useLayerStore();
  
  // Select primitive state parts
  const allIds = useLayerStore((state: LayerStore) => state.layers.allIds);
  const byId = useLayerStore((state: LayerStore) => state.layers.byId);

  // Memoize the layers array construction with more granular dependencies
  const layers = useMemo(() => {
    logger.debug('HOOK MEMO: Recomputing layers array', { 
      idCount: allIds.length,
      byIdKeys: Object.keys(byId)
    });
    return allIds.map(id => byId[id]);
  }, [allIds, byId]);

  // Use selectors with built-in memoization
  const visibleLayers = useLayerStore((state: LayerStore) => layerSelectors.getVisibleLayers(state));
  const layersWithErrors = useLayerStore((state: LayerStore) => layerSelectors.getLayersWithErrors(state));

  // Select and stabilize store actions
  const storeActions = useLayerStore((state: LayerStore) => ({
    addLayer: state.addLayer,
    removeLayer: state.removeLayer,
    handleFileDeleted: state.handleFileDeleted
  }));

  logger.debug('HOOK STATE: useLayers', {
    layerCount: layers.length,
    layers: layers.map(l => ({
      id: l.id,
      hasMetadata: !!l.metadata,
      visible: l.visible,
      setupStatus: l.setupStatus,
      error: l.error
    })),
    visibleLayerCount: visibleLayers.length,
    errorCount: layersWithErrors.length
  });

  const addLayer = useCallback((
    layerId: string,
    initialVisibility: boolean = true,
    sourceId?: string,
    metadata?: LayerMetadata
  ) => {
    logger.debug('HOOK ACTION: useLayers.addLayer', {
      layerId,
      initialVisibility,
      sourceId,
      hasMetadata: !!metadata
    });
    storeActions.addLayer(layerId, initialVisibility, sourceId, metadata);
  }, [storeActions]);

  const removeLayer = useCallback((layerId: string) => {
    logger.debug('HOOK ACTION: useLayers.removeLayer', { layerId });
    storeActions.removeLayer(layerId);
  }, [storeActions]);

  return {
    layers,
    visibleLayers,
    layersWithErrors,
    addLayer,
    removeLayer,
    handleFileDeleted: storeActions.handleFileDeleted
  };
};

export const useLayerStatus = (layerId: string) => {
  logger.debug('HOOK RUN: useLayerStatus', { layerId });
  const store = useLayerStore();
  const layer = useLayerStore((state) => layerSelectors.getLayerById(state)(layerId));

  const updateStatus = useCallback((status: Layer['setupStatus'], error?: string) => {
    logger.debug('HOOK ACTION: useLayerStatus.updateStatus', { layerId, status, error });
    store.updateLayerStatus(layerId, status, error);
  }, [layerId, store]);

  return {
    status: layer?.setupStatus ?? 'pending',
    error: layer?.error,
    updateStatus
  };
};

export const useLayerVisibility = (layerId: string) => {
  logger.debug('HOOK RUN: useLayerVisibility', { layerId });
  const store = useLayerStore();
  const layer = useLayerStore((state) => layerSelectors.getLayerById(state)(layerId));

  const setVisibility = useCallback((visible: boolean) => {
    logger.debug('HOOK ACTION: useLayerVisibility.setVisibility', { layerId, visible });
    store.setLayerVisibility(layerId, visible);
  }, [layerId, store]);

  return {
    isVisible: layer?.visible ?? false,
    setVisibility
  };
}; 