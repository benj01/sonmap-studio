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
  // Early validation and logging
  useEffect(() => {
    logger.debug(`MapLayer render: ${id}`, {
      sourceId: source.id,
      layerType: layer.type,
      hasSourceData: !!source.data,
      sourceDataType: source.data?.type,
      hasData: !!source.data?.data,
      dataType: typeof source.data?.data,
      isGeoJSON: source.data?.type === 'geojson',
      isFeatureCollection: typeof source.data?.data !== 'string' && 
                         source.data?.data?.type === 'FeatureCollection',
      featureCount: typeof source.data?.data !== 'string' && 
                   source.data?.data?.type === 'FeatureCollection' ? 
                   source.data.data.features?.length : undefined
    });

    // Validate source data
    if (!source.data) {
      logger.error(`Invalid source data for layer ${id}`, {
        sourceId: source.id,
        source
      });
      return;
    }

    if (source.data.type === 'geojson' && !source.data.data) {
      logger.error(`Missing GeoJSON data for layer ${id}`, {
        sourceId: source.id,
        source
      });
      return;
    }

    if (source.data.type === 'geojson' && 
        typeof source.data.data !== 'string' && 
        source.data.data?.type !== 'FeatureCollection' && 
        source.data.data?.type !== 'Feature') {
      logger.error(`Invalid GeoJSON data type for layer ${id}`, {
        sourceId: source.id,
        dataType: typeof source.data.data !== 'string' ? source.data.data?.type : 'string'
      });
      return;
    }
  }, [id, source.id, source.data]);

  const mapboxInstance = useMapboxInstance();
  const originalLayerId = id.replace(/-fill$|-line$|-circle$/, '');
  const { layer: layerState, updateStatus } = useLayer(originalLayerId);
  const previousStatusRef = useRef(layerState?.setupStatus);
  const addAttemptsRef = useRef(0);
  const MAX_ADD_ATTEMPTS = 5;
  const ADD_RETRY_DELAY = 100;
  const isMountedRef = useRef(true);
  const sourceAddedRef = useRef(false);
  const layerAddedRef = useRef(false);

  const layerRef = useRef(layer);
  const sourceDataRef = useRef(source.data.data);

  // Log component lifecycle
  useEffect(() => {
    logger.debug(`MapLayer mounted: ${id}`, {
      sourceId: source.id,
      layerType: layer.type,
      originalLayerId,
      hasSourceData: !!source.data,
      sourceDataType: source.data?.type,
      hasData: !!source.data?.data
    });

    return () => {
      isMountedRef.current = false;
      logger.debug(`MapLayer unmounted: ${id}`, {
        sourceId: source.id,
        layerType: layer.type,
        originalLayerId,
        sourceAdded: sourceAddedRef.current,
        layerAdded: layerAddedRef.current
      });
    };
  }, [id, source.id, layer.type, originalLayerId]);

  // ===== 1. Effect for Adding/Removing Source and Layer =====
  useEffect(() => {
    let retryTimeout: NodeJS.Timeout | null = null;

    const addLayerAndSource = async () => {
      if (!mapboxInstance) {
        logger.debug('Map instance not available, retrying...', { 
          id,
          sourceId: source.id,
          attempts: addAttemptsRef.current,
          sourceAdded: sourceAddedRef.current,
          layerAdded: layerAddedRef.current
        });
        if (isMountedRef.current && addAttemptsRef.current < MAX_ADD_ATTEMPTS) {
          addAttemptsRef.current++;
          retryTimeout = setTimeout(addLayerAndSource, ADD_RETRY_DELAY);
        }
        return;
      }

      if (!isStyleLoaded(mapboxInstance)) {
        logger.debug('Style not loaded, waiting for styledata event', { 
          id,
          sourceId: source.id,
          sourceAdded: sourceAddedRef.current,
          layerAdded: layerAddedRef.current
        });
        mapboxInstance.once('styledata', () => {
          if (isMountedRef.current) addLayerAndSource();
        });
        return;
      }

      const map = mapboxInstance;

      try {
        // --- Source Addition ---
        if (map.getSource(source.id)) {
          logger.debug(`Source already exists: ${source.id}`, {
            id,
            layerType: layer.type,
            sourceAdded: sourceAddedRef.current,
            layerAdded: layerAddedRef.current
          });
          sourceAddedRef.current = true;
        } else {
          logger.info(`Adding source: ${source.id}`, {
            id,
            type: source.data.type,
            hasData: !!source.data.data,
            dataType: typeof source.data.data,
            isGeoJSON: source.data.type === 'geojson',
            isFeatureCollection: typeof source.data.data !== 'string' && 
                               source.data.data?.type === 'FeatureCollection',
            featureCount: typeof source.data.data !== 'string' && 
                         source.data.data?.type === 'FeatureCollection' ? 
                         source.data.data.features?.length : undefined
          });
          map.addSource(source.id, source.data);
          sourceAddedRef.current = true;
        }

        // --- Layer Addition (Attempt Immediately) ---
        if (map.getLayer(id)) {
          logger.debug(`Layer already exists: ${id}`, {
            sourceId: source.id,
            layerType: layer.type,
            sourceAdded: sourceAddedRef.current,
            layerAdded: layerAddedRef.current
          });
          layerAddedRef.current = true;
        } else {
          logger.info(`Adding layer: ${id}`, {
            sourceId: source.id,
            type: layer.type,
            visibility: layerState?.visible ? 'visible' : 'none',
            sourceAdded: sourceAddedRef.current,
            layerAdded: layerAddedRef.current
          });
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
          layerAddedRef.current = true;
        }

        // Reset attempts on success
        addAttemptsRef.current = 0;
        logger.info(`Layer and source setup complete: ${id}`, {
          sourceId: source.id,
          layerType: layer.type,
          sourceAdded: sourceAddedRef.current,
          layerAdded: layerAddedRef.current
        });
      } catch (error) {
        logger.error(`Failed to add layer/source`, { 
          id, 
          sourceId: source.id,
          error: error instanceof Error ? error.message : error,
          stack: error instanceof Error ? error.stack : undefined,
          attempts: addAttemptsRef.current,
          mapStyleLoaded: isStyleLoaded(map),
          sourceExists: !!map.getSource(source.id),
          layerExists: !!map.getLayer(id),
          sourceAdded: sourceAddedRef.current,
          layerAdded: layerAddedRef.current
        });

        // Retry on failure if we haven't exceeded max attempts
        if (isMountedRef.current && addAttemptsRef.current < MAX_ADD_ATTEMPTS) {
          addAttemptsRef.current++;
          retryTimeout = setTimeout(addLayerAndSource, ADD_RETRY_DELAY);
        }
      }
    };

    addLayerAndSource();

    return () => {
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
      if (mapboxInstance && !mapboxInstance._removed && isStyleLoaded(mapboxInstance)) {
        const map = mapboxInstance;
        try {
          if (map.getLayer(id)) {
            map.removeLayer(id);
            logger.info(`Layer removed: ${id}`);
            layerAddedRef.current = false;
          }
          const style = map.getStyle();
          const layersUsingSource = (style?.layers || []).filter(l => l.source === source.id);
          if (layersUsingSource.length === 0 || (layersUsingSource.length === 1 && layersUsingSource[0].id === id)) {
            if (map.getSource(source.id)) {
              map.removeSource(source.id);
              logger.info(`Source removed: ${source.id}`);
              sourceAddedRef.current = false;
            }
          }
        } catch (cleanupError) {
          logger.error(`Cleanup failed`, { 
            id, 
            sourceId: source.id,
            error: cleanupError instanceof Error ? cleanupError.message : cleanupError,
            sourceAdded: sourceAddedRef.current,
            layerAdded: layerAddedRef.current
          });
        }
      }
    };
  }, [mapboxInstance, id, source.id, layer.type, beforeId, layerState?.visible]);

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