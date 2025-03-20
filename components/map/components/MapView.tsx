'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useMapContext } from '../hooks/useMapContext';
import { useViewSync } from '../hooks/useViewSync';
import { LogManager } from '@/core/logging/log-manager';
import { DebugPanel } from '@/components/shared/debug-panel';
import { ViewState } from '../hooks/useViewSync';
import { env } from '@/env.mjs';

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
  initialViewState?: ViewState;
  onLoad?: () => void;
}

export function MapView({ 
  initialViewState = {
    center: [0, 0],
    zoom: 1,
    pitch: 0,
    bearing: 0
  },
  onLoad
}: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const { setMap } = useMapContext();
  const { syncViews } = useViewSync();
  const [viewState, setViewState] = useState<ViewState>(initialViewState);
  const mapInstanceRef = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (!mapContainer.current) return;

    let mounted = true;

    const initializeMap = async () => {
      try {
        // Set access token before initializing map
        if (!env.NEXT_PUBLIC_MAPBOX_TOKEN) {
          const error = new Error('Mapbox access token not found. Please set NEXT_PUBLIC_MAPBOX_TOKEN environment variable.');
          logger.error('Missing Mapbox token', { error });
          throw error;
        }

        // Set the access token and log success
        mapboxgl.accessToken = env.NEXT_PUBLIC_MAPBOX_TOKEN;
        logger.debug('Mapbox token set successfully', { 
          hasToken: !!mapboxgl.accessToken,
          tokenLength: mapboxgl.accessToken?.length
        });

        // Validate view state before creating map
        if (!viewState?.center || !Array.isArray(viewState.center) || viewState.center.length !== 2) {
          logger.error('Invalid view state', { viewState });
          throw new Error('Invalid view state: center coordinates are invalid');
        }

        // Create map instance with more detailed logging
        logger.debug('Creating Mapbox instance', {
          container: !!mapContainer.current,
          viewState
        });

        // Create map with validated view state
        const mapInstance = new mapboxgl.Map({
          container: mapContainer.current as HTMLElement,
          style: 'mapbox://styles/mapbox/streets-v12',
          center: viewState.center,
          zoom: viewState.zoom || 1,
          pitch: viewState.pitch || 0,
          bearing: viewState.bearing || 0,
          attributionControl: false,
          logoPosition: 'bottom-right',
          transformRequest: (url, resourceType) => {
            logger.debug('Mapbox resource request', { url, resourceType });
            return { url };
          }
        });

        mapInstanceRef.current = mapInstance;

        // Add error event handler
        mapInstance.on('error', (e) => {
          logger.error('Mapbox map error', e);
        });

        // Wait for both style and map to load
        await Promise.race([
          new Promise<void>((resolve, reject) => {
            const cleanup = () => {
              clearTimeout(styleTimeout);
              mapInstance.off('style.load', handleStyleLoad);
              mapInstance.off('error', handleError);
            };

            const styleTimeout = setTimeout(() => {
              cleanup();
              // Don't reject - just log warning and continue
              logger.warn('Style load timeout - continuing anyway');
              resolve();
            }, 5000);

            const handleStyleLoad = () => {
              cleanup();
              resolve();
            };

            const handleError = (e: any) => {
              cleanup();
              reject(e.error);
            };

            mapInstance.once('style.load', handleStyleLoad);
            mapInstance.once('error', handleError);
          }),
          // Fallback promise that resolves after map is interactive
          new Promise<void>((resolve) => {
            if (mapInstance.loaded()) {
              resolve();
            } else {
              mapInstance.once('load', () => resolve());
            }
          })
        ]);

        if (!mounted) return;

        // Now that map is ready, set up other event handlers
        mapInstance.on('load', () => {
          if (!mounted) return;
          
          logger.info('Mapbox map loaded successfully', {
            center: mapInstance.getCenter(),
            zoom: mapInstance.getZoom(),
            style: mapInstance.getStyle()?.name,
            loaded: mapInstance.loaded(),
            styleLoaded: mapInstance.isStyleLoaded()
          });
          setMap(mapInstance);
          onLoad?.();
        });

        mapInstance.on('move', () => {
          if (!mounted || !mapInstance) return;
          
          const center = mapInstance.getCenter();
          const zoom = mapInstance.getZoom();
          const pitch = mapInstance.getPitch();
          const bearing = mapInstance.getBearing();

          if (!center) {
            logger.warn('Invalid center in move event');
            return;
          }

          setViewState({
            center: [center.lng, center.lat],
            zoom,
            pitch,
            bearing
          });
        });

      } catch (error) {
        logger.error('Error initializing Mapbox map', {
          error: error instanceof Error ? {
            message: error.message,
            stack: error.stack,
            name: error.name
          } : error,
          mapboxgl: {
            hasAccessToken: !!mapboxgl.accessToken,
            supported: mapboxgl.supported()
          },
          viewState
        });
      }
    };

    initializeMap();

    return () => {
      mounted = false;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  return (
    <>
      <div 
        ref={mapContainer} 
        className="w-full h-full"
      />
      <DebugPanel />
    </>
  );
} 