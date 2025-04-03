'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useMapInstanceStore } from '@/store/map/mapInstanceStore';
import { useViewStateStore } from '@/store/view/viewStateStore';
import { useLogger } from '@/core/logging/LoggerContext';
import { useAutoZoom } from '../hooks/useAutoZoom';
import { MapLayers } from './MapLayers';

const SOURCE = 'MapView';

interface MapViewProps {
  accessToken: string;
  style: string;
}

export function MapView({ accessToken, style }: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const { setMapboxInstance, setMapboxStatus, mapInstances } = useMapInstanceStore();
  const { viewState2D, setViewState2D } = useViewStateStore();
  const mapInstanceRef = useRef<mapboxgl.Map | null>(null);
  const mountCount = useRef(0);
  const [isMapReady, setIsMapReady] = useState(false);
  const logger = useLogger();

  // Initialize useAutoZoom without passing isMapReady
  useAutoZoom();

  useEffect(() => {
    if (mapContainer.current) {
      const rect = mapContainer.current.getBoundingClientRect();
      logger.debug(SOURCE, 'Map container dimensions', {
        width: rect.width,
        height: rect.height,
        top: rect.top,
        left: rect.left,
        bottom: rect.bottom,
        right: rect.right
      });
    }

    mountCount.current += 1;

    logger.debug(SOURCE, 'MapView effect starting', {
      hasExistingMap: !!mapInstanceRef.current,
      hasContainer: !!mapContainer.current,
      containerInDOM: mapContainer.current ? document.body.contains(mapContainer.current) : false,
      mountCount: mountCount.current,
      isMapReady
    });

    if (process.env.NODE_ENV === 'development' && mountCount.current === 1) {
      logger.debug(SOURCE, 'Skipping first mount in development');
      return;
    }

    if (!mapContainer.current || !accessToken || !style) {
      logger.debug(SOURCE, 'MapView initialization skipped - missing requirements', {
        hasContainer: !!mapContainer.current,
        hasAccessToken: !!accessToken,
        hasStyle: !!style
      });
      return;
    }

    const existingMap = mapInstances.mapbox.instance;
    const isMapValid = existingMap && 
                      !existingMap._removed && 
                      existingMap.getContainer() === mapContainer.current;

    if (isMapValid) {
      logger.debug(SOURCE, 'MapView initialization skipped - valid map exists', {
        isRemoved: existingMap._removed,
        containerMatch: existingMap.getContainer() === mapContainer.current,
        isStyleLoaded: existingMap.isStyleLoaded()
      });

      if (existingMap.isStyleLoaded()) {
        setIsMapReady(true);
        setMapboxStatus('ready');
      } else {
        const checkLoad = () => {
          if (existingMap.isStyleLoaded()) {
            logger.info(SOURCE, 'Existing map style loaded');
            setIsMapReady(true);
            setMapboxStatus('ready');
            existingMap.off('load', checkLoad);
          }
        };
        existingMap.on('load', checkLoad);
      }
      return;
    }

    if (existingMap && !isMapValid) {
      logger.debug(SOURCE, 'Cleaning up invalid map instance');
      existingMap.remove();
      setMapboxInstance(null);
      setIsMapReady(false);
    }

    logger.debug(SOURCE, 'MapView initialization starting', {
      hasAccessToken: !!accessToken,
      accessTokenLength: accessToken?.length,
      accessTokenStart: accessToken?.substring(0, 5),
      style,
      mountCount: mountCount.current
    });

    mapboxgl.accessToken = accessToken;
    setMapboxStatus('initializing');
    setIsMapReady(false);

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

      mapInstanceRef.current = map;

      map.on('load', () => {
        logger.info(SOURCE, 'Mapbox map loaded', {
          isRemoved: map._removed,
          containerInDOM: mapContainer.current ? document.body.contains(mapContainer.current) : false,
          mountCount: mountCount.current,
          isStyleLoaded: map.isStyleLoaded()
        });
        
        // Wait for base style to be loaded
        const checkBaseStyle = () => {
          if (!map.isStyleLoaded()) {
            logger.debug(SOURCE, 'Waiting for base style to load');
            map.once('styledata', checkBaseStyle);
            return;
          }

          // Use requestAnimationFrame for minimal delay to ensure style is stable
          requestAnimationFrame(() => {
            logger.info(SOURCE, 'Base map style loaded and stable');
            setMapboxStatus('ready');
            setIsMapReady(true);
            map.off('styledata', checkBaseStyle);
          });
        };

        // Start checking immediately
        checkBaseStyle();
      });

      // Add error handler for map errors
      map.on('error', (error) => {
        const errorMessage = error.error ? error.error.message : 'Unknown error';
        logger.error(SOURCE, 'Mapbox map error', { error: errorMessage, details: error });
        setMapboxStatus('error', errorMessage);
        setIsMapReady(false);
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

          logger.debug(SOURCE, 'Map view state updated', {
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
      logger.error(SOURCE, 'Error initializing Mapbox map', { 
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined
      });
      setMapboxStatus('error', errorMessage);
      setIsMapReady(false);
    }

    return () => {
      logger.debug(SOURCE, 'Cleanup called', {
        mountCount: mountCount.current,
        hasMap: !!mapInstanceRef.current,
        mapRemoved: mapInstanceRef.current?._removed,
        containerInDOM: mapContainer.current ? document.body.contains(mapContainer.current) : false,
        isMapReady
      });

      setIsMapReady(false);

      if (process.env.NODE_ENV === 'development' && mountCount.current <= 2) {
        logger.debug(SOURCE, 'Cleanup skipped - not final unmount');
        return;
      }

      if (mapInstanceRef.current && !mapInstanceRef.current._removed) {
        logger.info(SOURCE, 'MapView cleanup starting - removing map instance');
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        setMapboxInstance(null);
        setMapboxStatus('initializing');
        logger.info(SOURCE, 'Mapbox map removed');
      }
    };
  }, [accessToken, style, setMapboxInstance, setMapboxStatus, mapInstances.mapbox.instance, viewState2D, setViewState2D, logger]);

  return (
    <div className="relative w-full h-full min-h-[400px]">
      <div 
        ref={mapContainer} 
        className="absolute inset-0 w-full h-full"
        style={{ minHeight: '400px' }}
      />
      {isMapReady && <MapLayers />}
    </div>
  );
} 