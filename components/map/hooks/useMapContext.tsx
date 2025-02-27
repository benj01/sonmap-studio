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

      if (map && map.getStyle()) {
        const layer = map.getLayer(layerId);
        if (layer) {
          const newVisibility = !currentVisibility ? 'visible' : 'none';
          map.setLayoutProperty(
            layerId,
            'visibility',
            newVisibility
          );
          logger.debug('Layer visibility toggled', { 
            layerId, 
            visible: !currentVisibility,
            type: layer.type,
            source: layer.source,
            hasData: !!map.getSource(layer.source as string)
          });
        } else {
          logger.warn('Layer not found when toggling visibility', { 
            layerId,
            availableLayers: Object.keys(map.getStyle()?.layers || {})
              .filter(id => id.startsWith('layer-')),
            mapLoaded: map.loaded(),
            styleLoaded: map.isStyleLoaded(),
            hasStyle: !!map.getStyle()
          });
        }
      } else {
        logger.warn('Map or style not available when toggling layer', { 
          layerId,
          layerCount: prev.size,
          existingLayers: Array.from(prev.keys()),
          hasMap: !!map,
          hasStyle: !!map?.getStyle()
        });
      }

      return newLayers;
    });
  };

  const addLayer = (layerId: string, initialVisibility = true) => {
    setLayers(prev => {
      const newLayers = new Map(prev);
      if (!newLayers.has(layerId)) {
        newLayers.set(layerId, initialVisibility);
        logger.debug('Layer added to context', { 
          layerId, 
          initialVisibility,
          totalLayers: newLayers.size,
          mapReady: !!map,
          mapLoaded: map?.loaded()
        });
      } else {
        logger.debug('Layer already exists in context', { 
          layerId,
          currentVisibility: newLayers.get(layerId),
          totalLayers: newLayers.size
        });
      }
      return newLayers;
    });
  };

  const removeLayer = (layerId: string) => {
    setLayers(prev => {
      const newLayers = new Map(prev);
      const existed = newLayers.has(layerId);
      newLayers.delete(layerId);
      logger.debug('Layer removed from context', { 
        layerId,
        existed,
        remainingLayers: newLayers.size,
        remainingLayerIds: Array.from(newLayers.keys())
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