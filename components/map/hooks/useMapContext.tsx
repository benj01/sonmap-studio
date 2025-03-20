'use client';

import { createContext, useContext, useRef, useState, ReactNode, useCallback, useEffect } from 'react';
import mapboxgl from 'mapbox-gl';
import { LogManager } from '@/core/logging/log-manager';

const SOURCE = 'MapContext';
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

interface LayerState {
  id: string;
  sourceId?: string;
  visible: boolean;
  added: boolean;  // Track if layer has been added to map
}

interface MapContextType {
  map: mapboxgl.Map | null;
  setMap: (map: mapboxgl.Map) => void;
  layers: Map<string, boolean>;
  toggleLayer: (layerId: string) => void;
  addLayer: (layerId: string, initialVisibility?: boolean, sourceId?: string) => void;
  removeLayer: (layerId: string) => void;
  isSourceLoaded: (sourceId: string) => boolean;
  registerLayerAddition: (layerId: string) => void;  // New method to track successful layer addition
}

const MapContext = createContext<MapContextType | null>(null);

export function MapProvider({ children }: { children: ReactNode }) {
  const [map, setMapInstance] = useState<mapboxgl.Map | null>(null);
  const [layers, setLayers] = useState<Map<string, boolean>>(new Map());
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const registeredLayers = useRef<Map<string, LayerState>>(new Map());
  const pendingLayers = useRef<Map<string, LayerState>>(new Map());
  const sourceDataListeners = useRef<Map<string, () => void>>(new Map());

  // Cleanup function for source data listeners
  const cleanupSourceDataListeners = useCallback(() => {
    if (mapRef.current) {
      sourceDataListeners.current.forEach(listener => {
        mapRef.current?.off('sourcedata', listener);
      });
      sourceDataListeners.current.clear();
    }
  }, []);

  const isSourceLoaded = useCallback((sourceId: string): boolean => {
    if (!map?.loaded()) return false;
    try {
      return map.isSourceLoaded(sourceId);
    } catch (error) {
      logger.warn('Error checking source loaded state', { sourceId, error });
      return false;
    }
  }, [map]);

  const applyLayerVisibility = useCallback((mapInstance: mapboxgl.Map, layerId: string, visible: boolean) => {
    try {
      if (mapInstance.getLayer(layerId)) {
        const visibility = visible ? 'visible' : 'none';
        mapInstance.setLayoutProperty(layerId, 'visibility', visibility);

        // Handle outline layer
        const outlineLayerId = `${layerId}-outline`;
        if (mapInstance.getLayer(outlineLayerId)) {
          mapInstance.setLayoutProperty(outlineLayerId, 'visibility', visibility);
        }
        
        logger.debug('Layer visibility applied', { 
          layerId, 
          visibility,
          hasOutline: mapInstance.getLayer(outlineLayerId) !== undefined
        });
      }
    } catch (error) {
      logger.warn('Error applying layer visibility', { layerId, visible, error });
    }
  }, []);

  const handlePendingLayers = useCallback((mapInstance: mapboxgl.Map) => {
    pendingLayers.current.forEach((layerState, layerId) => {
      if (!layerState.sourceId || isSourceLoaded(layerState.sourceId)) {
        if (mapInstance.getLayer(layerId)) {
          applyLayerVisibility(mapInstance, layerId, layerState.visible);
          registeredLayers.current.set(layerId, { ...layerState, added: true });
          pendingLayers.current.delete(layerId);
          
          logger.debug('Pending layer processed', { 
            layerId, 
            sourceId: layerState.sourceId,
            visible: layerState.visible 
          });
        }
      }
    });
  }, [isSourceLoaded, applyLayerVisibility]);

  // New method to track successful layer addition
  const registerLayerAddition = useCallback((layerId: string) => {
    const layerState = registeredLayers.current.get(layerId) || pendingLayers.current.get(layerId);
    if (layerState) {
      layerState.added = true;
      logger.debug('Layer registered as added', { layerId });
    }
  }, []);

  const setMap = useCallback((mapInstance: mapboxgl.Map) => {
    if (mapInstance === mapRef.current) {
      logger.debug('Map instance already set in context, skipping');
      return;
    }
    
    // Clean up old map instance and listeners
    if (mapRef.current) {
      logger.info('Cleaning up old map instance');
      cleanupSourceDataListeners();
      try {
        // Check if the map is still valid before removing it
        if (!mapRef.current._removed) {
          // Clean up style resources first
          if (mapRef.current.isStyleLoaded()) {
            const style = mapRef.current.getStyle();
            if (style && style.layers) {
              [...style.layers].reverse().forEach(layer => {
                if (layer.id && mapRef.current?.getLayer(layer.id)) {
                  mapRef.current?.removeLayer(layer.id);
                }
              });
            }
            if (style && style.sources) {
              Object.keys(style.sources).forEach(sourceId => {
                if (mapRef.current?.getSource(sourceId)) {
                  mapRef.current?.removeSource(sourceId);
                }
              });
            }
          }
          mapRef.current.remove();
        } else {
          logger.debug('Old map already removed, skipping cleanup');
        }
      } catch (error) {
        // Safely handle any errors during map removal
        logger.warn('Error during old map cleanup', error);
      }
      // Ensure we clear the reference even if removal fails
      mapRef.current = null;
    }
    
    logger.info('Setting map in context', {
      loaded: mapInstance.loaded(),
      style: mapInstance.getStyle()?.name,
      center: mapInstance.getCenter(),
      zoom: mapInstance.getZoom()
    });

    // Set up source data monitoring
    const handleSourceData = () => {
      if (mapInstance.loaded()) {
        handlePendingLayers(mapInstance);
      }
    };

    mapInstance.on('sourcedata', handleSourceData);
    sourceDataListeners.current.set('global', handleSourceData);

    // Initial sync of registered layers
    if (mapInstance.loaded()) {
      registeredLayers.current.forEach((layerState, layerId) => {
        if (layerState.added) {
          applyLayerVisibility(mapInstance, layerId, layerState.visible);
        }
      });
      handlePendingLayers(mapInstance);
    }

    mapRef.current = mapInstance;
    setMapInstance(mapInstance);
  }, [cleanupSourceDataListeners, handlePendingLayers, applyLayerVisibility]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupSourceDataListeners();
      if (mapRef.current) {
        try {
          // Check if the map is still valid before removing it
          if (!mapRef.current._removed) {
            logger.debug('Removing map instance during cleanup');
            // Clean up style resources first
            if (mapRef.current.isStyleLoaded()) {
              const style = mapRef.current.getStyle();
              if (style && style.layers) {
                [...style.layers].reverse().forEach(layer => {
                  if (layer.id && mapRef.current?.getLayer(layer.id)) {
                    mapRef.current?.removeLayer(layer.id);
                  }
                });
              }
              if (style && style.sources) {
                Object.keys(style.sources).forEach(sourceId => {
                  if (mapRef.current?.getSource(sourceId)) {
                    mapRef.current?.removeSource(sourceId);
                  }
                });
              }
            }
            mapRef.current.remove();
          } else {
            logger.debug('Map already removed, skipping cleanup');
          }
        } catch (error) {
          // Safely handle any errors during map removal
          logger.warn('Error during map cleanup', error);
          // Ensure we clear the reference even if removal fails
          mapRef.current = null;
        }
      }
    };
  }, [cleanupSourceDataListeners]);

  const addLayer = useCallback((layerId: string, initialVisibility = true, sourceId?: string) => {
    const layerState: LayerState = {
      id: layerId,
      sourceId,
      visible: initialVisibility,
      added: false
    };

    if (!map?.loaded() || (sourceId && !isSourceLoaded(sourceId))) {
      logger.debug('Adding layer to pending queue', { 
        layerId, 
        sourceId,
        mapLoaded: map?.loaded(),
        sourceLoaded: sourceId ? isSourceLoaded(sourceId) : true
      });
      pendingLayers.current.set(layerId, layerState);
    } else {
      registeredLayers.current.set(layerId, layerState);
      if (map) {
        applyLayerVisibility(map, layerId, initialVisibility);
      }
    }

    setLayers(prev => {
      const newLayers = new Map(prev);
      newLayers.set(layerId, initialVisibility);
      return newLayers;
    });
  }, [map, isSourceLoaded, applyLayerVisibility]);

  const toggleLayer = useCallback((layerId: string) => {
    setLayers(prev => {
      const newLayers = new Map(prev);
      const currentVisibility = newLayers.get(layerId) ?? true;
      const newVisibility = !currentVisibility;
      newLayers.set(layerId, newVisibility);

      const layerState = registeredLayers.current.get(layerId);
      if (layerState) {
        layerState.visible = newVisibility;
      }

      if (map?.loaded()) {
        if (!layerState?.sourceId || isSourceLoaded(layerState.sourceId)) {
          applyLayerVisibility(map, layerId, newVisibility);
        } else {
          logger.debug('Layer toggle queued - waiting for source', {
            layerId,
            sourceId: layerState.sourceId
          });
          pendingLayers.current.set(layerId, {
            ...layerState,
            visible: newVisibility,
            added: false
          });
        }
      }

      return newLayers;
    });
  }, [map, isSourceLoaded, applyLayerVisibility]);

  const removeLayer = useCallback((layerId: string) => {
    registeredLayers.current.delete(layerId);
    pendingLayers.current.delete(layerId);
    setLayers(prev => {
      const newLayers = new Map(prev);
      const existed = newLayers.has(layerId);
      newLayers.delete(layerId);
      logger.debug('Layer removed', { 
        layerId,
        existed
      });
      return newLayers;
    });
  }, []);

  return (
    <MapContext.Provider
      value={{
        map,
        setMap,
        layers,
        toggleLayer,
        addLayer,
        removeLayer,
        isSourceLoaded,
        registerLayerAddition
      }}
    >
      {children}
    </MapContext.Provider>
  );
}

export function useMapContext() {
  const context = useContext(MapContext);
  if (!context) {
    throw new Error('useMapContext must be used within a MapProvider');
  }
  return context;
} 