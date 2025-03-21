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

interface MapViewProps {
  initialViewState?: ViewState;
  onLoad?: () => void;
}

export function MapView({ initialViewState, onLoad }: MapViewProps) {
  const INIT_DELAY = 500;
  const mapContainer = useRef<HTMLDivElement>(null);
  const { setMap } = useMapContext();
  const { syncViews } = useViewSync();
  const mapInstanceRef = useRef<mapboxgl.Map | null>(null);
  const mountedRef = useRef(true);
  const initAttempts = useRef(0);
  const maxInitAttempts = 3;
  const initTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const styleTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const isInitializingRef = useRef<boolean>(false);
  const hasLoadedRef = useRef<boolean>(false);

  useEffect(() => {
    mountedRef.current = true;
    
    const initializeMap = async () => {
      // If we've already loaded successfully, don't reinitialize
      if (hasLoadedRef.current) {
        logger.debug('Map already loaded successfully, skipping initialization');
        return true;
      }

      // Prevent concurrent initialization attempts
      if (isInitializingRef.current) {
        logger.debug('Map initialization already in progress, skipping');
        return false;
      }

      logger.info('Starting map initialization', {
        attempt: initAttempts.current + 1,
        maxAttempts: maxInitAttempts
      });
      
      if (!mapContainer.current) {
        logger.warn('Map initialization aborted - no container');
        return false;
      }

      if (!mountedRef.current) {
        logger.warn('Map initialization aborted - component unmounted');
        return false;
      }

      try {
        isInitializingRef.current = true;
        
        // Set access token
        const token = env.NEXT_PUBLIC_MAPBOX_TOKEN;
        logger.debug('Setting up Mapbox access token', {
          hasToken: !!token,
          tokenLength: token?.length
        });
        
        mapboxgl.accessToken = token;
        if (!mapboxgl.accessToken) {
          throw new Error('Mapbox access token is required');
        }

        // Check if we already have a map instance
        if (mapInstanceRef.current) {
          logger.warn('Map instance already exists, cleaning up');
          try {
            mapInstanceRef.current.remove();
          } catch (error) {
            logger.error('Error removing existing map instance', error);
          }
          mapInstanceRef.current = null;
        }

        logger.debug('Creating map instance with config', {
          container: mapContainer.current.id || 'unnamed-container',
          style: 'mapbox://styles/mapbox/streets-v12',
          initialCenter: [0, 0],
          initialZoom: 1
        });

        const map = new mapboxgl.Map({
          container: mapContainer.current,
          style: 'mapbox://styles/mapbox/streets-v12',
          center: [0, 0],
          zoom: 1,
          preserveDrawingBuffer: true
        });

        // Add error handler before waiting for style
        map.on('error', (e) => {
          logger.error('Mapbox error event', e);
        });

        logger.debug('Map instance created, waiting for style to load');

        // Wait for style to load with timeout
        await Promise.race([
          new Promise((resolve, reject) => {
            map.on('style.load', () => {
              logger.info('Map style loaded successfully');
              resolve(undefined);
            });
            map.on('error', (e) => {
              logger.error('Style load error', e);
              reject(e);
            });
          }),
          new Promise((_, reject) => {
            styleTimeoutRef.current = setTimeout(() => {
              const error = new Error('Style load timeout - continuing anyway');
              logger.warn('Style load timeout occurred', {
                mapLoaded: map.loaded(),
                styleLoaded: map.isStyleLoaded()
              });
              reject(error);
            }, 5000);
          }).catch(error => {
            logger.warn(error.message);
            return Promise.resolve(); // Continue despite timeout
          })
        ]);

        if (!mountedRef.current) {
          logger.warn('Component unmounted during initialization, cleaning up map');
          map.remove();
          return false;
        }

        // Store map instance
        logger.info('Storing map instance in context');
        mapInstanceRef.current = map;
        setMap(map);

        // Set up event handlers after successful initialization
        map.on('load', () => {
          logger.info('Map loaded successfully', {
            center: map.getCenter(),
            zoom: map.getZoom(),
            loaded: map.loaded(),
            styleLoaded: map.isStyleLoaded()
          });
          
          // Mark as loaded and notify parent
          if (!hasLoadedRef.current) {
            hasLoadedRef.current = true;
            onLoad?.();
          }
        });

        map.on('move', () => {
          if (!map.loaded()) return; // Skip if map isn't loaded yet
          const center = map.getCenter();
          logger.debug('Map moved', {
            center: [center.lng, center.lat],
            zoom: map.getZoom()
          });
        });

        isInitializingRef.current = false;
        return true;

      } catch (error) {
        logger.error('Error initializing map', error);
        isInitializingRef.current = false;
        return false;
      }
    };

    const attemptInitialization = async () => {
      if (initAttempts.current >= maxInitAttempts) {
        logger.error('Max initialization attempts reached');
        return;
      }

      const success = await initializeMap();
      if (!success && mountedRef.current && !hasLoadedRef.current) {
        initAttempts.current++;
        // Exponential backoff for retries
        const delay = Math.min(1000 * Math.pow(2, initAttempts.current), 5000);
        logger.info(`Retrying initialization in ${delay}ms`, {
          attempt: initAttempts.current,
          maxAttempts: maxInitAttempts
        });
        initTimeoutRef.current = setTimeout(attemptInitialization, delay);
      }
    };

    // Start initialization with a delay to handle strict mode remounting
    const initTimeout = setTimeout(attemptInitialization, INIT_DELAY);
    initTimeoutRef.current = initTimeout;

    // Cleanup function
    return () => {
      logger.debug('Cleaning up map component');
      mountedRef.current = false;
      isInitializingRef.current = false;
      
      if (styleTimeoutRef.current) {
        clearTimeout(styleTimeoutRef.current);
      }

      if (initTimeoutRef.current) {
        clearTimeout(initTimeoutRef.current);
      }

      if (mapInstanceRef.current && !hasLoadedRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch (error) {
          logger.error('Error removing map instance', error);
        }
        mapInstanceRef.current = null;
      }
    };
  }, [setMap, onLoad]);

  return (
    <div 
      ref={mapContainer} 
      style={{ width: '100%', height: '100%' }}
      data-testid="mapbox-container"
    />
  );
} 