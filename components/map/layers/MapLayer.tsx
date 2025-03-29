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

  logger.debug(`MapLayer instantiated`, {
    id,
    sourceId: source.id,
    originalLayerId,
    hasMap: !!mapboxInstance,
    hasLayerState: !!layerState,
    layerType: layer.type
  });

  // ===== 1. Effect for Adding/Removing Source and Layer =====
  useEffect(() => {
    logger.debug(`Effect ADD/REMOVE start`, { id, sourceId: source.id });
    let isMounted = true;

    const addLayerAndSource = async () => {
      if (!mapboxInstance) {
        logger.warn(`Add/Remove: No map instance yet`, { id });
        return;
      }

      if (!isStyleLoaded(mapboxInstance)) {
        logger.warn(`Add/Remove: Style not loaded initially, waiting...`, { id });
        mapboxInstance.once('styledata', () => {
          logger.info(`Add/Remove: Style loaded, proceeding for ${id}`);
          if (isMounted) addLayerAndSource();
        });
        return;
      }

      const map = mapboxInstance;

      try {
        logger.debug(`Add/Remove: Adding source ${source.id} if needed`);
        if (!map.getSource(source.id)) {
          map.addSource(source.id, source.data);
          logger.info(`Add/Remove: Source ${source.id} added`);
        }

        logger.debug(`Add/Remove: Adding layer ${id} if needed`);
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
          logger.info(`Add/Remove: Layer ${id} added`, { type: layerConfig.type });
          map.addLayer(layerConfig, beforeId);
        }
      } catch (error) {
        logger.error(`Add/Remove: Error during initial add`, { 
          id, 
          error: error instanceof Error ? error.message : error,
          stack: error instanceof Error ? error.stack : undefined
        });
      }
    };

    addLayerAndSource();

    return () => {
      isMounted = false;
      logger.debug(`Effect ADD/REMOVE cleanup`, { id, sourceId: source.id });
      if (mapboxInstance && !mapboxInstance._removed && isStyleLoaded(mapboxInstance)) {
        const map = mapboxInstance;
        try {
          if (map.getLayer(id)) {
            logger.info(`Cleanup: Removing layer ${id}`);
            map.removeLayer(id);
          }
          const style = map.getStyle();
          const layersUsingSource = (style?.layers || []).filter(l => l.source === source.id);
          if (layersUsingSource.length === 0 || (layersUsingSource.length === 1 && layersUsingSource[0].id === id)) {
            if (map.getSource(source.id)) {
              logger.info(`Cleanup: Removing source ${source.id} (last user)`);
              map.removeSource(source.id);
            }
          } else {
            logger.debug(`Cleanup: Keeping source ${source.id} (used by other layers)`);
          }
        } catch (cleanupError) {
          logger.error(`Cleanup: Error for ${id}`, { 
            cleanupError: cleanupError instanceof Error ? cleanupError.message : cleanupError,
            stack: cleanupError instanceof Error ? cleanupError.stack : undefined
          });
        }
      } else {
        logger.warn(`Cleanup: Skipped for ${id} (map not ready)`, { 
          isReady: mapboxInstance && !mapboxInstance._removed && isStyleLoaded(mapboxInstance) 
        });
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
        logger.info(`Effect UPDATE_DATA: Updating source ${source.id}`, { id });
        try {
          mapSource.setData(source.data.data);
          sourceDataRef.current = source.data.data;
        } catch (error) {
          logger.error(`Effect UPDATE_DATA: Error setting data for ${source.id}`, { 
            id, 
            error: error instanceof Error ? error.message : error,
            stack: error instanceof Error ? error.stack : undefined
          });
        }
      } else {
        logger.debug(`Effect UPDATE_DATA: Data unchanged for ${source.id}`, { id });
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
      logger.info(`Effect UPDATE_STYLE: Updating style properties for layer ${id}`);
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

          logger.debug(`Effect UPDATE_STYLE: Style updated for ${id}`);
        } catch (error) {
          logger.error(`Effect UPDATE_STYLE: Error updating style for ${id}`, { 
            error: error instanceof Error ? error.message : error,
            stack: error instanceof Error ? error.stack : undefined
          });
        }
      } else {
        logger.warn(`Effect UPDATE_STYLE: Layer ${id} not found`, { id });
      }
    } else {
      logger.debug(`Effect UPDATE_STYLE: Layer props unchanged for ${id}`);
    }
  }, [mapboxInstance, id, layer]);

  // ===== 4. Effect for Updating Visibility =====
  useEffect(() => {
    let retryTimeout: NodeJS.Timeout | null = null;
    let attemptCount = 0;
    const MAX_VISIBILITY_ATTEMPTS = 5; // Try a few times
    const RETRY_VISIBILITY_DELAY = 100; // ms

    const updateVisibility = () => {
      logger.debug(`Attempting visibility update for ${id}`, { 
        attempt: attemptCount + 1,
        hasMap: !!mapboxInstance,
        hasLayerState: !!layerState,
        isStyleLoaded: mapboxInstance ? isStyleLoaded(mapboxInstance) : false
      });

      // --- Check map instance and layer state first ---
      if (!mapboxInstance || !layerState) {
        logger.warn(`Visibility update skipped: No map instance or layer state`, { id });
        return; // Cannot proceed
      }

      // --- Now check style readiness ---
      if (!isStyleLoaded(mapboxInstance)) {
        logger.warn(`Visibility update: Style not loaded (attempt ${attemptCount + 1})`, { id });
        if (attemptCount < MAX_VISIBILITY_ATTEMPTS - 1) {
          attemptCount++;
          retryTimeout = setTimeout(updateVisibility, RETRY_VISIBILITY_DELAY);
        } else {
          logger.error(`Visibility update failed: Max retries exceeded`, { id });
        }
        return; // Wait for retry or give up
      }

      // --- Map is ready, proceed ---
      const map = mapboxInstance;
      if (map.getLayer(id)) {
        try {
          const currentVisibility = map.getLayoutProperty(id, 'visibility') ?? 'visible';
          const newVisibility = layerState.visible ? 'visible' : 'none';
          if (currentVisibility !== newVisibility) {
            logger.info(`Effect UPDATE_VISIBILITY: Setting visibility for ${id} to ${newVisibility}`);
            map.setLayoutProperty(id, 'visibility', newVisibility);
          } else {
            logger.debug(`Effect UPDATE_VISIBILITY: Visibility already ${newVisibility} for ${id}`);
          }
        } catch (error) {
          logger.error(`Effect UPDATE_VISIBILITY: Error setting visibility for ${id}`, { 
            error: error instanceof Error ? error.message : error,
            stack: error instanceof Error ? error.stack : undefined
          });
        }
      } else {
        // This might happen if the layer was removed just before this effect ran
        logger.warn(`Effect UPDATE_VISIBILITY: Layer ${id} not found during update attempt`);
      }
    };

    updateVisibility(); // Initial attempt

    // Cleanup function to clear timeout if component unmounts or deps change
    return () => {
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
    };
  }, [mapboxInstance, id, layerState?.visible]);

  return null;
} 