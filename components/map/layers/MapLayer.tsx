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
    // Only check if the style is loaded and the map is not moving
    // This is more lenient than before and should allow style updates more often
    return map.isStyleLoaded() && !map.isMoving();
  } catch (error) {
    logger.warn(`isMapIdle check failed`, { error });
    return false;
  }
}

export function MapLayer({ id, source, layer, initialVisibility = true, beforeId }: MapLayerProps) {
  // Add render cycle tracking
  const renderCount = useRef(0);
  renderCount.current++;

  // Track component mount cycles for Strict Mode analysis
  const mountCount = useRef(0);
  const isStrictModeRender = useRef(false);
  
  // Track if the layer has been successfully set up in the current mount cycle
  const setupCompletedRef = useRef(false);

  // Add initialization state tracking
  const initStateRef = useRef<{
    sourceAdded: boolean;
    sourceLoaded: boolean;
    layerAdded: boolean;
    mountCycle: number;
    sourceLoadAttempts: number;
    sourceLoadError?: string;
    lastSourceDataEvent?: {
      timestamp: number;
      isSourceLoaded: boolean;
      dataType: string;
    };
    lastError?: string;
  }>({
    sourceAdded: false,
    sourceLoaded: false,
    layerAdded: false,
    mountCycle: 0,
    sourceLoadAttempts: 0
  });

  // Track async operations
  const pendingOpsRef = useRef<{
    sourceAdd?: Promise<void>;
    sourceLoad?: Promise<void>;
    layerAdd?: Promise<void>;
    cleanup?: Promise<void>;
    timeoutIds: Set<NodeJS.Timeout>;
    listeners: Set<{
      type: 'sourcedata' | 'idle';
      handler: (e: any) => void;
    }>;
  }>({
    timeoutIds: new Set(),
    listeners: new Set()
  });

  // Enhanced Strict Mode cleanup guard
  const strictModeCleanupGuardRef = useRef({
    isFirstMount: true,
    isFirstCleanup: true,
    pendingOperations: false
  });

  logger.info(`MapLayer RENDER START #${renderCount.current}`, {
    id,
    mountCount: mountCount.current,
    isStrictModeRender: isStrictModeRender.current,
    timestamp: new Date().toISOString()
  });

  const mapboxInstance = useMapboxInstance();
  const originalLayerId = id.replace(/-fill$|-line$|-circle$/, '');
  const { layer: layerState, updateStatus } = useLayer(originalLayerId);
  const { isVisible } = useLayerVisibility(originalLayerId);

  // Add detailed logging for component state
  logger.info(`MapLayer component STATE`, { 
    id,
    renderCount: renderCount.current,
    mountCount: mountCount.current,
    isStrictModeRender: isStrictModeRender.current,
    sourceId: source.id,
    hasMap: !!mapboxInstance,
    mapStable: mapboxInstance ? isMapStable(mapboxInstance) : false,
    mapIdle: mapboxInstance ? isMapIdle(mapboxInstance) : false,
    layerState: layerState?.setupStatus,
    isVisible,
    timestamp: new Date().toISOString()
  });

  const mountedRef = useRef(true);
  // Add unmounting tracking
  const isUnmountingRef = useRef(false);
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

  // Track when component is actually unmounting
  useEffect(() => {
    // Reset unmounting flag on mount
    isUnmountingRef.current = false;
    
    return () => {
      // Set unmounting flag on cleanup
      isUnmountingRef.current = true;
    };
  }, []);

  // Track initial mount and Strict Mode remount
  useEffect(() => {
    mountCount.current++;
    const isStrictMode = process.env.NODE_ENV === 'development';
    const isRemount = mountCount.current === 2;
    isStrictModeRender.current = isRemount && isStrictMode;
    
    // Reset the setup completed flag on each mount
    setupCompletedRef.current = false;
    
    // Update initialization state for new mount cycle
    initStateRef.current = {
      ...initStateRef.current,
      mountCycle: mountCount.current,
      // Preserve previous state if this is a Strict Mode remount
      sourceAdded: isRemount ? initStateRef.current.sourceAdded : false,
      sourceLoaded: isRemount ? initStateRef.current.sourceLoaded : false,
      layerAdded: isRemount ? initStateRef.current.layerAdded : false,
      // Always reset the attempt counter on mount to avoid inflation
      sourceLoadAttempts: 0,
      // Clear error state on new mount
      sourceLoadError: undefined,
      lastSourceDataEvent: undefined
    };

    // Update Strict Mode guard state
    if (isStrictMode && strictModeCleanupGuardRef.current.isFirstMount) {
      strictModeCleanupGuardRef.current.isFirstMount = false;
    }
    
    // Set initial status to pending at mount time, but only on first mount and if not already pending
    // This reduces the number of status updates to prevent re-render loops
    if (mountCount.current === 1 && layerState?.setupStatus !== 'pending') {
      logger.info(`Setting initial layer status to pending`, { id, previousStatus: layerState?.setupStatus });
      updateStatus('pending');
    }
    
    logger.info(`MapLayer MOUNTED effect #${mountCount.current}`, { 
      id,
      renderCount: renderCount.current,
      mountCount: mountCount.current,
      isStrictModeRender: isStrictModeRender.current,
      sourceId: source.id,
      hasMap: !!mapboxInstance,
      mapStable: mapboxInstance ? isMapStable(mapboxInstance) : false,
      mapIdle: mapboxInstance ? isMapIdle(mapboxInstance) : false,
      initState: initStateRef.current,
      timestamp: new Date().toISOString()
    });

    return () => {
      const isStrictModeFirstCleanup = isStrictMode && strictModeCleanupGuardRef.current.isFirstCleanup;
      
      logger.info(`MapLayer UNMOUNTING effect #${mountCount.current}`, { 
        id,
        renderCount: renderCount.current,
        mountCount: mountCount.current,
        isStrictModeRender: isStrictModeRender.current,
        isStrictModeFirstCleanup,
        sourceId: source.id,
        hasMap: !!mapboxInstance,
        mapStable: mapboxInstance ? isMapStable(mapboxInstance) : false,
        mapIdle: mapboxInstance ? isMapIdle(mapboxInstance) : false,
        initState: initStateRef.current,
        hasPendingOps: !!pendingOpsRef.current.sourceAdd || !!pendingOpsRef.current.layerAdd,
        timestamp: new Date().toISOString()
      });

      if (isStrictModeFirstCleanup) {
        strictModeCleanupGuardRef.current.isFirstCleanup = false;
      }
    };
  }, [id, source.id, mapboxInstance]);

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

  useEffect(() => {
    logger.info(`Effect ADD/REMOVE START`, { id, sourceId: source.id });
    mountedRef.current = true;
    let isEffectMounted = true;
    let sourceAddedLocally = false;
    let layerAddedLocally = false;
    let idleListener: (() => void) | null = null;
    let sourceLoadTimeoutId: NodeJS.Timeout | null = null;
    let sourceLoadListener: ((e: MapSourceDataEvent) => void) | null = null;

    // Skip redundant processing if the layer is already complete in this mount cycle
    if (setupCompletedRef.current || (layerState?.setupStatus === 'complete' && initStateRef.current.layerAdded)) {
      logger.debug(`Skipping add/remove effect run for ${id} - already complete.`, {
        setupCompleted: setupCompletedRef.current,
        layerStatus: layerState?.setupStatus,
        initState: initStateRef.current
      });
      return;
    }

    // Reset the guard at the start of each effect run
    const isStrictMode = process.env.NODE_ENV === 'development';
    const isFirstMount = strictModeCleanupGuardRef.current.isFirstMount;
    
    const cleanup = () => {
      logger.info(`Effect ADD/REMOVE CLEANUP START`, { 
        id, 
        sourceId: source.id, 
        sourceAddedLocally, 
        layerAddedLocally,
        initState: initStateRef.current,
        isStrictMode,
        isFirstMount,
        pendingOps: {
          hasSourceAdd: !!pendingOpsRef.current.sourceAdd,
          hasSourceLoad: !!pendingOpsRef.current.sourceLoad,
          hasLayerAdd: !!pendingOpsRef.current.layerAdd,
          timeoutCount: pendingOpsRef.current.timeoutIds.size,
          listenerCount: pendingOpsRef.current.listeners.size
        },
        layerState: layerState?.setupStatus,
        isUnmounting: isUnmountingRef.current,
        setupCompleted: setupCompletedRef.current
      });
      isEffectMounted = false;

      // Clear all timeouts and listeners
      pendingOpsRef.current.timeoutIds.forEach(id => clearTimeout(id));
      pendingOpsRef.current.timeoutIds.clear();
      pendingOpsRef.current.listeners.forEach(listener => {
        try {
          if (mapboxInstance && !mapboxInstance._removed) {
            mapboxInstance.off(listener.type, listener.handler);
          }
        } catch (e) {}
      });
      pendingOpsRef.current.listeners.clear();

      // Handle Strict Mode cleanup
      if (isStrictMode && isFirstMount) {
        logger.debug(`Cleanup: Strict mode first unmount detected for ${id}. Skipping map operations.`);
        
        // For Strict Mode first unmount, preserve the status if we had a pending operation
        // This helps ensure the status remains pending across the remount
        if (layerState?.setupStatus === 'pending' && !initStateRef.current.layerAdded) {
          logger.debug(`Cleanup: Preserving pending status during Strict Mode first unmount for ${id}`);
        } else if (initStateRef.current.layerAdded && layerState?.setupStatus !== 'complete') {
          // If the layer was added but status isn't complete, update it now
          logger.info(`Cleanup: Setting status to complete during Strict Mode first unmount for ${id}`);
          updateStatus('complete');
        }
        
        return;
      }

      // Proceed with actual cleanup if this is not a Strict Mode first cleanup
      if (mapboxInstance && !mapboxInstance._removed && mapboxInstance.getCanvas()) {
        const map = mapboxInstance;
        let removeSourceAttemptAllowed = sourceAddedLocally && initStateRef.current.sourceAdded;

        // Only remove layer if the component is actually unmounting OR if setup never completed
        // Do NOT remove if setup completed and we're just cleaning up between effect runs
        const shouldRemoveLayer = (isUnmountingRef.current || !setupCompletedRef.current) && layerAddedLocally && initStateRef.current.layerAdded;

        // Remove layer first if we added it AND we should remove it now
        if (shouldRemoveLayer) {
          if (map.getLayer(id)) {
            try {
              logger.info(`Cleanup: Removing layer ${id} (shouldRemoveLayer=true)`, { 
                id, 
                isUnmounting: isUnmountingRef.current, 
                setupCompleted: setupCompletedRef.current 
              });
              map.removeLayer(id);
              initStateRef.current.layerAdded = false;

              // During final cleanup, if we're removing the layer, update status
              // to reflect that resources are being cleaned up
              // Only do this if we're in a real unmount (not Strict Mode cleanup)
              // and only if we're not in development mode to avoid update loops
              if (!isStrictMode && mountCount.current > 2 && process.env.NODE_ENV !== 'development') {
                logger.debug(`Cleanup: Updating status during real cleanup for ${id}`);
                updateStatus('pending', `Cleaning up layer ${id}`);
              }
            } catch (e) {
              logger.error(`Cleanup: Error removing layer ${id}`, { id, error: e });
              removeSourceAttemptAllowed = false;
              
              // Only update status to error if this is a "real" unmount
              if (!isStrictMode && mountCount.current > 2 && process.env.NODE_ENV !== 'development') {
                updateStatus('error', `Error removing layer: ${e instanceof Error ? e.message : String(e)}`);
              }
            }
          } else {
            logger.debug(`Cleanup: Layer ${id} marked for removal but already removed.`, { id });
          }
        } else {
          // Log why removal is skipped
          logger.debug(`Cleanup: Skipping layer removal for ${id}`, { 
            id, 
            isUnmounting: isUnmountingRef.current,
            setupCompleted: setupCompletedRef.current, 
            layerAddedLocally
          });
        }

        // Then attempt source removal if allowed
        if (removeSourceAttemptAllowed && isUnmountingRef.current) {
          if (map.getSource(source.id)) {
            try {
              const style = map.getStyle();
              const layersUsingSource = (style?.layers || []).filter(l => l.id !== id && l?.source === source.id);
              
              if (layersUsingSource.length === 0) {
                logger.info(`Cleanup: Removing source ${source.id} (added locally, no other users)`, { id });
                map.removeSource(source.id);
                initStateRef.current.sourceAdded = false;
                initStateRef.current.sourceLoaded = false;
              }
            } catch (e) {
              logger.error(`Cleanup: Error removing source ${source.id}`, { id, error: e });
              
              // Only update status to error if this is a "real" unmount
              if (!isStrictMode && mountCount.current > 2 && process.env.NODE_ENV !== 'development') {
                updateStatus('error', `Error removing source: ${e instanceof Error ? e.message : String(e)}`);
              }
            }
          }
        } else {
          logger.debug(`Cleanup: Skipping source removal for ${source.id}`, { 
            id, 
            sourceAddedLocally, 
            removeSourceAttemptAllowed,
            isUnmounting: isUnmountingRef.current 
          });
        }
      }

      // Final cleanup status synchronization
      // Only run on real unmount (not during Strict Mode cycles)
      // and only in production to avoid update loops during development
      if (!isStrictMode && mountCount.current > 2 && process.env.NODE_ENV !== 'development') {
        if (layerState?.setupStatus === 'pending') {
          logger.debug(`Cleanup: Setting final cleanup status for ${id}`);
          updateStatus('pending', 'Component unmounted');
        }
      }

      logger.info(`Effect ADD/REMOVE CLEANUP END`, { 
        id, 
        layerState: layerState?.setupStatus,
        finalInitState: initStateRef.current,
        isUnmounting: isUnmountingRef.current
      });
    };

    const proceedToAddLayer = (map: mapboxgl.Map) => {
      if (!isEffectMounted) return;
      logger.debug(`Proceeding to add layer ${id} after source is ready.`);
      try {
        if (!map.getLayer(id)) {
          if (!layerConfigRef.current) {
            const errorMsg = `Internal error: Layer config missing for ${id}`;
            logger.error(`Add/Remove: ${errorMsg}`, { id });
            initStateRef.current.lastError = errorMsg;
            updateStatus('error', errorMsg);
            return;
          }

          logger.info(`Add/Remove: Adding layer ${id}`, { 
            id, 
            layerConfig: { 
              type: layerConfigRef.current.type, 
              layout: layerConfigRef.current.layout 
            }
          });

          // Add the layer
          map.addLayer(layerConfigRef.current, beforeId);
          layerAddedLocally = true;
          initStateRef.current.layerAdded = true;

          // Verify layer was added successfully
          if (!map.getLayer(id)) {
            const errorMsg = `Failed to verify layer ${id} after adding`;
            logger.error(`Add/Remove: ${errorMsg}`, { id });
            initStateRef.current.lastError = errorMsg;
            updateStatus('error', errorMsg);
            return;
          } 
          
          // Layer successfully added
          logger.info(`Add/Remove: Successfully added source/layer ${id}`, { 
            id,
            initState: initStateRef.current
          });
          initStateRef.current.lastError = undefined;
          // Mark the setup as completed for this mount cycle
          setupCompletedRef.current = true;
          updateStatus('complete');
          return;
        } else {
          // Layer already exists
          logger.warn(`Add/Remove: Layer ${id} already exists. Assuming success.`, { id });
          layerAddedLocally = false;
          initStateRef.current.layerAdded = true;
          initStateRef.current.lastError = undefined;
          // Mark the setup as completed for this mount cycle
          setupCompletedRef.current = true;
          if(layerState?.setupStatus !== 'complete') {
            logger.info(`Updating layer status to complete for existing layer ${id}`, {
              previousStatus: layerState?.setupStatus
            });
            updateStatus('complete');
          }
          return;
        }
      } catch (error: any) {
        const errorMsg = error.message || `Unknown error adding layer ${id}`;
        logger.error(`Add/Remove: Error adding layer ${id}`, {
          id,
          error: errorMsg,
          stack: error.stack,
          sourceAddedLocally,
          layerAddedLocally
        });
        
        initStateRef.current.lastError = errorMsg;
        
        if (!errorMsg.includes('already exists') && isEffectMounted) {
          updateStatus('error', errorMsg);
        } else if (isEffectMounted && errorMsg.includes('already exists')) {
          initStateRef.current.layerAdded = true;
          // Mark the setup as completed for this mount cycle
          setupCompletedRef.current = true;
          if(layerState?.setupStatus !== 'complete') {
            updateStatus('complete');
          }
        }
      }
    };

    const checkSourceAndAddLayer = (map: mapboxgl.Map) => {
      if (!isEffectMounted) return;
      const sourceId = source.id;
      
      // Ensure we have a boolean for source existence
      const mapSource = map.getSource(sourceId);
      const sourceExists = mapSource !== undefined;
      
      logger.debug(`Checking source ${sourceId} state before adding layer ${id}`, {
        initState: initStateRef.current,
        sourceExists,
        isSourceLoaded: sourceExists && map.isSourceLoaded(sourceId),
        layerState: layerState?.setupStatus
      });

      // Track source load attempt
      initStateRef.current.sourceLoadAttempts++;
      
      // Update status to reflect we're waiting for the source
      // ONLY do this on first attempt to avoid a potential re-render loop
      if (layerState?.setupStatus === 'pending' && initStateRef.current.sourceLoadAttempts === 1) {
        updateStatus('pending', `Loading source ${sourceId}`);
      }

      const proceedWithSourceLoad = () => {
        if (sourceExists && map.isSourceLoaded(sourceId)) {
          logger.debug(`Source ${sourceId} is already loaded.`);
          initStateRef.current.sourceLoaded = true;
          initStateRef.current.sourceLoadError = undefined;
          proceedToAddLayer(map);
        } else {
          logger.debug(`Source ${sourceId} not loaded yet. Waiting for sourcedata event...`);
          
          // Don't update status here to avoid potential re-render loops
          // The initial pending status is enough to indicate we're working

          if (sourceLoadTimeoutId) clearTimeout(sourceLoadTimeoutId);
          if (sourceLoadListener) try { map.off('sourcedata', sourceLoadListener); } catch(e) {}

          sourceLoadListener = (e: MapSourceDataEvent) => {
            if (!isEffectMounted) return;

            // Track all sourcedata events
            initStateRef.current.lastSourceDataEvent = {
              timestamp: Date.now(),
              isSourceLoaded: Boolean(e.isSourceLoaded),
              dataType: e.dataType
            };

            if (e.sourceId === sourceId && e.isSourceLoaded && e.dataType === 'source') {
              logger.info(`'sourcedata' event confirmed source ${sourceId} loaded for ${id}`, {
                sourceLoadAttempts: initStateRef.current.sourceLoadAttempts,
                event: e,
                layerState: layerState?.setupStatus
              });
              
              if (sourceLoadTimeoutId) clearTimeout(sourceLoadTimeoutId);
              try { map.off('sourcedata', sourceLoadListener!); } catch(e) {}
              sourceLoadListener = null;
              
              initStateRef.current.sourceLoaded = true;
              initStateRef.current.sourceLoadError = undefined;
              
              // No need to update status here, just proceed to add the layer
              // This avoids potential re-render loops
              
              proceedToAddLayer(map);
            }
          };

          // Add listener to pendingOpsRef for cleanup
          pendingOpsRef.current.listeners.add({
            type: 'sourcedata',
            handler: sourceLoadListener
          });
          map.on('sourcedata', sourceLoadListener);

          sourceLoadTimeoutId = setTimeout(() => {
            if (!isEffectMounted) return;
            
            const timeoutError = `Timeout waiting for source ${sourceId} to load after ${initStateRef.current.sourceLoadAttempts} attempts`;
            logger.error(timeoutError, {
              sourceId,
              initState: initStateRef.current,
              lastSourceDataEvent: initStateRef.current.lastSourceDataEvent,
              layerState: layerState?.setupStatus
            });

            if (sourceLoadListener) {
              try { map.off('sourcedata', sourceLoadListener); } catch(e) {}
              sourceLoadListener = null;
            }

            // Check one last time
            const finalSource = map.getSource(sourceId);
            const isLoaded = finalSource !== undefined && map.isSourceLoaded(sourceId);
            if (isLoaded) {
              logger.info(`Source ${sourceId} loaded after timeout check`);
              initStateRef.current.sourceLoaded = true;
              initStateRef.current.sourceLoadError = undefined;
              
              // No need to update status here, just proceed to add the layer
              // This avoids potential re-render loops
              
              proceedToAddLayer(map);
            } else {
              initStateRef.current.sourceLoadError = timeoutError;
              updateStatus('error', timeoutError);
            }
          }, 5000);

          // Add timeout to pendingOpsRef for cleanup
          pendingOpsRef.current.timeoutIds.add(sourceLoadTimeoutId);
        }
      };

      // If source exists, proceed with load check
      if (sourceExists) {
        // No status update needed here to avoid re-render loops
        proceedWithSourceLoad();
      } else {
        // Only update status once at the beginning of the process
        if (layerState?.setupStatus === 'pending' && initStateRef.current.sourceLoadAttempts === 1) {
          updateStatus('pending', `Adding source ${sourceId}`);
        }
        
        // Try to add the source first
        try {
          logger.info(`Adding source ${sourceId}`, { id });
          map.addSource(sourceId, sourceSpecRef.current);
          sourceAddedLocally = true;
          initStateRef.current.sourceAdded = true;
          
          // No status update needed here to avoid re-render loops
          
          proceedWithSourceLoad();
        } catch (error: any) {
          const errorMsg = error?.message || 'Unknown error adding source';
          logger.error(`Error adding source ${sourceId}`, { id, error: errorMsg });
          initStateRef.current.sourceLoadError = errorMsg;
          initStateRef.current.lastError = errorMsg;
          updateStatus('error', `Failed adding source ${sourceId}: ${errorMsg}`);
        }
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
    if (!mapboxInstance) {
      logger.debug(`Style update skipped for ${id} - no map instance`, { id });
      return;
    }

    // Skip style updates during layer initialization
    if (!setupCompletedRef.current) {
      logger.debug(`Style update skipped for ${id} - setup not completed yet`, { id });
      return;
    }

    const map = mapboxInstance;
    const layerExists = map.getLayer(id);

    if (!layerExists) {
      logger.debug(`Style update skipped for ${id} - layer not found on map`, { 
        id,
        availableLayers: map.getStyle()?.layers?.map(l => l.id) || [],
        layerStyleRef: layerStyleRef.current,
        newLayer: layer
      });
      return;
    }

    // Defer style updates if the map is not in an idle state
    // But set a flag to apply them when it becomes idle
    if (!isMapIdle(map)) {
      logger.debug(`Style update deferred for ${id} - map not idle`, {
        id, 
        mapState: {
          isStyleLoaded: map.isStyleLoaded(),
          isMoving: map.isMoving(),
          isZooming: map.isZooming(),
          isRotating: map.isRotating()
        }
      });

      // Set up a one-time idle listener to apply styles when map becomes idle
      const applyStylesOnIdle = () => {
        logger.debug(`Applying deferred style updates for ${id} after map idle`);
        
        // Check again if everything is still valid
        if (mountedRef.current && map && !map._removed && map.getLayer(id)) {
          // Call this effect again when map is idle
          applyStyleUpdates(map);
        }
      };

      // Use a single idle listener and clean it up properly
      const idleListener = () => {
        applyStylesOnIdle();
        map.off('idle', idleListener);
      };
      
      // Add listener to pendingOpsRef for cleanup
      pendingOpsRef.current.listeners.add({
        type: 'idle',
        handler: idleListener
      });
      
      map.once('idle', idleListener);
      return;
    }

    applyStyleUpdates(map);
  }, [mapboxInstance, id, layer, setupCompletedRef.current]);

  // Helper function to apply style updates
  const applyStyleUpdates = useCallback((map: mapboxgl.Map) => {
    if (!map || !map.getLayer(id)) return;

    // Compare paint properties directly
    const currentPaint = layerStyleRef.current.paint || {};
    const newPaint = layer.paint || {};
    const paintChanged = Object.keys(newPaint).some(key => 
      !isEqual((currentPaint as Record<string, any>)[key], (newPaint as Record<string, any>)[key])
    ) || Object.keys(currentPaint).some(key => 
      !(key in newPaint)
    );

    // Compare layout properties directly (excluding visibility)
    const currentLayout = { ...(layerStyleRef.current.layout || {}) };
    const newLayout = { ...(layer.layout || {}) };
    delete currentLayout.visibility;
    delete newLayout.visibility;
    const layoutChanged = !isEqual(currentLayout, newLayout);

    // Compare other properties
    const filterChanged = !isEqual(layerStyleRef.current.filter, layer.filter);
    const zoomRangeChanged = 
      layerStyleRef.current.minzoom !== layer.minzoom || 
      layerStyleRef.current.maxzoom !== layer.maxzoom;

    logger.debug(`Style update check for ${id}`, {
      id,
      paintChanged,
      layoutChanged,
      filterChanged,
      zoomRangeChanged
    });

    if (paintChanged || layoutChanged || filterChanged || zoomRangeChanged) {
      logger.info(`Applying style update for layer ${id}`, { 
        id,
        paintChanged,
        layoutChanged,
        filterChanged,
        zoomRangeChanged
      });

      const previousLayer = layerStyleRef.current;
      
      try {
        // Apply updates in a more resilient order: layout, paint, filter, zoom range
        // Update layout properties
        if (layoutChanged) {
          try {
            const currentLayout = { ...layer.layout } as Record<string, any>; 
            delete currentLayout.visibility; // Visibility is handled separately
            const previousLayout = { ...previousLayer.layout } as Record<string, any>; 
            delete previousLayout.visibility;
            
            Object.entries(currentLayout || {}).forEach(([key, value]) => {
              if (value !== undefined && !isEqual((previousLayout as any)?.[key], value)) {
                logger.debug(`Setting layout property for ${id}`, { key, value });
                map.setLayoutProperty(id, key as any, value);
              }
            });
            
            // Check for removed properties
            Object.keys(previousLayout || {}).forEach(key => {
              if ((currentLayout as any)?.[key] === undefined) {
                logger.debug(`Resetting layout property to default for ${id}`, { key });
                // Setting to undefined allows Mapbox to use the default value
                map.setLayoutProperty(id, key as any, undefined);
              }
            });
            
            logger.debug(`Layout properties updated for ${id}`);
          } catch (error) {
            logger.error(`Error updating layout properties for ${id}`, {
              id, 
              error: error instanceof Error ? error.message : error
            });
            // Continue with other updates even if layout update fails
          }
        }

        // Update paint properties
        if (paintChanged) {
          try {
            Object.entries(layer.paint || {}).forEach(([key, value]) => {
              if (value !== undefined && !isEqual((previousLayer.paint as any)?.[key], value)) {
                logger.debug(`Setting paint property for ${id}`, { key, value });
                map.setPaintProperty(id, key as any, value);
              }
            });
            
            // Check for removed properties
            Object.keys(previousLayer.paint || {}).forEach(key => {
              if ((layer.paint as any)?.[key] === undefined) {
                logger.debug(`Resetting paint property to default for ${id}`, { key });
                // Setting to undefined allows Mapbox to use the default value
                map.setPaintProperty(id, key as any, undefined);
              }
            });
            
            logger.debug(`Paint properties updated for ${id}`);
          } catch (error) {
            logger.error(`Error updating paint properties for ${id}`, {
              id, 
              error: error instanceof Error ? error.message : error
            });
            // Continue with other updates even if paint update fails
          }
        }

        // Update filter
        if (filterChanged) {
          try {
            logger.debug(`Setting filter for ${id}`, { 
              filter: layer.filter,
              previousFilter: previousLayer.filter
            });
            map.setFilter(id, layer.filter || null);
            logger.debug(`Filter updated for ${id}`);
          } catch (error) {
            logger.error(`Error updating filter for ${id}`, {
              id, 
              error: error instanceof Error ? error.message : error
            });
            // Continue with other updates even if filter update fails
          }
        }

        // Update zoom range
        if (zoomRangeChanged) {
          try {
            logger.debug(`Setting zoom range for ${id}`, { 
              minzoom: layer.minzoom, 
              maxzoom: layer.maxzoom
            });
            map.setLayerZoomRange(id, layer.minzoom ?? 0, layer.maxzoom ?? 24);
            logger.debug(`Zoom range updated for ${id}`);
          } catch (error) {
            logger.error(`Error updating zoom range for ${id}`, {
              id, 
              error: error instanceof Error ? error.message : error
            });
            // Continue with other updates even if zoom range update fails
          }
        }

        // Update the layerStyleRef after all updates have been applied
        layerStyleRef.current = { ...layer };
        logger.info(`Style update completed for ${id}`);
      } catch (error) {
        logger.error(`Error during style update for ${id}`, {
          id, 
          error: error instanceof Error ? error.message : error,
          stack: error instanceof Error ? error.stack : undefined
        });
      }
    } else {
      logger.debug(`No style changes detected for ${id}`);
    }
  }, [id, layer]);

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

  logger.info(`MapLayer RENDER END #${renderCount.current}`, {
    id,
    mountCount: mountCount.current,
    isStrictModeRender: isStrictModeRender.current,
    timestamp: new Date().toISOString()
  });
  return null;
}