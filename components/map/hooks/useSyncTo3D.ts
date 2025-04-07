'use client';

import { useCallback, useState } from 'react';
import { useMapInstanceStore } from '@/store/map/mapInstanceStore';
import { useCesium } from '@/components/map/context/CesiumContext';
import { useLayers } from '@/store/layers/hooks';
import { useViewSync, ViewState } from './useViewSync';
import { getLayerAdapter } from '../utils/layer-adapters';
import { LogManager } from '@/core/logging/log-manager';
import { SharedLayer } from '../context/SharedLayerContext';

const SOURCE = 'useSyncTo3D';
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

export interface SyncOptions {
  syncView?: boolean;
  syncLayers?: boolean;
  viewerInstanceId?: string | null;
}

export function useSyncTo3D() {
  const mapboxInstance = useMapInstanceStore(state => state.mapInstances.mapbox.instance);
  const cesiumInstance = useMapInstanceStore(state => state.mapInstances.cesium.instance);
  const cesiumStatus = useMapInstanceStore(state => state.mapInstances.cesium.status);
  const cesiumInstanceId = useMapInstanceStore(state => state.mapInstances.cesium.instanceId);
  const isInitialized = !!cesiumInstance && cesiumStatus === 'ready';
  const { layers } = useLayers();
  const { syncViews } = useViewSync();
  const [isLoading, setIsLoading] = useState(false);

  const syncTo3D = useCallback(async (options: SyncOptions = { syncView: true, syncLayers: true }) => {
    if (!mapboxInstance || !cesiumInstance || !isInitialized) {
      logger.warn('Cannot sync: Map instances not available', {
        hasMapbox: !!mapboxInstance,
        hasCesium: !!cesiumInstance,
        cesiumStatus,
        isInitialized
      });
      return;
    }

    // Validate viewer instance ID
    if (options.viewerInstanceId && options.viewerInstanceId !== cesiumInstanceId) {
      logger.warn('Cannot sync: Viewer instance ID mismatch', {
        expectedId: options.viewerInstanceId,
        actualId: cesiumInstanceId
      });
      return;
    }

    // Check if viewer is destroyed
    if (cesiumInstance.isDestroyed()) {
      logger.warn('Cannot sync: Cesium viewer is destroyed');
      return;
    }

    try {
      setIsLoading(true);
      logger.debug('Starting 2D to 3D synchronization', { 
        options,
        viewerInstanceId: cesiumInstanceId
      });

      // Sync view if requested
      if (options.syncView) {
        logger.debug('Syncing view state to 3D');
        const center = mapboxInstance.getCenter();
        const viewState: ViewState = {
          center: [center.lng, center.lat] as [number, number],
          zoom: mapboxInstance.getZoom(),
          pitch: mapboxInstance.getPitch(),
          bearing: mapboxInstance.getBearing()
        };
        await syncViews('2d', viewState, mapboxInstance, cesiumInstance);
      }

      // Sync layers if requested
      if (options.syncLayers) {
        logger.debug('Starting granular layer sync to 3D', {
          layerCount: layers.length,
          layers: layers.map(l => ({
            id: l.id,
            name: l.metadata?.name,
            type: l.metadata?.type,
            setupStatus: l.setupStatus,
            visible: l.visible
          }))
        });

        // 1. Track existing Cesium data sources by layer ID
        const currentDataSources = new Map<string, any>(); // layerId -> DataSource
        const currentPrimitives = new Map<string, any>(); // layerId -> Primitive
        const currentImageryLayers = new Map<string, any>(); // layerId -> ImageryLayer

        // Collect existing data sources
        for (let i = 0; i < cesiumInstance.dataSources.length; i++) {
          const ds = cesiumInstance.dataSources.get(i);
          if (ds?.name) {
            currentDataSources.set(ds.name, ds);
          }
        }

        // Collect existing primitives (if they have our custom _layerId)
        for (let i = 0; i < cesiumInstance.scene.primitives.length; i++) {
          const primitive = cesiumInstance.scene.primitives.get(i);
          if ((primitive as any)?._layerId) {
            currentPrimitives.set((primitive as any)._layerId, primitive);
          }
        }

        // Collect existing imagery layers (if they have our custom _layerId)
        for (let i = 0; i < cesiumInstance.imageryLayers.length; i++) {
          const layer = cesiumInstance.imageryLayers.get(i);
          if ((layer as any)?._layerId) {
            currentImageryLayers.set((layer as any)._layerId, layer);
          }
        }

        // 2. Get set of visible layer IDs
        const visibleLayerIds = new Set(
          layers.filter(l => l.visible).map(l => l.id)
        );

        // 3. Remove layers that are no longer visible
        // Remove stale data sources
        for (const [layerId, dataSource] of currentDataSources) {
          if (!visibleLayerIds.has(layerId)) {
            logger.debug('Removing stale data source', { layerId });
            await cesiumInstance.dataSources.remove(dataSource, true);
          }
        }

        // Remove stale primitives
        for (const [layerId, primitive] of currentPrimitives) {
          if (!visibleLayerIds.has(layerId)) {
            logger.debug('Removing stale primitive', { layerId });
            cesiumInstance.scene.primitives.remove(primitive);
          }
        }

        // Remove stale imagery layers
        for (const [layerId, imageryLayer] of currentImageryLayers) {
          if (!visibleLayerIds.has(layerId)) {
            logger.debug('Removing stale imagery layer', { layerId });
            cesiumInstance.imageryLayers.remove(imageryLayer, true);
          }
        }

        // 4. Add or update visible layers
        for (const layer of layers.filter(l => l.visible)) {
          const layerId = layer.id;
          
          // Skip if layer already exists (for now - could add update logic later)
          if (currentDataSources.has(layerId) || 
              currentPrimitives.has(layerId) || 
              currentImageryLayers.has(layerId)) {
            logger.debug('Layer already exists in 3D view, skipping', { layerId });
            continue;
          }

          try {
            const type = layer.metadata?.type || 'vector';
            const adapter = getLayerAdapter(type);
            if (!adapter) {
              logger.warn('No adapter found for layer type', { 
                layerId,
                type 
              });
              continue;
            }

            logger.debug('Converting layer to 3D', {
              layerId,
              name: layer.metadata?.name,
              type
            });

            const cesiumLayer = await adapter.to3D({
              id: layerId,
              name: layer.metadata?.name || layerId,
              type: type as any,
              visible: layer.visible,
              metadata: {
                sourceType: '3d',
                geojson: layer.metadata?.properties?.geojson,
                source2D: layer.metadata?.properties?.source2D,
                source3D: layer.metadata?.properties?.source3D,
                style: layer.metadata?.style
              },
              selected: false
            } as SharedLayer);

            if (!cesiumLayer) {
              logger.warn('Failed to convert layer to 3D', { layerId });
              continue;
            }

            // Add the layer with proper tracking ID
            if (cesiumLayer.dataSource) {
              cesiumLayer.dataSource.name = layerId; // Set name for tracking
              await cesiumInstance.dataSources.add(cesiumLayer.dataSource);
              logger.debug('Added data source to viewer', { layerId });
            } else if (cesiumLayer.tileset) {
              (cesiumLayer.tileset as any)._layerId = layerId; // Add tracking ID
              cesiumInstance.scene.primitives.add(cesiumLayer.tileset);
              logger.debug('Added tileset to viewer', { layerId });
            } else if (cesiumLayer.imageryProvider) {
              const imageryLayer = cesiumInstance.imageryLayers.addImageryProvider(
                cesiumLayer.imageryProvider
              );
              (imageryLayer as any)._layerId = layerId; // Add tracking ID
              logger.debug('Added imagery layer to viewer', { layerId });
            }

            logger.debug('Successfully added layer to 3D view', { layerId });
          } catch (error) {
            logger.error('Error syncing layer to 3D', { 
              layerId, 
              error: error instanceof Error ? error.message : error 
            });
          }
        }
      }

      logger.info('2D to 3D synchronization complete');
    } catch (error) {
      logger.error('Error during 2D to 3D synchronization', {
        error,
        viewerInstanceId: cesiumInstanceId
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [mapboxInstance, cesiumInstance, cesiumInstanceId, isInitialized, layers, syncViews, cesiumStatus]);

  return { syncTo3D, isLoading };
} 