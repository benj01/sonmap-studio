import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import mapboxgl, { 
  AnySourceData, 
  LayerSpecification, 
  Map as MapboxMap,
  GeoJSONSource,
  GeoJSONSourceSpecification,
  FillLayerSpecification,
  LineLayerSpecification,
  CircleLayerSpecification,
  MapSourceDataEvent
} from 'mapbox-gl';
import { useMapboxInstance } from '@/store/map/mapInstanceStore';
import { useLayer, useLayerVisibility } from '@/store/layers/hooks';
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
  layer: Omit<FillLayerSpecification | LineLayerSpecification | CircleLayerSpecification, 'id' | 'source'>;
  initialVisibility?: boolean;
  beforeId?: string;
}

function isGeoJSONSource(source: mapboxgl.AnySourceImpl | undefined): source is GeoJSONSource {
  return !!source && 'setData' in source && typeof (source as any).setData === 'function';
}

function isMapStable(map: mapboxgl.Map): boolean {
  try {
    logger.debug("Checking map.isStyleLoaded()..."); // Log before
    const loaded = map.isStyleLoaded();
    logger.debug(`map.isStyleLoaded() returned: ${loaded}`); // Log after
    return loaded;
  } catch (error) {
    logger.warn(`isMapStable check failed`, { error });
    return false;
  }
}

function isMapIdle(map: mapboxgl.Map): boolean {
  try {
    // Let's also simplify this for now, maybe zooming/moving checks were too strict
    return map.isStyleLoaded() && !map.isMoving(); // Only check moving, allow zooming
  } catch (error) {
    logger.warn(`isMapIdle check failed`, { error });
    return false;
  }
}

