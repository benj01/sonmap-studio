import { create } from 'zustand';
import { dbLogger } from '@/utils/logging/dbLogger';
import { useCallback, useMemo } from 'react';
import type { Layer, LayerMetadata } from './types';
import { isEqual } from 'lodash';
import type { FeatureCollection } from 'geojson';

const SOURCE = 'layerStore';

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
  updateLayerStyle: (layerId: string, style: { paint?: Record<string, unknown>; layout?: Record<string, unknown> }, geometryTypes?: { hasPolygons: boolean; hasLines: boolean; hasPoints: boolean }) => void;
  updateLayerHeightSource: (layerId: string, heightSource: { 
    mode: 'simple' | 'advanced'; 
    type?: 'z_coord' | 'attribute' | 'none'; 
    attributeName?: string; 
    interpretationMode?: 'absolute' | 'relative' | 'extrusion';
    advanced?: {
      baseElevation: {
        source: 'z_coord' | 'attribute' | 'terrain';
        attributeName?: string;
        isAbsolute: boolean;
      };
      heightConfig: {
        source: 'attribute' | 'calculated' | 'none';
        attributeName?: string;
        isRelative: boolean;
      };
      visualization: {
        type: 'extrusion' | 'point_elevation' | 'line_elevation';
        extrudedFaces?: boolean;
        extrudedTop?: boolean;
      };
    };
  }) => void;
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
    return state.layers.byId[layerId];
  },

  getAllLayers: (state: LayerStore): Layer[] => {
    return state.layers.allIds.map(id => state.layers.byId[id]);
  },

  getVisibleLayers: (state: LayerStore): Layer[] => {
    return state.layers.allIds
      .map(id => state.layers.byId[id])
      .filter(layer => layer.visible);
  },

  getLayerMetadata: (state: LayerStore) => (layerId: string): LayerMetadata | undefined => {
    return state.layers.metadata[layerId];
  },

  getLayersByStatus: (state: LayerStore) => (status: Layer['setupStatus']): Layer[] => {
    return state.layers.allIds
      .map(id => state.layers.byId[id])
      .filter(layer => layer.setupStatus === status);
  },

  getLayersWithErrors: (state: LayerStore): Layer[] => {
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
    const layer = get().layers.byId[layerId];
    if (!layer || layer.visible === visible) {
      return;
    }
    const updatedLayer = { ...layer, visible };
    const updatedById = {
      ...get().layers.byId,
      [layerId]: updatedLayer
    };
    set({
      layers: {
        ...get().layers,
        byId: updatedById
      }
    });
  },

  addLayer: (layerId, initialVisibility = true, sourceId, metadata) => {
    if (get().layers.byId[layerId]) {
      return;
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
      ...get().layers.byId,
      [layerId]: newLayer
    };

    const updatedAllIds = [...get().layers.allIds, layerId];

    const updatedMetadata = metadata
      ? {
          ...get().layers.metadata,
          [layerId]: metadata
        }
      : get().layers.metadata;

    set({
      layers: {
        byId: updatedById,
        allIds: updatedAllIds,
        metadata: updatedMetadata
      }
    });
  },

  removeLayer: (layerId) => {
    if (!get().layers.byId[layerId]) {
      return;
    }

    const updatedById = Object.fromEntries(Object.entries(get().layers.byId).filter(([id]) => id !== layerId));
    const updatedAllIds = get().layers.allIds.filter(id => id !== layerId);
    const updatedMetadata = Object.fromEntries(Object.entries(get().layers.metadata).filter(([id]) => id !== layerId));

    set({
      layers: {
        byId: updatedById,
        allIds: updatedAllIds,
        metadata: updatedMetadata
      }
    });
  },

  updateLayerStatus: (layerId: string, status: Layer['setupStatus'], error?: string) => {
    const layer = get().layers.byId[layerId];
    if (!layer) {
      return;
    }

    // Check if any relevant fields actually changed
    const statusChanged = layer.setupStatus !== status;
    const errorChanged = layer.error !== error;
    const addedChanged = layer.added !== (status === 'complete');

    if (!statusChanged && !errorChanged && !addedChanged) {
      return;
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
      ...get().layers.byId,
      [layerId]: updatedLayer
    };

    set({
      layers: {
        ...get().layers,
        byId: updatedById
      }
    });
  },

  handleFileDeleted: (fileId: string) => {
    const layersToRemove: string[] = [];

    // Find all layers associated with the deleted file
    Object.entries(get().layers.metadata).forEach(([layerId, metadata]) => {
      if (metadata.fileId === fileId) {
        layersToRemove.push(layerId);
      }
    });

    if (layersToRemove.length === 0) {
      return;
    }

    // Remove each layer
    const updatedById = Object.fromEntries(Object.entries(get().layers.byId).filter(([id]) => !layersToRemove.includes(id)));
    const updatedAllIds = get().layers.allIds.filter(id => !layersToRemove.includes(id));
    const updatedMetadata = Object.fromEntries(Object.entries(get().layers.metadata).filter(([id]) => !layersToRemove.includes(id)));

    set({
      layers: {
        byId: updatedById,
        allIds: updatedAllIds,
        metadata: updatedMetadata
      }
    });
  },

  updateLayerStyle: (layerId: string, style: { paint?: Record<string, unknown>; layout?: Record<string, unknown> }, geometryTypes?: { hasPolygons: boolean; hasLines: boolean; hasPoints: boolean }) => {
    const layer = get().layers.byId[layerId];
    if (!layer) {
      return;
    }

    // Create new style object with deep cloning of existing properties
    const currentMetadata = get().layers.metadata[layerId] || { name: '', type: '', properties: {} };
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

    // Create new layer object
    const newLayer = {
      ...layer,
      metadata: newMetadata
    };

    // Create new state with all new objects
    set({
      layers: {
        ...get().layers,
        metadata: {
          ...get().layers.metadata,
          [layerId]: newMetadata
        },
        byId: {
          ...get().layers.byId,
          [layerId]: newLayer
        }
      }
    });
  },

  updateLayerHeightSource: (layerId: string, heightSource: { 
    mode: 'simple' | 'advanced'; 
    type?: 'z_coord' | 'attribute' | 'none'; 
    attributeName?: string; 
    interpretationMode?: 'absolute' | 'relative' | 'extrusion';
    advanced?: {
      baseElevation: {
        source: 'z_coord' | 'attribute' | 'terrain';
        attributeName?: string;
        isAbsolute: boolean;
      };
      heightConfig: {
        source: 'attribute' | 'calculated' | 'none';
        attributeName?: string;
        isRelative: boolean;
      };
      visualization: {
        type: 'extrusion' | 'point_elevation' | 'line_elevation';
        extrudedFaces?: boolean;
        extrudedTop?: boolean;
      };
    };
  }) => {
    const layer = get().layers.byId[layerId];
    if (!layer) {
      return;
    }

    // Get current metadata or create new one
    const currentMetadata = get().layers.metadata[layerId] || { name: layerId, type: 'vector', properties: {} };
    
    // Create new height configuration based on mode
    let heightConfig: typeof currentMetadata.height = {
      sourceType: 'none' // Default value to satisfy TypeScript
    };
    
    if (heightSource.mode === 'simple') {
      // Simple mode (backward compatible)
      heightConfig = {
        mode: 'simple',
        sourceType: heightSource.type || 'none',
        attributeName: heightSource.attributeName,
        interpretationMode: heightSource.interpretationMode,
        // Preserve existing transformation data if present
        transformationStatus: currentMetadata.height?.transformationStatus,
        transformationProgress: currentMetadata.height?.transformationProgress,
        transformationError: currentMetadata.height?.transformationError
      };
    } else {
      // Advanced mode
      heightConfig = {
        mode: 'advanced',
        // Keep sourceType for backward compatibility
        sourceType: currentMetadata.height?.sourceType || 'none',
        advanced: heightSource.advanced,
        // Preserve existing transformation data if present
        transformationStatus: currentMetadata.height?.transformationStatus,
        transformationProgress: currentMetadata.height?.transformationProgress,
        transformationError: currentMetadata.height?.transformationError
      };
    }

    // Create new metadata object with the height source information
    const newMetadata: LayerMetadata = {
      ...currentMetadata,
      height: heightConfig
    };

    // Create new layer object
    const newLayer = {
      ...layer,
      metadata: newMetadata
    };

    set({
      layers: {
        ...get().layers,
        metadata: {
          ...get().layers.metadata,
          [layerId]: newMetadata
        },
        byId: {
          ...get().layers.byId,
          [layerId]: newLayer
        }
      }
    });
  },

  setInitialLoadComplete: (complete: boolean) => {
    set({ isInitialLoadComplete: complete });
  },

  setLayerGeoJsonData: (layerId, geojsonData) => {
    const layer = get().layers.byId[layerId];
    if (!layer) {
      return;
    }

    // Get current metadata or create new one
    const currentMetadata = layer.metadata || {
      name: layerId,
      type: 'vector',
      properties: {}
    };

    // Check if data is identical
    if (isEqual(currentMetadata.properties?.geojson, geojsonData)) {
      return;
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

    set({
      layers: {
        ...get().layers,
        byId: {
          ...get().layers.byId,
          [layerId]: newLayer
        },
        metadata: {
          ...get().layers.metadata,
          [layerId]: newMetadata
        }
      }
    });
  },

  reset: () => {
    set({ 
      layers: initialState,
      isInitialLoadComplete: false 
    });
  }
}));

