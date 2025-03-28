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
  const mapInstance = useRef<mapboxgl.Map | null>(null);
  const mountCount = useRef(0);

  useEffect(() => {
    // Log container dimensions
    if (mapContainer.current) {
      const rect = mapContainer.current.getBoundingClientRect();
      logger.debug('Map container dimensions', {
        width: rect.width,
        height: rect.height,
        top: rect.top,
        left: rect.left,
        bottom: rect.bottom,
        right: rect.right
      });
    }

    // Increment mount count
    mountCount.current += 1;

    logger.debug('MapView effect starting', {
      hasExistingMap: !!mapInstance.current,
      hasContainer: !!mapContainer.current,
      containerInDOM: mapContainer.current ? document.body.contains(mapContainer.current) : false,
      mountCount: mountCount.current
    });

    // Skip first mount in development due to strict mode
    if (process.env.NODE_ENV === 'development' && mountCount.current === 1) {
      logger.debug('Skipping first mount in development');
      return;
    }

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
      logger.debug('MapView initialization skipped - map already exists', {
        isRemoved: existingMap._removed
      });
      return;
    }

    logger.debug('MapView initialization starting', {
      hasAccessToken: !!accessToken,
      accessTokenLength: accessToken?.length,
      accessTokenStart: accessToken?.substring(0, 5),
      style,
      mountCount: mountCount.current
    });

    mapboxgl.accessToken = accessToken;
    setMapboxStatus('initializing');

    try {
      const map = new mapboxgl.Map({
        container: mapContainer.current,
        style,
        center: [viewState2D?.longitude ?? 0, viewState2D?.latitude ?? 0],
        zoom: viewState2D?.zoom ?? 1,
        bearing: viewState2D?.bearing ?? 0,
        pitch: viewState2D?.pitch ?? 0,
        attributionControl: false,
        preserveDrawingBuffer: true
      });

      mapInstance.current = map;

      map.on('load', () => {
        logger.info('Mapbox map loaded', {
          isRemoved: map._removed,
          containerInDOM: mapContainer.current ? document.body.contains(mapContainer.current) : false,
          mountCount: mountCount.current
        });
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
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during map initialization';
      logger.error('Error initializing Mapbox map', { 
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined
      });
      setMapboxStatus('error', errorMessage);
    }

    return () => {
      logger.debug('Cleanup called', {
        mountCount: mountCount.current,
        hasMap: !!mapInstance.current,
        mapRemoved: mapInstance.current?._removed,
        containerInDOM: mapContainer.current ? document.body.contains(mapContainer.current) : false
      });

      // Only cleanup on final unmount in development
      if (process.env.NODE_ENV === 'development' && mountCount.current <= 2) {
        logger.debug('Cleanup skipped - not final unmount');
        return;
      }

      if (mapInstance.current && !mapInstance.current._removed) {
        logger.info('MapView cleanup starting - removing map instance');
        mapInstance.current.remove();
        mapInstance.current = null;
        setMapboxInstance(null);
        setMapboxStatus('initializing');
        logger.info('Mapbox map removed');
      }
    };
  }, [accessToken, style]);

  return (
    <div className="relative w-full h-full min-h-[400px]">
      <div 
        ref={mapContainer} 
        className="absolute inset-0 w-full h-full"
        style={{ minHeight: '400px' }}
      />
    </div>
  );
} 