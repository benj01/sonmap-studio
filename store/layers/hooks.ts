import { useCallback, useMemo } from 'react';
import { useLayerStore } from './layerStore';
import type { LayerStore } from './layerStore';
import { layerSelectors } from './layerStore';
import type { Layer, LayerMetadata } from './types';
import { useDevLogger } from '@/utils/logging/devLogger';
import { useShallow } from 'zustand/react/shallow';

const SOURCE = 'layerHooks';

// Single layer operations
export const useLayer = (layerId: string) => {
  const logger = useDevLogger('useLayer');
  const store = useLayerStore();
  const layer = useLayerStore((state) => layerSelectors.getLayerById(state)(layerId));
  const metadata = useLayerStore((state) => layerSelectors.getLayerMetadata(state)(layerId));

  const setVisibility = useCallback((visible: boolean) => {
    logger.log('setVisibility', { layerId, visible });
    store.setLayerVisibility(layerId, visible);
  }, [layerId, store, logger]);

  const updateStatus = useCallback((status: Layer['setupStatus'], error?: string) => {
    logger.log('updateStatus', { layerId, status, error });
    store.updateLayerStatus(layerId, status, error);
  }, [layerId, store, logger]);

  const updateStyle = useCallback((style: { paint?: Record<string, unknown>; layout?: Record<string, unknown> }) => {
    logger.log('updateStyle', { layerId, style });
    store.updateLayerStyle(layerId, style);
  }, [layerId, store, logger]);

  const remove = useCallback(() => {
    logger.log('remove', { layerId });
    store.removeLayer(layerId);
  }, [layerId, store, logger]);

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

// Bulk layer operations - using standard Zustand selectors
export const useLayers = () => {
  const logger = useDevLogger('useLayers');
  
  // Select the entire layers object once USING useShallow for shallow comparison
  const layersState = useLayerStore(useShallow((state: LayerStore) => state.layers));

  // Memoize allIds and byId for stability
  const allIds = useMemo(() => layersState.allIds, [layersState.allIds]);
  const byId = useMemo(() => layersState.byId, [layersState.byId]);

  // Memoize the layers array construction
  const layers = useMemo(() => {
    return allIds.map((id: string) => byId[id]).filter(Boolean);
  }, [allIds, byId]);

  // Select actions
  const addLayerAction = useLayerStore((state: LayerStore) => state.addLayer);
  const removeLayerAction = useLayerStore((state: LayerStore) => state.removeLayer);
  const handleFileDeletedAction = useLayerStore((state: LayerStore) => state.handleFileDeleted);

  const addLayer = useCallback((
    layerId: string,
    initialVisibility: boolean = true,
    sourceId?: string,
    metadata?: LayerMetadata
  ) => {
    logger.log('addLayer', { layerId, initialVisibility });
    addLayerAction(layerId, initialVisibility, sourceId, metadata);
  }, [addLayerAction, logger]);

  const removeLayer = useCallback((layerId: string) => {
    logger.log('removeLayer', { layerId });
    removeLayerAction(layerId);
  }, [removeLayerAction, logger]);

  const handleFileDeleted = useCallback((fileId: string) => {
    logger.log('handleFileDeleted', { fileId });
    handleFileDeletedAction(fileId);
  }, [handleFileDeletedAction, logger]);

  return {
    layers,
    addLayer,
    removeLayer,
    handleFileDeleted
  };
};

// Layer status operations
export const useLayerStatus = (layerId: string) => {
  const logger = useDevLogger('useLayerStatus');
  const store = useLayerStore();
  const layer = useLayerStore((state) => layerSelectors.getLayerById(state)(layerId));

  const updateStatus = useCallback((status: Layer['setupStatus'], error?: string) => {
    logger.log('updateStatus', { layerId, status, error });
    store.updateLayerStatus(layerId, status, error);
  }, [layerId, store, logger]);

  return {
    status: layer?.setupStatus ?? 'pending',
    error: layer?.error,
    updateStatus
  };
};

// Layer visibility operations
export const useLayerVisibility = (layerId: string) => {
  const logger = useDevLogger('useLayerVisibility');
  const store = useLayerStore();
  const layer = useLayerStore((state) => layerSelectors.getLayerById(state)(layerId));

  const setVisibility = useCallback((visible: boolean) => {
    logger.log('setVisibility', { layerId, visible });
    store.setLayerVisibility(layerId, visible);
  }, [layerId, store, logger]);

  return {
    isVisible: layer?.visible ?? false,
    setVisibility
  };
};

// Layer readiness tracking
export const useAreInitialLayersReady = () => {
  // Only check initial load complete for Cesium
  const isInitialLoadComplete = useLayerStore((state: LayerStore) => state.isInitialLoadComplete);
  const layers = useLayerStore((state: LayerStore) => state.layers.byId);

  // Memoize the readiness check
  const areLayersReady = useMemo(() => {
    if (!isInitialLoadComplete) {
      return false;
    }
    const layerIds = Object.keys(layers);
    if (layerIds.length === 0) {
      return true; // No layers means we're ready
    }
    const allLayersReady = layerIds.every(id => {
      const layer = layers[id];
      // Consider both 'complete' and 'error' as final states
      return layer.setupStatus === 'complete' || layer.setupStatus === 'error';
    });
    return allLayersReady;
  }, [isInitialLoadComplete, layers]);

  return areLayersReady;
}; 