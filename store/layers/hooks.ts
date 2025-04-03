import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react';
import { useLayerStore, type LayerStore, initialState } from './layerStore';
import { layerSelectors } from './layerStore';
import type { Layer, LayerMetadata } from './types';
import { LogManager } from '@/core/logging/log-manager';
import { shallow } from 'zustand/shallow';
import { useMapInstanceStore } from '@/store/map/mapInstanceStore';

const SOURCE = 'layerHooks';
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

interface LayerState {
  allIds: string[];
  byId: Record<string, Layer>;
}

interface StoreActions {
  addLayer: (layerId: string, initialVisibility?: boolean, sourceId?: string, metadata?: LayerMetadata) => void;
  removeLayer: (layerId: string) => void;
  handleFileDeleted: (fileId: string) => void;
}

// Single layer operations
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

// Bulk layer operations - using standard Zustand selectors
export const useLayers = () => {
  const renderCount = useRef(0);
  renderCount.current += 1;
  
  logger.warn('HOOK RUN: useLayers', { 
    renderCount: renderCount.current,
    timestamp: new Date().toISOString()
  });

  // Select primitive state parts
  const allIds = useLayerStore((state: LayerStore) => state.layers.allIds);
  const byId = useLayerStore((state: LayerStore) => state.layers.byId);

  // Log selected state parts
  logger.debug('HOOK STATE: useLayers - Selected state parts', {
    renderCount: renderCount.current,
    allIdsCount: allIds.length,
    byIdKeysCount: Object.keys(byId).length
  });

  // Memoize the layers array construction
  const layers = useMemo(() => {
    logger.debug('HOOK MEMO: Recomputing layers array', { 
      renderCount: renderCount.current,
      idCount: allIds.length,
      timestamp: new Date().toISOString()
    });
    return allIds.map((id: string) => byId[id]).filter(Boolean);
  }, [allIds, byId]);

  // Select actions
  const addLayerAction = useLayerStore((state: LayerStore) => state.addLayer);
  const removeLayerAction = useLayerStore((state: LayerStore) => state.removeLayer);
  const handleFileDeletedAction = useLayerStore((state: LayerStore) => state.handleFileDeleted);

  // Log final state
  logger.debug('HOOK STATE: useLayers - Final state', {
    renderCount: renderCount.current,
    layerCount: layers.length
  });

  const addLayer = useCallback((
    layerId: string,
    initialVisibility: boolean = true,
    sourceId?: string,
    metadata?: LayerMetadata
  ) => {
    logger.debug('HOOK ACTION: useLayers.addLayer', {
      renderCount: renderCount.current,
      layerId,
      initialVisibility,
      sourceId,
      hasMetadata: !!metadata
    });
    addLayerAction(layerId, initialVisibility, sourceId, metadata);
  }, [addLayerAction]);

  const removeLayer = useCallback((layerId: string) => {
    logger.debug('HOOK ACTION: useLayers.removeLayer', { 
      renderCount: renderCount.current,
      layerId 
    });
    removeLayerAction(layerId);
  }, [removeLayerAction]);

  const handleFileDeleted = useCallback((fileId: string) => {
    logger.debug('HOOK ACTION: useLayers.handleFileDeleted', { 
      renderCount: renderCount.current,
      fileId 
    });
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

// Layer visibility operations
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

// Layer readiness tracking
export const useAreInitialLayersReady = () => {
  logger.debug('HOOK RUN: useAreInitialLayersReady');
  
  // Get map readiness state
  const isMapReady = useMapInstanceStore((state: { mapInstances: { mapbox: { instance: any; status: string } } }) => 
    state.mapInstances.mapbox.instance !== null && 
    state.mapInstances.mapbox.status === 'ready'
  );

  // Get all layers and their setup status
  const layers = useLayerStore((state: LayerStore) => state.layers.byId);
  const isInitialLoadComplete = useLayerStore((state: LayerStore) => state.isInitialLoadComplete);

  // Memoize the readiness check
  const areLayersReady = useMemo(() => {
    logger.debug('HOOK MEMO: Checking layer readiness', {
      isMapReady,
      isInitialLoadComplete,
      layerCount: Object.keys(layers).length
    });

    if (!isMapReady || !isInitialLoadComplete) {
      logger.debug('Layers not ready - map or initial load incomplete', {
        isMapReady,
        isInitialLoadComplete
      });
      return false;
    }

    const layerIds = Object.keys(layers);
    if (layerIds.length === 0) {
      logger.debug('No layers to check for readiness');
      return true; // No layers means we're ready
    }

    const allLayersReady = layerIds.every(id => {
      const layer = layers[id];
      // Consider both 'complete' and 'error' as final states
      const isReady = layer.setupStatus === 'complete' || layer.setupStatus === 'error';
      if (!isReady) {
        logger.debug(`Layer ${id} not ready`, {
          setupStatus: layer.setupStatus,
          error: layer.error
        });
      }
      return isReady;
    });

    logger.debug('Layer readiness check complete', {
      layerCount: layerIds.length,
      allLayersReady,
      layerStatuses: layerIds.map(id => ({
        id,
        setupStatus: layers[id].setupStatus,
        error: layers[id].error
      }))
    });

    return allLayersReady;
  }, [isMapReady, isInitialLoadComplete, layers]);

  return areLayersReady;
}; 