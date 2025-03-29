import { useEffect, useRef } from 'react';
import mapboxgl, { 
  AnySourceData, 
  LayerSpecification, 
  Map as MapboxMap,
  GeoJSONSource,
  GeoJSONSourceSpecification
} from 'mapbox-gl';
import { useMapboxInstance } from '@/store/map/mapInstanceStore';
import { useLayer } from '@/store/layers/hooks';
import { LogManager } from '@/core/logging/log-manager';
import type { Feature, Geometry, GeoJSON } from 'geojson';

const SOURCE = 'MapLayer';
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

export interface MapLayerProps {
  id: string;
  source: {
    id: string;
    data: GeoJSONSourceSpecification;
  };
  layer: Omit<LayerSpecification, 'id' | 'source'>;
  initialVisibility?: boolean;
  beforeId?: string;
}

function isGeoJSONSource(source: mapboxgl.AnySourceImpl): source is GeoJSONSource {
  return 'setData' in source && typeof (source as any).setData === 'function';
}

function isMapReady(map: mapboxgl.Map | null): map is mapboxgl.Map {
  if (!map) return false;
  try {
    // Check if map is removed using type assertion since _removed is internal
    const mapInstance = map as mapboxgl.Map & { _removed?: boolean };
    if (mapInstance._removed) return false;
    return typeof mapInstance.isStyleLoaded === 'function' && 
           mapInstance.isStyleLoaded() &&
           typeof mapInstance.getLayer === 'function' &&
           typeof mapInstance.addLayer === 'function';
  } catch {
    return false;
  }
}

