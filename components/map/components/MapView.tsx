'use client';

import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { LogManager } from '@/core/logging/log-manager';
import { useMapContext } from '../hooks/useMapContext';
import { DebugPanel } from '@/components/shared/debug-panel';

const SOURCE = 'MapView';
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

interface MapViewProps {
  className?: string;
  initialViewState?: {
    center: [number, number];
    zoom: number;
  };
}

export function MapView({ 
  className = '',
  initialViewState = {
    center: [0, 0],
    zoom: 1
  }
}: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<mapboxgl.Map | null>(null);
  const { map: contextMap, setMap } = useMapContext();

  // Initialize map
  useEffect(() => {
    // Skip if we already have a map in context
    if (contextMap) {
      logger.debug('Map already exists in context, skipping initialization');
      return;
    }

    // Skip if no container
    if (!mapContainer.current) {
      logger.debug('No map container available');
      return;
    }

    // Skip if map is already initialized
    if (mapInstance.current) {
      logger.debug('Map instance already exists');
      return;
    }

    let map: mapboxgl.Map | null = null;

    try {
      logger.info('Initializing map', {
        container: !!mapContainer.current,
        accessToken: !!process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
        initialCenter: initialViewState.center,
        initialZoom: initialViewState.zoom
      });

      map = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/light-v11',
        center: initialViewState.center,
        zoom: initialViewState.zoom,
        accessToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN
      });

      mapInstance.current = map;

      // Add navigation controls
      map.addControl(new mapboxgl.NavigationControl(), 'top-right');
      
      // Add scale control
      map.addControl(new mapboxgl.ScaleControl(), 'bottom-left');

      // Wait for style to load before setting map in context
      const onStyleLoad = () => {
        if (map && !contextMap) {
          logger.info('Map style loaded', {
            style: map.getStyle()?.name,
            center: map.getCenter(),
            zoom: map.getZoom()
          });
          setMap(map);
        }
      };

      const onLoad = () => {
        if (map) {
          logger.info('Map fully loaded', {
            loaded: map.loaded(),
            styleLoaded: map.isStyleLoaded(),
            center: map.getCenter(),
            zoom: map.getZoom()
          });
        }
      };

      const onError = (e: any) => {
        logger.error('Mapbox error', e);
      };

      map.on('style.load', onStyleLoad);
      map.on('load', onLoad);
      map.on('error', onError);

      logger.info('Map initialization complete');

      return () => {
        if (map) {
          logger.info('Cleaning up map');
          map.off('style.load', onStyleLoad);
          map.off('load', onLoad);
          map.off('error', onError);
          map.remove();
          mapInstance.current = null;
        }
      };
    } catch (error) {
      logger.error('Failed to initialize map', error);
      if (map) {
        map.remove();
      }
      mapInstance.current = null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array since we handle all dependencies internally

  return (
    <>
      <div 
        ref={mapContainer} 
        className={`w-full h-full ${className}`}
      />
      <DebugPanel />
    </>
  );
} 