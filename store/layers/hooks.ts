import { useCallback } from 'react';
import { useLayerStore } from './layerStore';
import { layerSelectors } from './layerStore';
import type { Layer, LayerMetadata } from './types';
import { LogManager } from '@/core/logging/log-manager';

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

// Single layer operations
export const useLayer = (layerId: string) => {
  const store = useLayerStore();
  const layer = useLayerStore((state) => layerSelectors.getLayerById(state)(layerId));
  const metadata = useLayerStore((state) => layerSelectors.getLayerMetadata(state)(layerId));

  const setVisibility = useCallback((visible: boolean) => {
    store.setLayerVisibility(layerId, visible);
  }, [layerId, store]);

  const updateStatus = useCallback((status: Layer['setupStatus'], error?: string) => {
    store.updateLayerStatus(layerId, status, error);
  }, [layerId, store]);

  const remove = useCallback(() => {
    store.removeLayer(layerId);
  }, [layerId, store]);

  return {
    layer,
    metadata,
    setVisibility,
    updateStatus,
    remove,
    isVisible: layer?.visible ?? false,
    setupStatus: layer?.setupStatus ?? 'pending',
    error: layer?.error
  };
};

// Bulk layer operations
export const useLayers = () => {
  const store = useLayerStore();
  const layers = useLayerStore(layerSelectors.getAllLayers);
  const visibleLayers = useLayerStore(layerSelectors.getVisibleLayers);
  const layersWithErrors = useLayerStore(layerSelectors.getLayersWithErrors);

  logger.info('useLayers hook called', {
    layerCount: layers.length,
    layers: layers.map(l => ({
      id: l.id,
      hasMetadata: !!l.metadata,
      metadata: l.metadata,
      visible: l.visible,
      setupStatus: l.setupStatus,
      error: l.error
    })),
    visibleLayerCount: visibleLayers.length,
    errorCount: layersWithErrors.filter(l => l.error !== undefined).length
  });

  const addLayer = useCallback((
    layerId: string,
    initialVisibility: boolean = true,
    sourceId?: string,
    metadata?: LayerMetadata
  ) => {
    logger.info('Adding layer via useLayers', {
      layerId,
      initialVisibility,
      sourceId,
      metadata
    });
    store.addLayer(layerId, initialVisibility, sourceId, metadata);
  }, [store]);

  const removeLayer = useCallback((layerId: string) => {
    store.removeLayer(layerId);
  }, [store]);

  const handleFileDeleted = useCallback((fileId: string) => {
    store.handleFileDeleted(fileId);
  }, [store]);

  return {
    layers,
    visibleLayers,
    layersWithErrors,
    addLayer,
    removeLayer,
    handleFileDeleted
  };
};

// Layer status operations
export const useLayerStatus = (layerId: string) => {
  const store = useLayerStore();
  const layer = useLayerStore((state) => layerSelectors.getLayerById(state)(layerId));

  const updateStatus = useCallback((status: Layer['setupStatus'], error?: string) => {
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
  const store = useLayerStore();
  const layer = useLayerStore((state) => layerSelectors.getLayerById(state)(layerId));

  const setVisibility = useCallback((visible: boolean) => {
    store.setLayerVisibility(layerId, visible);
  }, [layerId, store]);

  return {
    isVisible: layer?.visible ?? false,
    setVisibility
  };
}; 