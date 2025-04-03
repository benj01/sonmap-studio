import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import mapboxgl, { 
  AnySourceData, 
  LayerSpecification, 
  Map as MapboxMap,
  GeoJSONSource,
  GeoJSONSourceSpecification,
  FillLayerSpecification,
  LineLayerSpecification,
  CircleLayerSpecification
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
    return map.isStyleLoaded() && !map.isMoving() && !map.isZooming();
  } catch {
    return false;
  }
}

function isMapIdle(map: mapboxgl.Map): boolean {
  try {
    return map.isStyleLoaded() &&
           !map.isMoving() &&
           !map.isZooming() &&
           !map.isRotating() &&
           !map.isEasing();
  } catch {
    return false;
  }
}

export function MapLayer({ id, source, layer, initialVisibility = true, beforeId }: MapLayerProps) {
  const mapboxInstance = useMapboxInstance();
  const originalLayerId = id.replace(/-fill$|-line$|-circle$/, '');
  const { layer: layerState, updateStatus } = useLayer(originalLayerId);
  const { isVisible } = useLayerVisibility(originalLayerId);

  const mountedRef = useRef(true);
  const layerRef = useRef(layer);
  const sourceDataRef = useRef(source.data.data);
  const addAttemptRef = useRef(0);

  const layerConfig = useMemo(() => ({
    ...layer,
    id,
    source: source.id,
    layout: {
      ...layer.layout,
      visibility: isVisible ? 'visible' : 'none'
    }
  } as (mapboxgl.FillLayerSpecification | mapboxgl.LineLayerSpecification | mapboxgl.CircleLayerSpecification)),
  [layer, id, source.id, isVisible]);

  // ===== 1. Effect for Adding/Removing Source and Layer =====
  useEffect(() => {
    logger.debug(`Effect ADD/REMOVE start`, { id, sourceId: source.id });
    mountedRef.current = true;
    let isEffectMounted = true;
    let sourceAddedInThisEffect = false;
    let layerAddedInThisEffect = false;
    const MAX_ADD_ATTEMPTS = 5;
    const RETRY_DELAY = 300;
    addAttemptRef.current = 0;

    const addLayerToMap = () => {
      if (!mapboxInstance || !isEffectMounted || !sourceAddedInThisEffect) {
        logger.debug(`AddLayerToMap: Skipping - basic conditions not met`, {
          id, hasMap: !!mapboxInstance, isEffectMounted, sourceAddedInThisEffect
        });
        return;
      }

      if (layerAddedInThisEffect) {
        logger.debug(`AddLayerToMap: Skipping - layer already added by this effect run`, { id });
        return;
      }

      addAttemptRef.current++;
      logger.debug(`AddLayerToMap: Attempt ${addAttemptRef.current}/${MAX_ADD_ATTEMPTS}`, { id, sourceId: source.id });

      const layerCurrentlyExists = mapboxInstance.getLayer(id);

      if (layerCurrentlyExists) {
        logger.warn(`AddLayerToMap: Layer ${id} already exists on map. Ensuring global status is complete.`, { id });
        if(layerState?.setupStatus !== 'complete' && layerState?.setupStatus !== 'error') {
          updateStatus('complete');
        }
        return;
      }

      if (!isMapStable(mapboxInstance)) {
        logger.warn(`AddLayerToMap: Map not stable, retrying...`, { id, attempt: addAttemptRef.current });
        if (addAttemptRef.current < MAX_ADD_ATTEMPTS && isEffectMounted) {
          setTimeout(addLayerToMap, RETRY_DELAY * addAttemptRef.current);
        } else if (isEffectMounted) {
          logger.error(`AddLayerToMap: Failed to add layer ${id} - map unstable after ${MAX_ADD_ATTEMPTS} attempts`, { id });
          updateStatus('error', `Map unstable during layer add for ${id}`);
        }
        return;
      }

      try {
        logger.info(`AddLayerToMap: Adding layer ${id} to map`, { id, sourceId: source.id, beforeId, type: layerConfig.type });
        mapboxInstance.addLayer(layerConfig, beforeId);

        if (mapboxInstance.getLayer(id)) {
          logger.info(`AddLayerToMap: Successfully ADDED layer ${id} BY THIS EFFECT RUN`, { id });
          layerAddedInThisEffect = true;
          updateStatus('complete');
        } else {
          logger.error(`AddLayerToMap: addLayer called for ${id} but layer not found immediately after`, { id });
          if (addAttemptRef.current < MAX_ADD_ATTEMPTS && isEffectMounted) {
            setTimeout(addLayerToMap, RETRY_DELAY * addAttemptRef.current);
          } else if (isEffectMounted) {
            updateStatus('error', `Failed to verify layer ${id} after adding`);
          }
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('already exists')) {
          logger.warn(`AddLayerToMap: Layer ${id} already exists (race condition on add). Ensuring global status complete.`, { id });
          if(layerState?.setupStatus !== 'complete' && layerState?.setupStatus !== 'error') {
            updateStatus('complete');
          }
          return;
        }

        logger.error(`AddLayerToMap: Error adding layer ${id}`, {
          id, error: error instanceof Error ? error.message : error, stack: error instanceof Error ? error.stack : undefined
        });
        if (addAttemptRef.current < MAX_ADD_ATTEMPTS && isEffectMounted) {
          setTimeout(addLayerToMap, RETRY_DELAY * addAttemptRef.current);
        } else if (isEffectMounted) {
          updateStatus('error', error instanceof Error ? error.message : `Failed adding layer ${id}`);
        }
      }
    };

    const addSourceAndLayer = async () => {
      if (!mapboxInstance) {
        logger.warn(`Add/Remove: No map instance yet for ${id}`);
        return;
      }
      if (!isEffectMounted) return;

      const sourceId = source.id;
      let sourceNeedsAdding = !mapboxInstance.getSource(sourceId);

      if (sourceNeedsAdding) {
        logger.debug(`Add/Remove: Attempting to add source ${sourceId}`, { id });
        try {
          mapboxInstance.addSource(sourceId, source.data);
          if(mapboxInstance.getSource(sourceId)) {
            logger.info(`Add/Remove: Source ${sourceId} added successfully`, { id });
            sourceAddedInThisEffect = true;
          } else {
            logger.error(`Add/Remove: addSource called for ${sourceId} but source not found immediately after.`, { id });
            updateStatus('error', `Failed to verify source ${sourceId} add`);
            return;
          }
        } catch (error) {
          if (error instanceof Error && error.message.includes('already exists')) {
            logger.warn(`Add/Remove: Source ${sourceId} already exists (race condition)`, { id });
            sourceAddedInThisEffect = true;
            if (!mapboxInstance.isSourceLoaded(sourceId)) {
              logger.debug(`Add/Remove: Source ${sourceId} exists but waiting for load`, { id });
              mapboxInstance.once('sourcedata', (e) => {
                if (e.sourceId === sourceId && e.isSourceLoaded && isEffectMounted) {
                  logger.debug(`Add/Remove: Source ${sourceId} loaded (event after race condition)`, { id });
                  addLayerToMap();
                }
              });
              return;
            } else {
              logger.debug(`Add/Remove: Source ${sourceId} exists and loaded (after race condition)`, { id });
            }
          } else {
            logger.error(`Add/Remove: Failed to add source ${sourceId}`, {
              id, error: error instanceof Error ? error.message : error, stack: error instanceof Error ? error.stack : undefined
            });
            updateStatus('error', error instanceof Error ? error.message : `Failed adding source ${sourceId}`);
            return;
          }
        }
      } else {
        logger.debug(`Add/Remove: Source ${sourceId} already exists`, { id });
        sourceAddedInThisEffect = true;
      }

      if (!mapboxInstance.isSourceLoaded(sourceId)) {
        logger.debug(`Add/Remove: Source ${sourceId} exists, waiting for load`, { id });
        const handleSourceLoad = (e: mapboxgl.MapSourceDataEvent) => {
          if (e.sourceId === sourceId && e.isSourceLoaded && isEffectMounted) {
            logger.debug(`Add/Remove: Source ${sourceId} loaded (event)`, { id });
            mapboxInstance.off('sourcedata', handleSourceLoad);
            addLayerToMap();
          }
        };
        mapboxInstance.on('sourcedata', handleSourceLoad);
        setTimeout(() => {
          if(isEffectMounted && !mapboxInstance.isSourceLoaded(sourceId)) {
            logger.error(`Add/Remove: Timeout waiting for source ${sourceId} to load`, { id });
            if(isEffectMounted) {
              updateStatus('error', `Timeout waiting for source ${sourceId}`);
            }
            mapboxInstance.off('sourcedata', handleSourceLoad);
          }
        }, 10000);
        return;
      }

      logger.debug(`Add/Remove: Source ${sourceId} exists and is loaded, proceeding to add layer`, { id });
      addLayerToMap();
    };

    const checkMapAndStart = () => {
      if(!mapboxInstance) {
        logger.warn(`Add/Remove: No map instance available yet for ${id}, waiting...`);
        setTimeout(checkMapAndStart, 500);
        return;
      }
      if (!isMapStable(mapboxInstance)) {
        logger.warn(`Add/Remove: Map not stable for ${id}, waiting...`);
        mapboxInstance.once('idle', () => {
          if (isEffectMounted) {
            checkMapAndStart();
          }
        });
        return;
      }
      if (isEffectMounted) {
        logger.debug(`Add/Remove: Map stable for ${id}, starting source/layer addition`, { id });
        addSourceAndLayer();
      }
    }

    checkMapAndStart();

    return () => {
      isEffectMounted = false;
      mountedRef.current = false;
      logger.debug(`Effect ADD/REMOVE cleanup`, { id, sourceId: source.id, sourceAddedInThisEffect, layerAddedInThisEffect });

      if (mapboxInstance && !mapboxInstance._removed) {
        const map = mapboxInstance;

        if (layerAddedInThisEffect) {
          try {
            if (map.getLayer(id)) {
              logger.info(`Cleanup: Removing layer ${id}`, { id });
              map.removeLayer(id);
            } else {
              logger.warn(`Cleanup: Layer ${id} was marked as added but not found on map`, { id });
            }
          } catch (err) {
            logger.error(`Cleanup: Error removing layer ${id}`, { id, error: err });
          }
        } else {
          logger.debug(`Cleanup: Skipping layer removal for ${id} (not added by this effect instance)`, { id });
        }

        if (sourceAddedInThisEffect) {
          try {
            const style = map.getStyle();
            const layersUsingSource = (style?.layers || []).filter(l => l?.source === source.id);

            logger.debug(`Cleanup: Checking source ${source.id} usage`, {
              id,
              layersUsingSource: layersUsingSource.map(l => l.id),
              sourceExists: !!map.getSource(source.id)
            });

            if (layersUsingSource.length === 0) {
              if (map.getSource(source.id)) {
                logger.info(`Cleanup: Removing source ${source.id} (last user)`, { id });
                map.removeSource(source.id);
              } else {
                logger.warn(`Cleanup: Source ${source.id} not found for removal, though expected.`, { id });
              }
            } else {
              logger.debug(`Cleanup: Keeping source ${source.id} (used by other layers: ${layersUsingSource.map(l=>l.id).join(', ')})`, { id });
            }
          } catch (err) {
            logger.error(`Cleanup: Error removing source ${source.id}`, { id, error: err });
          }
        } else {
          logger.debug(`Cleanup: Skipping source removal for ${source.id} (not added by this effect instance)`, { id });
        }
      } else {
        logger.warn(`Cleanup: Skipped for ${id} (Map instance not valid)`, { id, hasMap: !!mapboxInstance, removed: mapboxInstance?._removed });
      }
    };
  }, [mapboxInstance, id, source.id, source.data, layerConfig, beforeId, updateStatus]);

  // ===== 2. Effect for Updating Source Data =====
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

  // ===== 3. Effect for Updating Layer Style =====
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

    if (!isEqual(layerRef.current, layer)) {
      logger.info(`Effect UPDATE_STYLE: Detected style change for layer ${id}`, { id });

      const previousLayer = layerRef.current;
      layerRef.current = layer;

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

  // ===== 4. Effect for Updating Visibility =====
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

  return null;
}