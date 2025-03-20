import { useCallback } from 'react';
import { useMapContext } from './useMapContext';
import { useCesium } from '../context/CesiumContext';
import { useSharedLayers } from '../context/SharedLayerContext';
import { useViewSync } from './useViewSync';
import { LogManager } from '@/core/logging/log-manager';
import { getLayerAdapter } from '../utils/layer-adapters';
import { DataSource } from 'cesium';
import { ImageryProvider } from 'cesium';

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
  includeLayers: boolean;
  includeView: boolean;
  includeFeatures?: boolean;
}

export function useSyncTo3D() {
  const { map } = useMapContext();
  const { viewer } = useCesium();
  const { layers, selectedLayers } = useSharedLayers();
  const { syncViews } = useViewSync();

  const syncTo3D = useCallback(async (options: SyncOptions) => {
    if (!map || !viewer) {
      logger.warn('Map or viewer not available for synchronization');
      return;
    }

    try {
      logger.info('Starting 2D to 3D synchronization', options);

      // 1. Sync view state
      if (options.includeView) {
        logger.debug('Syncing view state');
        const center = map.getCenter();
        const state = {
          center: [center.lng, center.lat] as [number, number],
          zoom: map.getZoom(),
          pitch: map.getPitch(),
          bearing: map.getBearing()
        };
        await syncViews('2d', state, map, viewer);
      }

      // 2. Sync selected layers
      if (options.includeLayers) {
        logger.debug('Syncing selected layers', { selectedLayers });
        // Clear existing 3D layers
        viewer.entities.removeAll();
        viewer.imageryLayers.removeAll();
        viewer.scene.primitives.removeAll();

        // Add selected layers to 3D view
        for (const layerId of selectedLayers) {
          const layer = layers.find(l => l.id === layerId);
          if (!layer) {
            logger.warn('Selected layer not found', { layerId });
            continue;
          }

          try {
            const adapter = getLayerAdapter(layer.type);
            const cesiumLayer = adapter.to3D(layer);
            
            // Add layer based on type
            switch (cesiumLayer.type) {
              case 'vector':
                if (cesiumLayer.dataSource) {
                  viewer.entities.add(cesiumLayer.dataSource as DataSource);
                }
                break;
              case '3d-tiles':
                if (cesiumLayer.tileset) {
                  viewer.scene.primitives.add(cesiumLayer.tileset);
                }
                break;
              case 'imagery':
                if (cesiumLayer.imageryProvider) {
                  viewer.imageryLayers.addImageryProvider(cesiumLayer.imageryProvider as ImageryProvider);
                }
                break;
              default:
                logger.warn('Unsupported layer type', { type: cesiumLayer.type });
            }
          } catch (error) {
            logger.error('Error syncing layer to 3D', { layerId, error });
          }
        }
      }

      // 3. Sync selected features (future)
      if (options.includeFeatures) {
        logger.debug('Feature synchronization not yet implemented');
        // TODO: Implement feature synchronization
      }

      logger.info('2D to 3D synchronization complete');
    } catch (error) {
      logger.error('Error during 2D to 3D synchronization', error);
      throw error;
    }
  }, [map, viewer, layers, selectedLayers, syncViews]);

  return { syncTo3D };
} 