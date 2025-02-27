'use client';

import { createContext, useContext, useRef, useState, ReactNode } from 'react';
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

interface MapContextType {
  map: mapboxgl.Map | null;
  setMap: (map: mapboxgl.Map) => void;
  layers: Map<string, boolean>;
  toggleLayer: (layerId: string) => void;
  addLayer: (layerId: string, initialVisibility?: boolean) => void;
  removeLayer: (layerId: string) => void;
}

const MapContext = createContext<MapContextType | null>(null);

export function MapProvider({ children }: { children: ReactNode }) {
  const [map, setMapInstance] = useState<mapboxgl.Map | null>(null);
  const [layers, setLayers] = useState<Map<string, boolean>>(new Map());
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const registeredLayers = useRef<Set<string>>(new Set());

  const setMap = (mapInstance: mapboxgl.Map) => {
    if (mapInstance === mapRef.current) {
      logger.debug('Map instance already set in context, skipping');
      return;
    }
    
    if (mapRef.current && mapRef.current !== mapInstance) {
      logger.info('Cleaning up old map instance');
      mapRef.current.remove();
    }
    
    logger.info('Setting map in context', {
      loaded: mapInstance.loaded(),
      style: mapInstance.getStyle()?.name,
      center: mapInstance.getCenter(),
      zoom: mapInstance.getZoom()
    });

    mapRef.current = mapInstance;
    setMapInstance(mapInstance);
  };

  const toggleLayer = (layerId: string) => {
    setLayers(prev => {
      const newLayers = new Map(prev);
      const currentVisibility = newLayers.get(layerId) ?? true;
      newLayers.set(layerId, !currentVisibility);

      if (map && map.loaded()) {
        try {
          logger.debug('Attempting to toggle layer visibility', { 
            layerId, 
            currentVisibility,
            newVisibility: !currentVisibility,
            hasLayer: map.getLayer(layerId) !== undefined
          });

          // Check if layer exists before attempting to modify it
          if (map.getLayer(layerId)) {
            const newVisibility = !currentVisibility ? 'visible' : 'none';
            map.setLayoutProperty(
              layerId,
              'visibility',
              newVisibility
            );
            logger.debug('Layer visibility changed', { 
              layerId, 
              visible: !currentVisibility
            });

            // Also toggle outline layer if it exists (for polygons)
            const outlineLayerId = `${layerId}-outline`;
            if (map.getLayer(outlineLayerId)) {
              map.setLayoutProperty(
                outlineLayerId,
                'visibility',
                newVisibility
              );
            }
          } else {
            logger.warn('Layer not found in map', { 
              layerId,
              mapLoaded: map.loaded(),
              availableLayers: map.getStyle()?.layers?.map(l => l.id)
            });
          }
        } catch (error) {
          logger.error('Error toggling layer visibility', {
            error,
            layerId,
            mapLoaded: map.loaded()
          });
        }
      } else {
        logger.warn('Map not ready', { 
          layerId,
          hasMap: !!map,
          mapLoaded: map?.loaded()
        });
      }

      return newLayers;
    });
  };

  const addLayer = (layerId: string, initialVisibility = true) => {
    if (registeredLayers.current.has(layerId)) {
      return;
    }

    registeredLayers.current.add(layerId);
    setLayers(prev => {
      const newLayers = new Map(prev);
      if (!newLayers.has(layerId)) {
        newLayers.set(layerId, initialVisibility);
        logger.debug('Layer added', { 
          layerId, 
          visible: initialVisibility
        });
      }
      return newLayers;
    });
  };

  const removeLayer = (layerId: string) => {
    registeredLayers.current.delete(layerId);
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
  };

  return (
    <MapContext.Provider
      value={{
        map,
        setMap,
        layers,
        toggleLayer,
        addLayer,
        removeLayer,
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