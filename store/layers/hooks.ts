import { useCallback, useMemo } from 'react';
import { useLayerStore } from './layerStore';
import type { LayerStore } from './layerStore';
import { layerSelectors } from './layerStore';
import type { Layer, LayerMetadata } from './types';
import { dbLogger } from '@/utils/logging/dbLogger';
import { useShallow } from 'zustand/react/shallow';

const SOURCE = 'layerHooks';

// Single layer operations
export const useLayer = (layerId: string) => {
  // Log hook mount (critical lifecycle event)
  dbLogger.debug('useLayer.hookRun', { layerId, source: SOURCE }).catch(() => {});
  const store = useLayerStore();
  const layer = useLayerStore((state) => layerSelectors.getLayerById(state)(layerId));
  const metadata = useLayerStore((state) => layerSelectors.getLayerMetadata(state)(layerId));

  const setVisibility = useCallback((visible: boolean) => {
    dbLogger.debug('useLayer.setVisibility', { layerId, visible, source: SOURCE }).catch(() => {});
    store.setLayerVisibility(layerId, visible);
  }, [layerId, store]);

  const updateStatus = useCallback((status: Layer['setupStatus'], error?: string) => {
    dbLogger.debug('useLayer.updateStatus', { layerId, status, error, source: SOURCE }).catch(() => {});
    store.updateLayerStatus(layerId, status, error);
  }, [layerId, store]);

  const updateStyle = useCallback((style: { paint?: Record<string, unknown>; layout?: Record<string, unknown> }) => {
    dbLogger.debug('useLayer.updateStyle', { layerId, style, source: SOURCE }).catch(() => {});
    store.updateLayerStyle(layerId, style);
  }, [layerId, store]);

  const remove = useCallback(() => {
    dbLogger.debug('useLayer.remove', { layerId, source: SOURCE }).catch(() => {});
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

// Bulk layer operations - using standard Zustand selectors
export const useLayers = () => {
  // Log hook mount (critical lifecycle event)
  dbLogger.debug('useLayers.hookRun', { source: SOURCE }).catch(() => {});
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
    dbLogger.debug('useLayers.addLayer', { layerId, initialVisibility, source: SOURCE }).catch(() => {});
    addLayerAction(layerId, initialVisibility, sourceId, metadata);
  }, [addLayerAction]);

  const removeLayer = useCallback((layerId: string) => {
    dbLogger.debug('useLayers.removeLayer', { layerId, source: SOURCE }).catch(() => {});
    removeLayerAction(layerId);
  }, [removeLayerAction]);

  const handleFileDeleted = useCallback((fileId: string) => {
    dbLogger.debug('useLayers.handleFileDeleted', { fileId, source: SOURCE }).catch(() => {});
    handleFileDeletedAction(fileId);
  }, [handleFileDeletedAction]);

  return {
    layers,
    addLayer,
    removeLayer,
    handleFileDeleted
  };
};

// Layer status operations
export const useLayerStatus = (layerId: string) => {
  dbLogger.debug('useLayerStatus.hookRun', { layerId, source: SOURCE }).catch(() => {});
  const store = useLayerStore();
  const layer = useLayerStore((state) => layerSelectors.getLayerById(state)(layerId));

  const updateStatus = useCallback((status: Layer['setupStatus'], error?: string) => {
    dbLogger.debug('useLayerStatus.updateStatus', { layerId, status, error, source: SOURCE }).catch(() => {});
    store.updateLayerStatus(layerId, status, error);
  }, [layerId, store]);

  return {
    status: layer?.setupStatus ?? 'pending',
    error: layer?.error,
    updateStatus
  };
};

// Layer visibility operations
export const useLayerVisibility = (layerId: string) => {
  dbLogger.debug('useLayerVisibility.hookRun', { layerId, source: SOURCE }).catch(() => {});
  const store = useLayerStore();
  const layer = useLayerStore((state) => layerSelectors.getLayerById(state)(layerId));

  const setVisibility = useCallback((visible: boolean) => {
    dbLogger.debug('useLayerVisibility.setVisibility', { layerId, visible, source: SOURCE }).catch(() => {});
    store.setLayerVisibility(layerId, visible);
  }, [layerId, store]);

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