export function MapLayer({ id, source, layer, initialVisibility = true, beforeId }: MapLayerProps) {
  const mapboxInstance = useMapboxInstance();
  const originalLayerId = id.replace(/-fill$|-line$|-circle$/, '');
  const { layer: layerState, updateStatus } = useLayer(originalLayerId);
  const previousStatusRef = useRef(layerState?.setupStatus);

  logger.debug(`MapLayer instantiated`, {
    id,
    sourceId: source.id,
    originalLayerId,
    hasMap: !!mapboxInstance,
    hasLayerState: !!layerState,
    layerType: layer.type
  });

  useEffect(() => {
    logger.debug(`Effect ADD/UPDATE start`, {
      id,
      hasMap: !!mapboxInstance,
      isStyleLoaded: mapboxInstance?.isStyleLoaded?.(),
      hasLayerState: !!layerState,
      sourceId: source.id,
      layerType: layer.type
    });

    if (!isMapReady(mapboxInstance)) {
      logger.warn(`Map not ready`, {
        id,
        hasMap: !!mapboxInstance,
        isStyleLoaded: mapboxInstance?.isStyleLoaded?.(),
        isRemoved: mapboxInstance?._removed
      });
      return;
    }

    // At this point TypeScript knows mapboxInstance is non-null and ready
    const map = mapboxInstance;

    if (!layerState) {
      logger.warn(`No layer state available`, { id });
      return;
    }

    const addSourceAndLayer = async () => {
      try {
        // Check if source exists
        const existingSource = map.getSource(source.id);
        if (!existingSource) {
          logger.info(`Adding source`, {
            sourceId: source.id,
            type: source.data.type,
            hasFeatures: source.data.type === 'geojson' && 
              'data' in source.data && 
              typeof source.data.data === 'object' &&
              source.data.data !== null
          });

          map.addSource(source.id, source.data);
          logger.debug(`Source added successfully`, { sourceId: source.id });
        } else {
          logger.debug(`Source already exists`, { sourceId: source.id });
          // Update source data if it's GeoJSON
          if (isGeoJSONSource(existingSource) && source.data.type === 'geojson' && source.data.data) {
            logger.debug(`Updating existing source data`, { sourceId: source.id });
            existingSource.setData(source.data.data);
          }
        }

        // Check if layer exists
        const existingLayer = map.getLayer(id);
        if (!existingLayer) {
          const layerConfig = {
            id,
            source: source.id,
            ...layer,
            layout: {
              ...layer.layout,
              visibility: layerState.visible ? 'visible' : 'none'
            }
          } as LayerSpecification;

          logger.info(`Adding layer`, {
            layerId: id,
            type: layerConfig.type,
            sourceId: layerConfig.source,
            paint: layerConfig.paint,
            layout: layerConfig.layout,
            beforeId
          });

          map.addLayer(layerConfig, beforeId);
          logger.debug(`Layer added successfully`, { layerId: id });

          // Only update status if it actually changes
          if (previousStatusRef.current !== 'complete') {
            previousStatusRef.current = 'complete';
            updateStatus('complete');
          }
        } else {
          logger.debug(`Layer already exists`, { layerId: id });
        }
      } catch (error) {
        logger.error(`Error in addSourceAndLayer`, {
          error: error instanceof Error ? error.message : error,
          stack: error instanceof Error ? error.stack : undefined,
          id,
          sourceId: source.id
        });

        // Only update status if it actually changes
        if (previousStatusRef.current !== 'error') {
          previousStatusRef.current = 'error';
          updateStatus('error', error instanceof Error ? error.message : 'Unknown error');
        }
      }
    };

    addSourceAndLayer();

    return () => {
      logger.debug(`Effect cleanup`, {
        id,
        hasMap: !!mapboxInstance,
        isMapReady: isMapReady(mapboxInstance)
      });

      // Only attempt cleanup if map is in a good state
      if (!isMapReady(mapboxInstance)) {
        logger.warn(`Skipping cleanup - map not ready`, {
          id,
          hasMap: !!mapboxInstance,
          isStyleLoaded: mapboxInstance?.isStyleLoaded?.(),
          isRemoved: mapboxInstance?._removed
        });
        return;
      }

      // At this point TypeScript knows mapboxInstance is non-null and ready
      const map = mapboxInstance;

      try {
        // Always try to remove the layer first
        if (map.getLayer(id)) {
          logger.info(`Removing layer during cleanup`, { layerId: id });
          map.removeLayer(id);
        }

        // Check if any other layers are using this source before removing it
        const style = map.getStyle();
        const layersUsingSource = (style?.layers || [])
          .filter(l => l.source === source.id && l.id !== id);

        if (layersUsingSource.length === 0 && map.getSource(source.id)) {
          logger.info(`Removing source during cleanup (last user)`, {
            sourceId: source.id
          });
          map.removeSource(source.id);
        } else {
          logger.debug(`Keeping source - still in use`, {
            sourceId: source.id,
            usedByLayers: layersUsingSource.map(l => l.id)
          });
        }
      } catch (cleanupError) {
        logger.error(`Error during cleanup`, {
          error: cleanupError instanceof Error ? cleanupError.message : cleanupError,
          id,
          sourceId: source.id
        });
      }
    };
  }, [mapboxInstance, id, source, layer, beforeId]); // Removed layerState and updateStatus from deps

  useEffect(() => {
    if (!isMapReady(mapboxInstance) || !layerState) {
      logger.debug(`Skipping visibility update - map or layer not ready`, {
        id,
        hasMap: !!mapboxInstance,
        hasLayerState: !!layerState,
        isMapReady: isMapReady(mapboxInstance)
      });
      return;
    }

    // At this point TypeScript knows mapboxInstance is non-null and ready
    const map = mapboxInstance;

    try {
      if (map.getLayer(id)) {
        const currentVisibility = map.getLayoutProperty(id, 'visibility');
        const newVisibility = layerState.visible ? 'visible' : 'none';

        if (currentVisibility !== newVisibility) {
          logger.info(`Updating layer visibility`, {
            layerId: id,
            from: currentVisibility,
            to: newVisibility,
            triggeredBy: 'visibility toggle'
          });
          map.setLayoutProperty(id, 'visibility', newVisibility);
        } else {
          logger.debug(`Visibility unchanged`, {
            layerId: id,
            visibility: currentVisibility,
            matchesState: layerState.visible
          });
        }
      } else {
        logger.warn(`Layer not found for visibility update`, { layerId: id });
      }
    } catch (error) {
      logger.error(`Error updating visibility`, {
        error: error instanceof Error ? error.message : error,
        id,
        stack: error instanceof Error ? error.stack : undefined
      });
    }
  }, [mapboxInstance, id, layerState?.visible]); // Restored layerState.visible dependency

  return null;
} 