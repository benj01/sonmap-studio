import { useEffect, useRef, useCallback, useState } from 'react';
import mapboxgl, { 
  AnySourceData, 
  LayerSpecification, 
  Map as MapboxMap,
  GeoJSONSource,
  GeoJSONSourceSpecification
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
  layer: Omit<LayerSpecification, 'id' | 'source'>;
  initialVisibility?: boolean;
  beforeId?: string;
}

function isGeoJSONSource(source: mapboxgl.AnySourceImpl | undefined): source is GeoJSONSource {
  return !!source && 'setData' in source && typeof (source as any).setData === 'function';
}

function isMapStable(map: mapboxgl.Map): boolean {
  try {
    // Check if style is loaded AND map is not actively changing
    return map.isStyleLoaded() &&
           !map.isMoving() &&
           !map.isZooming() &&
           !map.isRotating() &&
           !map.isEasing();
  } catch {
    return false;
  }
}

function isStyleLoaded(map: mapboxgl.Map): boolean {
  return isMapStable(map);
}

export function MapLayer({ id, source, layer, initialVisibility = true, beforeId }: MapLayerProps) {
  const mapboxInstance = useMapboxInstance();
  const originalLayerId = id.replace(/-fill$|-line$|-circle$/, '');
  const { layer: layerState, updateStatus } = useLayer(originalLayerId);
  const { isVisible } = useLayerVisibility(originalLayerId);
  const previousStatusRef = useRef(layerState?.setupStatus);
  const layerAddedRef = useRef(false);
  const [isLayerReady, setIsLayerReady] = useState(false);
  const internalLayerAddedRef = useRef(false);
  const [isSourceReady, setIsSourceReady] = useState(false);
  const sourceLoadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const sourceLoadAttemptsRef = useRef(0);
  const MAX_SOURCE_LOAD_ATTEMPTS = 3;
  const SOURCE_LOAD_TIMEOUT = 5000; // 5 seconds
  const mountedRef = useRef(true);
  const layerRef = useRef(layer);
  const sourceDataRef = useRef(source.data.data);

  logger.debug(`MapLayer instantiated`, {
    id,
    sourceId: source.id,
    originalLayerId,
    hasMap: !!mapboxInstance,
    hasLayerState: !!layerState,
    layerType: layer.type,
    isVisible,
    isLayerReady,
    previousStatus: previousStatusRef.current
  });

  // ===== 1. Effect for Adding/Removing Source and Layer =====
  useEffect(() => {
    logger.debug(`Effect ADD/REMOVE start`, { 
      id, 
      sourceId: source.id,
      isSourceReady,
      sourceLoadAttempts: sourceLoadAttemptsRef.current,
      previousStatus: previousStatusRef.current
    });
    
    mountedRef.current = true;
    let isMounted = true;
    let retryCount = 0;
    const MAX_RETRIES = 10;
    const RETRY_DELAY = 500;

    const handleSourceData = (e: mapboxgl.MapSourceDataEvent) => {
      if (!mountedRef.current || !isMounted) return;
      
      if (e.sourceId === source.id) {
        logger.debug(`Source data event received for ${source.id}`, {
          isSourceLoaded: e.isSourceLoaded,
          sourceDataType: e.sourceDataType,
          attempt: sourceLoadAttemptsRef.current
        });

        if (e.isSourceLoaded) {
          setIsSourceReady(true);
          if (sourceLoadTimeoutRef.current) {
            clearTimeout(sourceLoadTimeoutRef.current);
          }
          if (isMounted) {
            addMapLayer();
          }
        }
      }
    };

    const addMapLayer = () => {
      if (!mapboxInstance || !isMounted || !isSourceReady) {
        logger.debug(`Add/Remove: Cannot add layer ${id}`, {
          hasMap: !!mapboxInstance,
          isMounted,
          isSourceReady
        });
        return false;
      }

      try {
        if (!mapboxInstance.getLayer(id)) {
          const layerConfig = {
            id,
            source: source.id,
            ...layer,
            layout: {
              ...layer.layout,
              visibility: isVisible ? 'visible' : 'none'
            }
          } as LayerSpecification;

          logger.info(`Add/Remove: Adding layer ${id}`, { 
            type: layerConfig.type,
            initialVisibility: isVisible,
            sourceId: source.id,
            isSourceReady
          });

          mapboxInstance.addLayer(layerConfig, beforeId);
          layerAddedRef.current = true;
          internalLayerAddedRef.current = true;
          setIsLayerReady(true);
          logger.info(`>>> Successfully called mapboxInstance.addLayer for ${id}`);
          logger.info(`>>> Layer ${id} is now ready`, { isLayerReady: true });
          updateStatus('complete');
          return true;
        } else {
          logger.debug(`Add/Remove: Layer ${id} already exists`);
          layerAddedRef.current = true;
          internalLayerAddedRef.current = true;
          setIsLayerReady(true);
          return true;
        }
      } catch (error) {
        logger.error(`Add/Remove: Error adding layer ${id}`, { 
          error: error instanceof Error ? error.message : error,
          stack: error instanceof Error ? error.stack : undefined,
          sourceId: source.id,
          isSourceReady
        });
        updateStatus('error', error instanceof Error ? error.message : String(error));
        setIsLayerReady(false);
        return false;
      }
    };

    const waitForSourceAndAddLayer = () => {
      if (!mapboxInstance || !isMounted) return;

      const sourceId = source.id;
      
      // Check if source exists
      if (!mapboxInstance.getSource(sourceId)) {
        try {
          // Double check due to async nature
          if (!mapboxInstance.getSource(sourceId)) {
            logger.debug(`Add/Remove: Adding source ${sourceId} as it wasn't found`, {
              attempt: sourceLoadAttemptsRef.current + 1
            });
            
            // Set up source load timeout
            sourceLoadTimeoutRef.current = setTimeout(() => {
              if (!mountedRef.current || !isMounted) return;
              
              logger.warn(`Source load timeout for ${sourceId}`, {
                attempt: sourceLoadAttemptsRef.current + 1
              });
              sourceLoadAttemptsRef.current++;
              if (sourceLoadAttemptsRef.current < MAX_SOURCE_LOAD_ATTEMPTS) {
                waitForSourceAndAddLayer();
              } else {
                updateStatus('error', `Failed to load source after ${MAX_SOURCE_LOAD_ATTEMPTS} attempts`);
              }
            }, SOURCE_LOAD_TIMEOUT);

            // Add source and set up event listener
            mapboxInstance.addSource(sourceId, source.data);
            mapboxInstance.on('sourcedata', handleSourceData);
            mapboxInstance.fire('sourceaddedcustom', { sourceId });

            return; // Wait for sourcedata event
          }
        } catch (sourceError) {
          logger.error(`Add/Remove: Failed to add source ${sourceId}`, {
            error: sourceError instanceof Error ? sourceError.message : sourceError,
            stack: sourceError instanceof Error ? sourceError.stack : undefined,
            attempt: sourceLoadAttemptsRef.current + 1
          });
          updateStatus('error', sourceError instanceof Error ? sourceError.message : String(sourceError));
          return;
        }
      } else if (!mapboxInstance.isSourceLoaded(sourceId)) {
        // Source exists but isn't loaded yet
        logger.debug(`Add/Remove: Source ${sourceId} exists but not loaded, waiting for sourcedata`, {
          attempt: sourceLoadAttemptsRef.current + 1
        });
        
        // Set up source load timeout
        sourceLoadTimeoutRef.current = setTimeout(() => {
          if (!mountedRef.current || !isMounted) return;
          
          logger.warn(`Source load timeout for existing source ${sourceId}`, {
            attempt: sourceLoadAttemptsRef.current + 1
          });
          sourceLoadAttemptsRef.current++;
          if (sourceLoadAttemptsRef.current < MAX_SOURCE_LOAD_ATTEMPTS) {
            waitForSourceAndAddLayer();
          } else {
            updateStatus('error', `Failed to load existing source after ${MAX_SOURCE_LOAD_ATTEMPTS} attempts`);
          }
        }, SOURCE_LOAD_TIMEOUT);

        mapboxInstance.on('sourcedata', handleSourceData);
        return; // Wait for sourcedata event
      }

      // If we reach here, source exists and is loaded
      setIsSourceReady(true);
      addMapLayer();
    };

    const addLayerAndSource = async () => {
      if (!mapboxInstance) {
        logger.warn(`Add/Remove: No map instance yet`, { id });
        return;
      }

      const waitForMapReady = () => {
        return new Promise<void>((resolve, reject) => {
          if (!mapboxInstance) {
            reject(new Error('No map instance'));
            return;
          }

          if (isMapStable(mapboxInstance)) {
            resolve();
            return;
          }

          const checkStyle = () => {
            if (!mountedRef.current || !isMounted) {
              reject(new Error('Component unmounted'));
              return;
            }

            if (isMapStable(mapboxInstance)) {
              resolve();
              return;
            }

            retryCount++;
            if (retryCount >= MAX_RETRIES) {
              reject(new Error('Max retries exceeded waiting for map stability'));
              return;
            }

            logger.debug('Waiting for map stability', {
              id,
              attempt: retryCount,
              maxRetries: MAX_RETRIES,
              mapState: {
                isStyleLoaded: mapboxInstance.isStyleLoaded(),
                isMoving: mapboxInstance.isMoving(),
                isZooming: mapboxInstance.isZooming(),
                isRotating: mapboxInstance.isRotating(),
                isEasing: mapboxInstance.isEasing()
              }
            });

            setTimeout(checkStyle, RETRY_DELAY);
          };

          mapboxInstance.once('idle', () => {
            if (isMapStable(mapboxInstance)) {
              resolve();
            } else {
              checkStyle();
            }
          });
        });
      };

      try {
        await waitForMapReady();
        if (!mountedRef.current || !isMounted) return;
        waitForSourceAndAddLayer();
      } catch (error) {
        logger.error(`Add/Remove: Error during initialization for ${id}`, { 
          error: error instanceof Error ? error.message : error,
          stack: error instanceof Error ? error.stack : undefined,
          retryCount
        });
        updateStatus('error', error instanceof Error ? error.message : String(error));
      }
    };

    addLayerAndSource();

    return () => {
      isMounted = false;
      mountedRef.current = false;
      logger.debug(`Effect ADD/REMOVE cleanup`, { 
        id, 
        sourceId: source.id,
        isSourceReady,
        isLayerReady,
        sourceLoadAttempts: sourceLoadAttemptsRef.current
      });
      
      // Clean up timeouts and event listeners
      if (sourceLoadTimeoutRef.current) {
        clearTimeout(sourceLoadTimeoutRef.current);
      }
      if (mapboxInstance) {
        mapboxInstance.off('sourcedata', handleSourceData);
      }
      
      if (mapboxInstance && !mapboxInstance._removed && isStyleLoaded(mapboxInstance)) {
        try {
          // Only remove layer if we know it was successfully added
          if (internalLayerAddedRef.current && mapboxInstance.getLayer(id)) {
            logger.info(`Cleanup: Removing layer ${id}`);
            mapboxInstance.removeLayer(id);
          }

          const style = mapboxInstance.getStyle();
          const layersUsingSource = (style?.layers || []).filter(l => l.source === source.id);
          if (layersUsingSource.length === 0 || (layersUsingSource.length === 1 && layersUsingSource[0].id === id)) {
            if (mapboxInstance.getSource(source.id)) {
              logger.info(`Cleanup: Removing source ${source.id} (last user)`);
              mapboxInstance.removeSource(source.id);
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
  }, [mapboxInstance, id, source.id, layer.type, beforeId, isVisible, updateStatus, isSourceReady]);

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
    if (!mapboxInstance || !isMapStable(mapboxInstance) || !isLayerReady) {
      logger.debug(`Style update skipped for ${id}`, { 
        hasMap: !!mapboxInstance,
        mapState: mapboxInstance ? {
          isStyleLoaded: mapboxInstance.isStyleLoaded(),
          isMoving: mapboxInstance.isMoving(),
          isZooming: mapboxInstance.isZooming(),
          isRotating: mapboxInstance.isRotating(),
          isEasing: mapboxInstance.isEasing()
        } : null,
        isLayerReady,
        layerExists: mapboxInstance?.getLayer(id) ? true : false
      });
      return;
    }

    const map = mapboxInstance;

    const currentLayerProps = { 
      paint: layer.paint || {}, 
      layout: layer.layout || {}, 
      filter: layer.filter, 
      minzoom: layer.minzoom, 
      maxzoom: layer.maxzoom 
    };
    const previousLayerProps = { 
      paint: layerRef.current.paint || {}, 
      layout: layerRef.current.layout || {}, 
      filter: layerRef.current.filter, 
      minzoom: layerRef.current.minzoom, 
      maxzoom: layerRef.current.maxzoom 
    };

    if (!isEqual(currentLayerProps, previousLayerProps)) {
      logger.info(`Effect UPDATE_STYLE: Detected change for layer ${id}`, {
        layerId: id,
        paint: currentLayerProps.paint,
        layout: currentLayerProps.layout,
        mapState: {
          isStyleLoaded: map.isStyleLoaded(),
          isMoving: map.isMoving(),
          isZooming: map.isZooming(),
          isRotating: map.isRotating(),
          isEasing: map.isEasing()
        },
        layerExists: map.getLayer(id) ? true : false
      });
      layerRef.current = layer;

      // Add detailed pre-update check
      const mapIsStable = isMapStable(map);
      const layerExists = map.getLayer(id) ? true : false;
      logger.debug(`Effect UPDATE_STYLE: Pre-update check for ${id}`, {
        isLayerReady,
        mapIsStable,
        layerExists,
        layerType: map.getLayer(id)?.type,
        sourceId: map.getLayer(id)?.source
      });

      if (layerExists) {
        try {
          if (layer.paint) {
            Object.entries(layer.paint).forEach(([key, value]) => {
              if (value !== undefined) {
                logger.debug(`Setting paint property for ${id}`, { key, value });
                map.setPaintProperty(id, key as any, value);
              }
            });
          }
          if (layer.layout) {
            Object.entries(layer.layout).forEach(([key, value]) => {
              if (key !== 'visibility' && value !== undefined) {
                logger.debug(`Setting layout property for ${id}`, { key, value });
                map.setLayoutProperty(id, key as any, value);
              }
            });
          }
          if (layer.filter) {
            logger.debug(`Setting filter for ${id}`, { filter: layer.filter });
            map.setFilter(id, layer.filter);
          }
          if (layer.minzoom !== undefined || layer.maxzoom !== undefined) {
            logger.debug(`Setting zoom range for ${id}`, { 
              minzoom: layer.minzoom ?? 0, 
              maxzoom: layer.maxzoom ?? 24 
            });
            map.setLayerZoomRange(id, layer.minzoom ?? 0, layer.maxzoom ?? 24);
          }

          logger.info(`Effect UPDATE_STYLE: Style updated for ${id}`);
        } catch (error) {
          logger.error(`Effect UPDATE_STYLE: Error updating style for ${id}`, { 
            error: error instanceof Error ? error.message : error,
            stack: error instanceof Error ? error.stack : undefined,
            layerProps: currentLayerProps,
            mapState: {
              isStyleLoaded: map.isStyleLoaded(),
              isMoving: map.isMoving(),
              isZooming: map.isZooming(),
              isRotating: map.isRotating(),
              isEasing: map.isEasing()
            }
          });
        }
      } else {
        logger.warn(`Effect UPDATE_STYLE: Layer ${id} not found during style update`, {
          isLayerReady,
          mapIsStable,
          layerExists,
          mapState: {
            isStyleLoaded: map.isStyleLoaded(),
            isMoving: map.isMoving(),
            isZooming: map.isZooming(),
            isRotating: map.isRotating(),
            isEasing: map.isEasing()
          }
        });
      }
    } else {
      logger.debug(`Effect UPDATE_STYLE: Layer props unchanged for ${id}`);
    }
  }, [mapboxInstance, id, layer, isLayerReady]);

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
        mapState: mapboxInstance ? {
          isStyleLoaded: mapboxInstance.isStyleLoaded(),
          isMoving: mapboxInstance.isMoving(),
          isZooming: mapboxInstance.isZooming(),
          isRotating: mapboxInstance.isRotating(),
          isEasing: mapboxInstance.isEasing()
        } : null,
        isVisible,
        isLayerReady
      });

      // --- Check map instance first ---
      if (!mapboxInstance) {
        logger.warn(`Visibility update skipped: No map instance`, { id });
        return; // Cannot proceed
      }

      // --- Check layer readiness ---
      if (!isLayerReady) {
        logger.warn(`Visibility update: Layer not ready (attempt ${attemptCount + 1})`, { id });
        if (attemptCount < MAX_VISIBILITY_ATTEMPTS - 1) {
          attemptCount++;
          retryTimeout = setTimeout(updateVisibility, RETRY_VISIBILITY_DELAY);
        } else {
          logger.error(`Visibility update failed: Max retries exceeded`, { id });
        }
        return; // Wait for retry or give up
      }

      // --- Now check map stability ---
      if (!isMapStable(mapboxInstance)) {
        logger.warn(`Visibility update: Map not stable (attempt ${attemptCount + 1})`, { id });
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
          const newVisibility = isVisible ? 'visible' : 'none';
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
  }, [mapboxInstance, id, isVisible, isLayerReady]);

  return null;
} 