// Custom hooks for layer operations
export const useLayer = (layerId: string) => {
  const layer = useLayerStore((state) => layerSelectors.getLayerById(state)(layerId));
  const metadata = useLayerStore((state) => layerSelectors.getLayerMetadata(state)(layerId));

  const setVisibility = useCallback((visible: boolean) => {
    useLayerStore.getState().setLayerVisibility(layerId, visible);
  }, [layerId]);

  const updateStatus = useCallback((status: Layer['setupStatus'], error?: string) => {
    useLayerStore.getState().updateLayerStatus(layerId, status, error);
  }, [layerId]);

  const updateStyle = useCallback((style: { paint?: Record<string, unknown>; layout?: Record<string, unknown> }) => {
    useLayerStore.getState().updateLayerStyle(layerId, style);
  }, [layerId]);

  const remove = useCallback(() => {
    useLayerStore.getState().removeLayer(layerId);
  }, [layerId]);

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
  // Select primitive state parts
  const allIds = useLayerStore((state) => state.layers.allIds);
  const byId = useLayerStore((state) => state.layers.byId);

  // Memoize the layers array construction with more granular dependencies
  const layers = useMemo(() => {
    return allIds.map(id => byId[id]);
  }, [allIds, byId]);

  // Use selectors with built-in memoization
  const visibleLayers = useLayerStore((state) => layerSelectors.getVisibleLayers(state));
  const layersWithErrors = useLayerStore((state) => layerSelectors.getLayersWithErrors(state));

  // Select and stabilize store actions
  const storeActions = useLayerStore((state) => ({
    addLayer: state.addLayer,
    removeLayer: state.removeLayer,
    handleFileDeleted: state.handleFileDeleted
  }));

  const addLayer = useCallback((
    layerId: string,
    initialVisibility: boolean = true,
    sourceId?: string,
    metadata?: LayerMetadata
  ) => {
    storeActions.addLayer(layerId, initialVisibility, sourceId, metadata);
  }, [storeActions]);

  const removeLayer = useCallback((layerId: string) => {
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
  const layer = useLayerStore((state) => layerSelectors.getLayerById(state)(layerId));

  const updateStatus = useCallback((status: Layer['setupStatus'], error?: string) => {
    useLayerStore.getState().updateLayerStatus(layerId, status, error);
  }, [layerId]);

  return {
    status: layer?.setupStatus ?? 'pending',
    error: layer?.error,
    updateStatus
  };
};

export const useLayerVisibility = (layerId: string) => {
  const layer = useLayerStore((state) => layerSelectors.getLayerById(state)(layerId));

  const setVisibility = useCallback((visible: boolean) => {
    useLayerStore.getState().setLayerVisibility(layerId, visible);
  }, [layerId]);

  return {
    isVisible: layer?.visible ?? false,
    setVisibility
  };
}; 