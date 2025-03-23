'use client';

import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useMapInstanceStore } from '@/store/map/mapInstanceStore';
import { useViewStateStore } from '@/store/view/viewStateStore';
import { LogManager } from '@/core/logging/log-manager';

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
  accessToken: string;
  style: string;
}

export function MapView({ accessToken, style }: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const { setMapboxInstance } = useMapInstanceStore();
  const { viewState2D, setViewState2D } = useViewStateStore();

  useEffect(() => {
    if (!mapContainer.current) return;

    mapboxgl.accessToken = accessToken;

    try {
      const map = new mapboxgl.Map({
        container: mapContainer.current,
        style,
        center: viewState2D.center,
        zoom: viewState2D.zoom,
        bearing: viewState2D.bearing,
        pitch: viewState2D.pitch,
        attributionControl: false,
        preserveDrawingBuffer: true
      });

      map.on('load', () => {
        logger.info('Mapbox map loaded');
      });

      map.on('error', (error) => {
        logger.error('Mapbox map error', error);
      });

      map.on('moveend', () => {
        if (!map._removed) {
          const center = map.getCenter();
          const zoom = map.getZoom();
          const bearing = map.getBearing();
          const pitch = map.getPitch();

          setViewState2D({
            center: [center.lng, center.lat],
            zoom,
            bearing,
            pitch
          });

          logger.debug('Map view state updated', {
            center: [center.lng, center.lat],
            zoom,
            bearing,
            pitch
          });
        }
      });

      setMapboxInstance(map);

      return () => {
        if (!map._removed) {
          map.remove();
          setMapboxInstance(null);
          logger.info('Mapbox map removed');
        }
      };
    } catch (error) {
      logger.error('Error initializing Mapbox map', error);
    }
  }, [accessToken, style]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className="absolute inset-0" />
    </div>
  );
} 