export function MapLayer({ id, source, layer, initialVisibility = true, beforeId }: MapLayerProps) {
  console.log(`MapLayer RENDER START for id: ${id}`);
  const mapboxInstance = useMapboxInstance();
  console.log(`MapLayer after useMapboxInstance for id: ${id}, hasMap: ${!!mapboxInstance}`);
  const originalLayerId = id.replace(/-fill$|-line$|-circle$/, '');
  const { layer: layerState, updateStatus } = useLayer(originalLayerId);
  const { isVisible } = useLayerVisibility(originalLayerId);

  // Add detailed logging for component state
  logger.info(`MapLayer component RENDERING/MOUNTING`, { 
    id, 
    sourceId: source.id,
    hasMap: !!mapboxInstance,
    mapStable: mapboxInstance ? isMapStable(mapboxInstance) : false,
    mapIdle: mapboxInstance ? isMapIdle(mapboxInstance) : false,
    layerState: layerState?.setupStatus,
    isVisible
  });

  const mountedRef = useRef(true);
  const layerStyleRef = useRef(layer);
  const sourceDataRef = useRef(source.data.data);
  const sourceSpecRef = useRef(source.data);
  const layerConfigRef = useRef<FillLayerSpecification | LineLayerSpecification | CircleLayerSpecification>({
    ...layer,
    id,
    source: source.id,
    layout: {
      ...layer.layout
    }
  } as FillLayerSpecification | LineLayerSpecification | CircleLayerSpecification);

  useEffect(() => {
    layerStyleRef.current = layer;
  }, [layer]);
  useEffect(() => {
    sourceDataRef.current = source.data.data;
    sourceSpecRef.current = source.data;
  }, [source.data]);

  useEffect(() => {
    layerConfigRef.current = {
      ...layerStyleRef.current,
      id,
      source: source.id,
      layout: {
        ...layerStyleRef.current.layout,
      }
    } as (mapboxgl.FillLayerSpecification | mapboxgl.LineLayerSpecification | mapboxgl.CircleLayerSpecification);
    logger.debug("Updated layerConfigRef", { id });
  }, [id, source.id]);

  // Add mount/unmount logging
  useEffect(() => {
    console.log(`MapLayer MOUNTED effect for id: ${id}`);
    logger.info(`MapLayer component MOUNTED`, { 
      id, 
      sourceId: source.id,
      hasMap: !!mapboxInstance,
      mapStable: mapboxInstance ? isMapStable(mapboxInstance) : false,
      mapIdle: mapboxInstance ? isMapIdle(mapboxInstance) : false
    });

    return () => {
      console.log(`MapLayer UNMOUNTING effect for id: ${id}`);
      logger.info(`MapLayer component UNMOUNTING`, { 
        id, 
        sourceId: source.id,
        hasMap: !!mapboxInstance,
        mapStable: mapboxInstance ? isMapStable(mapboxInstance) : false,
        mapIdle: mapboxInstance ? isMapIdle(mapboxInstance) : false
      });
    };
  }, [id, source.id, mapboxInstance]);

  useEffect(() => {
    logger.info(`Effect ADD/REMOVE START`, { id, sourceId: source.id });
    mountedRef.current = true;
    let isEffectMounted = true;
    let sourceAddedLocally = false;
    let layerAddedLocally = false;
    let idleListener: (() => void) | null = null;
    let sourceLoadTimeoutId: NodeJS.Timeout | null = null;
    let sourceLoadListener: ((e: MapSourceDataEvent) => void) | null = null;

    const cleanup = () => {
      logger.info(`Effect ADD/REMOVE CLEANUP START`, { id, sourceId: source.id, sourceAddedLocally, layerAddedLocally });
      isEffectMounted = false;
      if (idleListener && mapboxInstance && !mapboxInstance._removed) {
        try { mapboxInstance.off('idle', idleListener); } catch(e) {}
      }
      if (sourceLoadTimeoutId) clearTimeout(sourceLoadTimeoutId);
      if (sourceLoadListener && mapboxInstance && !mapboxInstance._removed) {
        try { mapboxInstance.off('sourcedata', sourceLoadListener); } catch(e) {}
      }

      if (mapboxInstance && !mapboxInstance._removed && mapboxInstance.getCanvas()) {
        const map = mapboxInstance;
        logger.debug(`Cleanup: Performing map operations for ${id}`);

        let removeSourceAttemptAllowed = sourceAddedLocally;

        // --- Layer Removal FIRST ---
        if (layerAddedLocally) {
          if (map.getLayer(id)) {
            try {
              logger.info(`Cleanup: Removing layer ${id} (added locally)`, { id });
              map.removeLayer(id);
            } catch (e) {
              logger.error(`Cleanup: Error removing layer ${id}`, { id, error: e });
              removeSourceAttemptAllowed = false;
            }
          } else {
            logger.debug(`Cleanup: Layer ${id} marked added locally but already removed.`, { id });
          }
        } else {
          logger.debug(`Cleanup: Skipping layer removal for ${id} (not added locally)`, { id });
        }

        // --- Source Removal Check/Attempt SECOND (No Delay) ---
        if (removeSourceAttemptAllowed) {
          if (map.getSource(source.id)) {
            try {
              const style = map.getStyle();
              const layersUsingSource = (style?.layers || []).filter(l => l.id !== id && l?.source === source.id);
              logger.debug(`Cleanup: Checking source ${source.id} usage immediately`, { id, layersUsingSource: layersUsingSource.map(l=>l.id) });

              if (layersUsingSource.length === 0) {
                logger.info(`Cleanup: Removing source ${source.id} (added locally, no other users)`, { id });
                map.removeSource(source.id);
              } else {
                logger.debug(`Cleanup: Keeping source ${source.id} (added locally, used by others: ${layersUsingSource.map(l=>l.id).join(', ')})`, { id });
              }
            } catch (e) {
              logger.error(`Cleanup: Error checking/removing source ${source.id}`, { id, error: e });
            }
          } else {
            logger.debug(`Cleanup: Source ${source.id} marked added locally but already removed.`, { id });
          }
        } else {
          logger.debug(`Cleanup: Skipping source removal for ${source.id}`, { id, sourceAddedLocally, removeSourceAttemptAllowed });
        }
      } else {
        logger.warn(`Cleanup: Skipped map operations for ${id} (Map invalid)`, { id, hasMap: !!mapboxInstance, removed: mapboxInstance?._removed });
      }
      logger.info(`Effect ADD/REMOVE CLEANUP END`, { id });
    };

    const proceedToAddLayer = (map: mapboxgl.Map) => {
      if (!isEffectMounted) return;
      logger.debug(`Proceeding to add layer ${id} after source is ready.`);
      try {
        if (!map.getLayer(id)) {
          if (!layerConfigRef.current) {
            logger.error(`Add/Remove: Layer config ref is not set for ${id}! Cannot add layer.`, { id });
            updateStatus('error', `Internal error: Layer config missing for ${id}`);
            return;
          }
          logger.info(`Add/Remove: Adding layer ${id}`, { id, layerConfig: { type: layerConfigRef.current.type, layout: layerConfigRef.current.layout } });
          map.addLayer(layerConfigRef.current, beforeId);
          layerAddedLocally = true;

          if (!map.getLayer(id)) {
            logger.error(`Add/Remove: Layer ${id} not found immediately after addLayer call!`, { id });
            updateStatus('error', `Failed to verify layer ${id} after adding`);
            return;
          } else {
            logger.info(`Add/Remove: Successfully added source/layer ${id}`, { id });
            updateStatus('complete');
            return;
          }
        } else {
          logger.warn(`Add/Remove: Layer ${id} already exists. Assuming success.`, { id });
          layerAddedLocally = false;
          if(layerState?.setupStatus !== 'complete') updateStatus('complete');
          return;
        }
      } catch (error: any) {
        logger.error(`Add/Remove: Error adding layer ${id}`, {
          id,
          error: error.message || error,
          stack: error.stack,
          sourceAddedLocally,
          layerAddedLocally
        });
        if (!error.message?.includes('already exists') && isEffectMounted) {
          updateStatus('error', error.message || `Failed adding layer ${id}`);
        } else if (isEffectMounted && error.message?.includes('already exists')) {
          if(layerState?.setupStatus !== 'complete') updateStatus('complete');
        }
      }
    };

    const checkSourceAndAddLayer = (map: mapboxgl.Map) => {
      if (!isEffectMounted) return;
      const sourceId = source.id;
      logger.debug(`Checking source ${sourceId} state before adding layer ${id}`);

      if (map.isSourceLoaded(sourceId)) {
        logger.debug(`Source ${sourceId} is already loaded.`);
        proceedToAddLayer(map);
      } else {
        logger.debug(`Source ${sourceId} not loaded yet. Waiting for sourcedata event...`);

        if (sourceLoadTimeoutId) clearTimeout(sourceLoadTimeoutId);
        if (sourceLoadListener) try { map.off('sourcedata', sourceLoadListener); } catch(e) {}

        sourceLoadListener = (e: MapSourceDataEvent) => {
          if (e.sourceId === sourceId && e.isSourceLoaded && e.dataType === 'source' && isEffectMounted) {
            logger.info(`'sourcedata' event confirmed source ${sourceId} loaded for ${id}`);
            if (sourceLoadTimeoutId) clearTimeout(sourceLoadTimeoutId);
            try { map.off('sourcedata', sourceLoadListener!); } catch(e) {}
            sourceLoadListener = null;
            proceedToAddLayer(map);
          }
        };

        map.on('sourcedata', sourceLoadListener);

        sourceLoadTimeoutId = setTimeout(() => {
          if (!isEffectMounted) return;
          logger.error(`Timeout waiting for source ${sourceId} to load for layer ${id}`);
          if (sourceLoadListener) try { map.off('sourcedata', sourceLoadListener); } catch(e) {}
          sourceLoadListener = null;
          if (map.getSource(sourceId) && map.isSourceLoaded(sourceId)) {
            proceedToAddLayer(map);
          } else {
            updateStatus('error', `Timeout waiting for source ${sourceId}`);
          }
        }, 5000);
      }
    };

    const initializeLayer = () => {
      if (!isEffectMounted || !mapboxInstance || !mapboxInstance.getCanvas() || mapboxInstance._removed) {
        logger.warn(`initializeLayer: Cannot proceed, component unmounted or map invalid`, { id });
        return;
      }
      logger.info(`Initializing layer ${id} after map idle.`);
      const map = mapboxInstance;
      const sourceId = source.id;

      try {
        if (!map.getSource(sourceId)) {
          logger.info(`Initializing: Adding source ${sourceId}`, { id });
          map.addSource(sourceId, sourceSpecRef.current);
          sourceAddedLocally = true;
          checkSourceAndAddLayer(map);
        } else {
          logger.debug(`Initializing: Source ${sourceId} already exists.`, { id });
          sourceAddedLocally = false;
          checkSourceAndAddLayer(map);
        }
      } catch (error: any) {
        logger.error(`Initializing: Error adding source ${sourceId}`, { id, error: error.message });
        if (error.message?.includes('already exists')) {
          logger.warn(`Initializing: Source ${sourceId} already exists (caught error). Checking load state.`, { id });
          sourceAddedLocally = false;
          checkSourceAndAddLayer(map);
        } else if (isEffectMounted) {
          updateStatus('error', `Failed adding source ${sourceId}: ${error.message}`);
        }
      }
    };

    if (mapboxInstance) {
      const map = mapboxInstance;
      if (!map.isMoving()) {
        logger.debug(`Map is idle for ${id}. Initializing layer now.`);
        initializeLayer();
      } else {
        logger.debug(`Map not idle for ${id}. Waiting for 'idle' event.`);
        idleListener = () => {
          logger.info(`'idle' event received for ${id}.`);
          initializeLayer();
        };
        setTimeout(() => {
          if (isEffectMounted && mapboxInstance && !mapboxInstance._removed) {
            if (!mapboxInstance.isMoving()) {
              logger.debug(`Map became idle during timeout for ${id}. Initializing now.`);
              initializeLayer();
            } else {
              logger.debug(`Still not idle after timeout, attaching 'once(idle)' listener for ${id}.`);
              if (idleListener) mapboxInstance.once('idle', idleListener);
            }
          }
        }, 100);
      }
    } else {
      logger.warn(`Effect ADD/REMOVE: No map instance available yet for ${id}.`);
    }

    return cleanup;
  }, [mapboxInstance, id, source.id, beforeId, updateStatus, layerState?.setupStatus]);

  useEffect(() => {
    if (!mapboxInstance) return;
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
            id, error: error instanceof Error ? error.message : error
          });
        }
      }
    }
  }, [mapboxInstance, id, source.id, source.data]);

  useEffect(() => {
    if (!mapboxInstance || !isMapIdle(mapboxInstance)) {
      logger.debug(`Style update skipped for ${id}`, {
        id, hasMap: !!mapboxInstance, mapIdle: mapboxInstance ? isMapIdle(mapboxInstance): false
      });
      return;
    }

    const map = mapboxInstance;
    const layerExists = map.getLayer(id);

    if (!layerExists) {
      logger.debug(`Style update skipped for ${id} - layer not found on map`, { id });
      return;
    }

    if (!isEqual(layerStyleRef.current, layer)) {
      logger.info(`Effect UPDATE_STYLE: Detected style change for layer ${id}`, { id });

      const previousLayer = layerStyleRef.current;
      layerStyleRef.current = layer;

      try {
        if (!isEqual(previousLayer.paint, layer.paint)) {
          Object.entries(layer.paint || {}).forEach(([key, value]) => {
            if (value !== undefined && !isEqual((previousLayer.paint as any)?.[key], value)) {
              logger.debug(`Setting paint property for ${id}`, { key, value });
              map.setPaintProperty(id, key as any, value);
            }
          });
          Object.keys(previousLayer.paint || {}).forEach(key => {
            if ((layer.paint as any)?.[key] === undefined) {
              logger.debug(`Paint property removed (or handled by mapbox default)`, { id, key });
            }
          });
        }

        const currentLayout = { ...layer.layout } as Record<string, any>; 
        delete currentLayout.visibility;
        const previousLayout = { ...previousLayer.layout } as Record<string, any>; 
        delete previousLayout.visibility;
        if (!isEqual(previousLayout, currentLayout)) {
          Object.entries(currentLayout || {}).forEach(([key, value]) => {
            if (value !== undefined && !isEqual((previousLayout as any)?.[key], value)) {
              logger.debug(`Setting layout property for ${id}`, { key, value });
              map.setLayoutProperty(id, key as any, value);
            }
          });
          Object.keys(previousLayout || {}).forEach(key => {
            if ((currentLayout as any)?.[key] === undefined) {
              logger.debug(`Layout property removed (or handled by mapbox default)`, { id, key });
            }
          });
        }

        if (!isEqual(previousLayer.filter, layer.filter)) {
          logger.debug(`Setting filter for ${id}`, { filter: layer.filter });
          map.setFilter(id, layer.filter || null);
        }

        if (previousLayer.minzoom !== layer.minzoom || previousLayer.maxzoom !== layer.maxzoom) {
          logger.debug(`Setting zoom range for ${id}`, { minzoom: layer.minzoom, maxzoom: layer.maxzoom });
          map.setLayerZoomRange(id, layer.minzoom ?? 0, layer.maxzoom ?? 24);
        }

        logger.info(`Effect UPDATE_STYLE: Style updated for ${id}`);
      } catch (error) {
        logger.error(`Effect UPDATE_STYLE: Error updating style for ${id}`, {
          id, error: error instanceof Error ? error.message : error
        });
      }
    }
  }, [mapboxInstance, id, layer]);

  useEffect(() => {
    if (!mapboxInstance) {
      logger.debug(`Visibility update skipped for ${id} - no map instance`, { id });
      return;
    }

    const map = mapboxInstance;
    const layerExists = map.getLayer(id);
    const targetVisibility = isVisible ? 'visible' : 'none';

    if (!layerExists) {
      logger.debug(`Visibility update skipped for ${id} - layer not found on map`, { id });
      return;
    }

    try {
      const currentVisibility = map.getLayoutProperty(id, 'visibility') ?? 'visible';
      if (currentVisibility !== targetVisibility) {
        logger.info(`Effect UPDATE_VISIBILITY: Setting visibility for ${id} to ${targetVisibility}`);
        map.setLayoutProperty(id, 'visibility', targetVisibility);
      } else {
        logger.debug(`Effect UPDATE_VISIBILITY: Visibility already ${targetVisibility} for ${id}`);
      }
    } catch (error) {
      logger.error(`Effect UPDATE_VISIBILITY: Error setting visibility for ${id}`, {
        id, 
        targetVisibility, 
        error: error instanceof Error ? error.message : error
      });
    }
  }, [mapboxInstance, id, isVisible]);

  console.log(`MapLayer RENDER END for id: ${id}`);
  return null;
}