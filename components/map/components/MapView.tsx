'use client';

import { useEffect, useRef } from 'react';
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

export function MapView() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const { setMap } = useMapContext();
  const { syncViews } = useViewSync();
  const mapInstanceRef = useRef<mapboxgl.Map | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    let styleTimeout: NodeJS.Timeout;

    const initializeMap = async () => {
      if (!mapContainer.current || !mountedRef.current) return;

      try {
        // Set access token
        mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';
        if (!mapboxgl.accessToken) {
          throw new Error('Mapbox access token is required');
        }

        logger.debug('Creating map instance');
        const map = new mapboxgl.Map({
          container: mapContainer.current as HTMLElement,
          style: 'mapbox://styles/mapbox/streets-v12',
          center: [0, 0],
          zoom: 1
        });

        // Wait for style to load with timeout
        await Promise.race([
          new Promise((resolve, reject) => {
            map.on('style.load', resolve);
            map.on('error', reject);
          }),
          new Promise((_, reject) => {
            styleTimeout = setTimeout(() => {
              reject(new Error('Style load timeout - continuing anyway'));
            }, 5000);
          }).catch(error => {
            logger.warn(error.message);
            return Promise.resolve(); // Continue despite timeout
          })
        ]);

        if (!mountedRef.current) {
          map.remove();
          return;
        }

        // Set up event handlers
        map.on('load', () => {
          logger.info('Map loaded successfully');
        });

        map.on('move', () => {
          const center = map.getCenter();
          logger.debug('Map moved', {
            center: [center.lng, center.lat],
            zoom: map.getZoom()
          });
        });

        // Store map instance
        mapInstanceRef.current = map;

      } catch (error) {
        logger.error('Error initializing map', error);
      }
    };

    initializeMap();

    // Cleanup function
    return () => {
      logger.debug('Cleaning up map component');
      mountedRef.current = false;
      
      if (styleTimeout) {
        clearTimeout(styleTimeout);
      }

      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch (error) {
          logger.error('Error removing map instance', error);
        }
        mapInstanceRef.current = null;
      }
    };
  }, []);

  return (
    <div 
      ref={mapContainer} 
      style={{ width: '100%', height: '100%' }}
      data-testid="mapbox-container"
    />
  );
} 