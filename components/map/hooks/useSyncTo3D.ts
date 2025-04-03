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
}

export function useSyncTo3D() {
  const mapboxInstance = useMapInstanceStore(state => state.mapInstances.mapbox.instance);
  const { viewer, isInitialized } = useCesium();
  const { layers } = useLayers();
  const { syncViews } = useViewSync();
  const [isLoading, setIsLoading] = useState(false);

  const syncTo3D = useCallback(async (options: SyncOptions = { syncView: true, syncLayers: true }) => {
    if (!mapboxInstance || !viewer || !isInitialized) {
      logger.warn('Cannot sync: Map instances not available', {
        hasMapbox: !!mapboxInstance,
        hasCesium: !!viewer,
        isInitialized
      });
      return;
    }

    try {
      setIsLoading(true);
      logger.debug('Starting 2D to 3D synchronization', { options });

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
        await syncViews('2d', viewState, mapboxInstance, viewer);
      }

      // Sync layers if requested
      if (options.syncLayers) {
        logger.debug('Syncing layers to 3D', {
          layerCount: layers.length,
          layers: layers.map(l => ({
            id: l.id,
            name: l.metadata?.name,
            type: l.metadata?.type,
            setupStatus: l.setupStatus
          }))
        });
        
        // Get visible layers
        const visibleLayers = layers.filter(layer => layer.visible);
        
        // Clear existing layers in Cesium
        viewer.dataSources.removeAll();
        viewer.scene.primitives.removeAll();
        
        // Add each visible layer to Cesium
        for (const layer of visibleLayers) {
          try {
            const type = layer.metadata?.type || 'vector';
            const adapter = getLayerAdapter(type);
            if (!adapter) {
              logger.warn('No adapter found for layer type', { 
                layerId: layer.id,
                type 
              });
              continue;
            }

            logger.debug('Converting layer to 3D', {
              layerId: layer.id,
              name: layer.metadata?.name,
              type
            });

            const cesiumLayer = await adapter.to3D({
              id: layer.id,
              name: layer.metadata?.name || layer.id,
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
              logger.warn('Failed to convert layer to 3D', { layerId: layer.id });
              continue;
            }

            // Add the layer to Cesium based on its type
            if (cesiumLayer.dataSource) {
              await viewer.dataSources.add(cesiumLayer.dataSource);
              logger.debug('Added data source to viewer', { layerId: layer.id });
            } else if (cesiumLayer.tileset) {
              viewer.scene.primitives.add(cesiumLayer.tileset);
              logger.debug('Added tileset to viewer', { layerId: layer.id });
            } else if (cesiumLayer.imageryProvider) {
              viewer.imageryLayers.addImageryProvider(cesiumLayer.imageryProvider);
              logger.debug('Added imagery layer to viewer', { layerId: layer.id });
            }

            logger.debug('Successfully added layer to 3D view', { layerId: layer.id });
          } catch (error) {
            logger.error('Error syncing layer to 3D', { 
              layerId: layer.id, 
              error: error instanceof Error ? error.message : error 
            });
          }
        }
      }

      logger.info('2D to 3D synchronization complete');
    } catch (error) {
      logger.error('Error during 2D to 3D synchronization', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [mapboxInstance, viewer, isInitialized, layers, syncViews]);

  return { syncTo3D, isLoading };
} 