import { useEffect, useRef, useCallback } from 'react';
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
import isEqual from 'lodash/isEqual';

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

function isGeoJSONSource(source: mapboxgl.AnySourceImpl | undefined): source is GeoJSONSource {
  return !!source && 'setData' in source && typeof (source as any).setData === 'function';
}

function isStyleLoaded(map: mapboxgl.Map): boolean {
  try {
    return typeof map.isStyleLoaded === 'function' && map.isStyleLoaded();
  } catch {
    return false;
  }
}

export function MapLayer({ id, source, layer, initialVisibility = true, beforeId }: MapLayerProps) {
  const mapboxInstance = useMapboxInstance();
  const originalLayerId = id.replace(/-fill$|-line$|-circle$/, '');
  const { layer: layerState, updateStatus } = useLayer(originalLayerId);
  const previousStatusRef = useRef(layerState?.setupStatus);

  const layerRef = useRef(layer);
  const sourceDataRef = useRef(source.data.data);

  // ===== 1. Effect for Adding/Removing Source and Layer =====
  useEffect(() => {
    let isMounted = true;

    const addLayerAndSource = async () => {
      if (!mapboxInstance) {
        return;
      }

      if (!isStyleLoaded(mapboxInstance)) {
        mapboxInstance.once('styledata', () => {
          if (isMounted) addLayerAndSource();
        });
        return;
      }

      const map = mapboxInstance;

      try {
        if (!map.getSource(source.id)) {
          map.addSource(source.id, source.data);
          logger.info(`Source added: ${source.id}`);
        }

        if (!map.getLayer(id)) {
          const layerConfig = {
            id,
            source: source.id,
            ...layer,
            layout: {
              ...layer.layout,
              visibility: layerState?.visible ? 'visible' : 'none'
            }
          } as LayerSpecification;
          map.addLayer(layerConfig, beforeId);
          logger.info(`Layer added: ${id}`);
        }
      } catch (error) {
        logger.error(`Failed to add layer/source`, { 
          id, 
          error: error instanceof Error ? error.message : error
        });
      }
    };

    addLayerAndSource();

    return () => {
      isMounted = false;
      if (mapboxInstance && !mapboxInstance._removed && isStyleLoaded(mapboxInstance)) {
        const map = mapboxInstance;
        try {
          if (map.getLayer(id)) {
            map.removeLayer(id);
            logger.info(`Layer removed: ${id}`);
          }
          const style = map.getStyle();
          const layersUsingSource = (style?.layers || []).filter(l => l.source === source.id);
          if (layersUsingSource.length === 0 || (layersUsingSource.length === 1 && layersUsingSource[0].id === id)) {
            if (map.getSource(source.id)) {
              map.removeSource(source.id);
              logger.info(`Source removed: ${source.id}`);
            }
          }
        } catch (cleanupError) {
          logger.error(`Cleanup failed`, { 
            id, 
            error: cleanupError instanceof Error ? cleanupError.message : cleanupError
          });
        }
      }
    };
  }, [mapboxInstance, id, source.id, layer.type, beforeId]);

  // ===== 2. Effect for Updating Source Data =====
  useEffect(() => {
    if (!mapboxInstance || !isStyleLoaded(mapboxInstance)) return;
    const map = mapboxInstance;
    const mapSource = map.getSource(source.id);

    if (isGeoJSONSource(mapSource) && source.data.type === 'geojson' && source.data.data) {
      if (!isEqual(sourceDataRef.current, source.data.data)) {
        try {
          mapSource.setData(source.data.data);
          sourceDataRef.current = source.data.data;
          logger.info(`Source data updated: ${source.id}`);
        } catch (error) {
          logger.error(`Failed to update source data`, { 
            id,
            sourceId: source.id,
            error: error instanceof Error ? error.message : error
          });
        }
      }
    }
  }, [mapboxInstance, id, source.id, source.data]);

  // ===== 3. Effect for Updating Layer Style =====
  useEffect(() => {
    if (!mapboxInstance || !isStyleLoaded(mapboxInstance)) return;
    const map = mapboxInstance;

    const currentLayerProps = { 
      paint: layer.paint, 
      layout: layer.layout, 
      filter: layer.filter, 
      minzoom: layer.minzoom, 
      maxzoom: layer.maxzoom 
    };
    const previousLayerProps = { 
      paint: layerRef.current.paint, 
      layout: layerRef.current.layout, 
      filter: layerRef.current.filter, 
      minzoom: layerRef.current.minzoom, 
      maxzoom: layerRef.current.maxzoom 
    };

    if (!isEqual(currentLayerProps, previousLayerProps)) {
      layerRef.current = layer;

      if (map.getLayer(id)) {
        try {
          if (layer.paint) {
            Object.entries(layer.paint).forEach(([key, value]) => {
              map.setPaintProperty(id, key as any, value);
            });
          }
          if (layer.layout) {
            Object.entries(layer.layout).forEach(([key, value]) => {
              if (key !== 'visibility') {
                map.setLayoutProperty(id, key as any, value);
              }
            });
          }
          if (layer.filter) map.setFilter(id, layer.filter);
          map.setLayerZoomRange(id, layer.minzoom ?? 0, layer.maxzoom ?? 24);
          logger.debug(`Layer style updated: ${id}`);
        } catch (error) {
          logger.error(`Failed to update layer style`, { 
            id,
            error: error instanceof Error ? error.message : error
          });
        }
      }
    }
  }, [mapboxInstance, id, layer]);

  // ===== 4. Effect for Updating Visibility =====
  useEffect(() => {
    let retryTimeout: NodeJS.Timeout | null = null;
    let attemptCount = 0;
    const MAX_VISIBILITY_ATTEMPTS = 5;
    const RETRY_VISIBILITY_DELAY = 100;

    const updateVisibility = () => {
      if (!mapboxInstance || !layerState) {
        return;
      }

      if (!isStyleLoaded(mapboxInstance)) {
        if (attemptCount < MAX_VISIBILITY_ATTEMPTS - 1) {
          attemptCount++;
          retryTimeout = setTimeout(updateVisibility, RETRY_VISIBILITY_DELAY);
        } else {
          logger.error(`Failed to update visibility after max retries`, { id });
        }
        return;
      }

      const map = mapboxInstance;
      if (map.getLayer(id)) {
        try {
          const currentVisibility = map.getLayoutProperty(id, 'visibility') ?? 'visible';
          const newVisibility = layerState.visible ? 'visible' : 'none';
          if (currentVisibility !== newVisibility) {
            map.setLayoutProperty(id, 'visibility', newVisibility);
            logger.debug(`Layer visibility updated: ${id} -> ${newVisibility}`);
          }
        } catch (error) {
          logger.error(`Failed to update visibility`, { 
            id,
            error: error instanceof Error ? error.message : error
          });
        }
      }
    };

    updateVisibility();

    return () => {
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
    };
  }, [mapboxInstance, id, layerState?.visible]);

  return null;
} 