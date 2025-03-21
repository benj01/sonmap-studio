import { useCallback, useEffect, useState, useRef } from 'react';
import { useMapContext } from './useMapContext';
import { useCesium } from '../context/CesiumContext';
import { useSharedLayers } from '../context/SharedLayerContext';
import { useViewSync } from './useViewSync';
import { LogManager } from '@/core/logging/log-manager';
import { getLayerAdapter } from '../utils/layer-adapters';
import { DataSource } from 'cesium';
import { ImageryProvider } from 'cesium';
import { useLayerData } from './useLayerData';

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

// Helper hook to safely handle layer data
function useSelectedLayerData(layerId: string | undefined) {
  const { data } = useLayerData(layerId || '');
  return layerId ? data : null;
}

export function useSyncTo3D() {
  const { map } = useMapContext();
  const { viewer } = useCesium();
  const { layers, selectedLayers } = useSharedLayers();
  const { syncViews } = useViewSync();
  
  // Track loading state
  const [isLoading, setIsLoading] = useState(false);
  const mountedRef = useRef(true);

  // Create refs for the latest values to use in async operations
  const selectedLayersRef = useRef(selectedLayers);
  const layersRef = useRef(layers);

  // Update refs when values change
  useEffect(() => {
    selectedLayersRef.current = selectedLayers;
    layersRef.current = layers;
  }, [selectedLayers, layers]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const syncTo3D = useCallback(async (options: SyncOptions) => {
    if (!map || !viewer) {
      logger.warn('Map or viewer not available for synchronization');
      return;
    }

    if (isLoading) {
      logger.warn('Sync already in progress, skipping');
      return;
    }

    try {
      setIsLoading(true);
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
      if (options.includeLayers && selectedLayersRef.current.length > 0) {
        logger.debug('Syncing selected layers', { selectedLayers: selectedLayersRef.current });
        
        // Clear existing 3D layers
        viewer.entities.removeAll();
        viewer.imageryLayers.removeAll();
        viewer.scene.primitives.removeAll();

        // Process each selected layer sequentially
        for (const layerId of selectedLayersRef.current) {
          if (!mountedRef.current) {
            logger.debug('Component unmounted, stopping sync');
            return;
          }

          if (!layerId) continue;

          const layer = layersRef.current.find(l => l.id === layerId);
          if (!layer) {
            logger.warn('Selected layer not found', { layerId });
            continue;
          }

          try {
            // Fetch layer data
            const response = await fetch(`/api/v1/layers/${layerId}`);
            if (!response.ok) {
              throw new Error(`Failed to fetch layer data: ${response.statusText}`);
            }
            const layerData = await response.json();

            if (!mountedRef.current) return;

            logger.debug('Converting layer to 3D', {
              layerId,
              type: layer.type,
              featureCount: layerData.features?.length || 0
            });

            // Prepare layer with GeoJSON data
            const layerWithData = {
              ...layer,
              metadata: {
                ...layer.metadata,
                geojson: {
                  type: 'FeatureCollection',
                  features: layerData.features || []
                }
              }
            };

            const adapter = getLayerAdapter(layer.type);
            const cesiumLayer = await adapter.to3D(layerWithData);
            
            if (!mountedRef.current) return;

            // Add layer based on type
            switch (cesiumLayer.type) {
              case 'vector':
                if (cesiumLayer.dataSource) {
                  await viewer.dataSources.add(cesiumLayer.dataSource);
                  logger.debug('Added vector layer to viewer', {
                    layerId,
                    entityCount: cesiumLayer.dataSource.entities.values.length
                  });
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
            logger.error('Error syncing layer to 3D', { 
              layerId, 
              error: error instanceof Error ? error.message : error 
            });
          }
        }
      }

      if (mountedRef.current) {
        logger.info('2D to 3D synchronization complete');
      }
    } catch (error) {
      logger.error('Error during 2D to 3D synchronization', error);
      throw error;
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [map, viewer, syncViews]);

  return { syncTo3D, isLoading };
} 