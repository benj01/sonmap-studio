import { useEffect } from 'react';
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

export function MapLayer({ id, source, layer, initialVisibility = true, beforeId }: MapLayerProps) {
  const mapboxInstance = useMapboxInstance();
  const originalLayerId = id.replace(/-fill$|-line$|-circle$/, '');
  const { layer: layerState, updateStatus } = useLayer(originalLayerId);

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

    if (!mapboxInstance) {
      logger.warn(`No map instance available`, { id });
      return;
    }

    if (!mapboxInstance.isStyleLoaded()) {
      logger.warn(`Map style not loaded`, { id });
      return;
    }

    if (!layerState) {
      logger.warn(`No layer state available`, { id });
      return;
    }

    const addSourceAndLayer = async () => {
      try {
        // Check if source exists
        const existingSource = mapboxInstance.getSource(source.id);
        if (!existingSource) {
          logger.info(`Adding source`, {
            sourceId: source.id,
            type: source.data.type,
            hasFeatures: source.data.type === 'geojson' && 
              'data' in source.data && 
              typeof source.data.data === 'object' &&
              source.data.data !== null
          });

          mapboxInstance.addSource(source.id, source.data);
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
        const existingLayer = mapboxInstance.getLayer(id);
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

          mapboxInstance.addLayer(layerConfig, beforeId);
          logger.debug(`Layer added successfully`, { layerId: id });
          updateStatus('complete');
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
        updateStatus('error', error instanceof Error ? error.message : 'Unknown error');
      }
    };

    addSourceAndLayer();

    return () => {
      logger.debug(`Effect cleanup`, { id, hasMap: !!mapboxInstance });
      if (!mapboxInstance || !mapboxInstance.getLayer || !mapboxInstance.removeLayer) return;

      try {
        if (mapboxInstance.getLayer(id)) {
          logger.info(`Removing layer during cleanup`, { layerId: id });
          mapboxInstance.removeLayer(id);
        }

        // Only remove source if no other layers are using it
        const style = mapboxInstance.getStyle();
        const layers = style?.layers || [];
        const sourceUsers = layers
          .filter(l => l.source === source.id)
          .map(l => l.id);
        
        if (sourceUsers.length <= 1 && mapboxInstance.getSource(source.id)) {
          logger.info(`Removing source during cleanup`, { sourceId: source.id });
          mapboxInstance.removeSource(source.id);
        } else {
          logger.debug(`Skipping source removal - still in use`, {
            sourceId: source.id,
            usedBy: sourceUsers
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
  }, [mapboxInstance, id, source, layer, layerState, beforeId, updateStatus]);

  useEffect(() => {
    logger.debug(`Effect VISIBILITY start`, {
      id,
      hasMap: !!mapboxInstance,
      isStyleLoaded: mapboxInstance?.isStyleLoaded?.(),
      desiredVisibility: layerState?.visible
    });

    if (!mapboxInstance || !mapboxInstance.isStyleLoaded() || !layerState) {
      return;
    }

    try {
      if (mapboxInstance.getLayer(id)) {
        const currentVisibility = mapboxInstance.getLayoutProperty(id, 'visibility');
        const newVisibility = layerState.visible ? 'visible' : 'none';

        if (currentVisibility !== newVisibility) {
          logger.info(`Updating layer visibility`, {
            layerId: id,
            from: currentVisibility,
            to: newVisibility
          });
          mapboxInstance.setLayoutProperty(id, 'visibility', newVisibility);
        }
      }
    } catch (error) {
      logger.error(`Error updating visibility`, {
        error: error instanceof Error ? error.message : error,
        id
      });
    }
  }, [mapboxInstance, id, layerState?.visible]);

  return null;
} 