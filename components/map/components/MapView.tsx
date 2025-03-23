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
  const { setMapboxInstance, setMapboxStatus } = useMapInstanceStore();
  const { viewState2D, setViewState2D } = useViewStateStore();

  useEffect(() => {
    if (!mapContainer.current || !accessToken || !style) {
      logger.debug('MapView initialization skipped - missing requirements', {
        hasContainer: !!mapContainer.current,
        hasAccessToken: !!accessToken,
        hasStyle: !!style
      });
      return;
    }

    // Skip initialization if we already have a valid map instance
    const existingMap = useMapInstanceStore.getState().mapInstances.mapbox.instance;
    if (existingMap && !existingMap._removed) {
      logger.debug('MapView initialization skipped - map already exists');
      return;
    }

    logger.debug('MapView initialization starting', {
      hasAccessToken: !!accessToken,
      accessTokenLength: accessToken?.length,
      accessTokenStart: accessToken?.substring(0, 5),
      style
    });

    // Initialize view state values
    const longitude = viewState2D?.longitude ?? 0;
    const latitude = viewState2D?.latitude ?? 0;
    const zoom = viewState2D?.zoom ?? 1;
    const bearing = viewState2D?.bearing ?? 0;
    const pitch = viewState2D?.pitch ?? 0;

    mapboxgl.accessToken = accessToken;
    setMapboxStatus('initializing');

    try {
      const map = new mapboxgl.Map({
        container: mapContainer.current,
        style,
        center: [longitude, latitude],
        zoom,
        bearing,
        pitch,
        attributionControl: false,
        preserveDrawingBuffer: true
      });

      map.on('load', () => {
        logger.info('Mapbox map loaded');
        setMapboxStatus('ready');
      });

      map.on('error', (error) => {
        const errorMessage = error.error ? error.error.message : 'Unknown error';
        logger.error('Mapbox map error', { error: errorMessage, details: error });
        setMapboxStatus('error', errorMessage);
      });

      map.on('moveend', () => {
        if (!map._removed) {
          const center = map.getCenter();
          const zoom = map.getZoom();
          const bearing = map.getBearing();
          const pitch = map.getPitch();

          setViewState2D({
            longitude: center.lng,
            latitude: center.lat,
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
        // Only cleanup if component is truly unmounting
        if (document.body.contains(mapContainer.current)) {
          logger.debug('MapView cleanup skipped - container still in DOM');
          return;
        }

        if (!map._removed) {
          logger.info('MapView cleanup starting - removing map instance');
          map.remove();
          setMapboxInstance(null);
          setMapboxStatus('initializing');
          logger.info('Mapbox map removed');
        }
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during map initialization';
      logger.error('Error initializing Mapbox map', { 
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined
      });
      setMapboxStatus('error', errorMessage);
    }
  }, [accessToken, style]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className="absolute inset-0" />
    </div>
  );
} 