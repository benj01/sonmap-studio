'use client';

import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { LogManager } from '@/core/logging/log-manager';
import { DebugPanel } from '@/components/shared/debug-panel';
import { ViewState } from '@/store/mapStore';
import { env } from '@/env.mjs';
import { useMapStore } from '@/store/mapStore';
import { LayerVerification } from './LayerVerification';

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
  onMapRef?: (map: mapboxgl.Map) => void;
}

export function MapView({ initialViewState, onLoad, onMapRef }: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const mapInitialized = useRef(false);
  const initializationInProgress = useRef(false);
  const cleanupInProgress = useRef(false);
  const { setMapboxInstance } = useMapStore();

  // Main effect for map initialization and cleanup
  useEffect(() => {
    if (!mapContainer.current || initializationInProgress.current || cleanupInProgress.current) return;

    const initializeMap = async () => {
      try {
        initializationInProgress.current = true;
        
        // Cleanup existing instance if it exists
        if (map.current) {
          cleanupInProgress.current = true;
          try {
            if (mapInitialized.current) {
              map.current.remove();
            }
          } catch (error) {
            logger.warn('Error removing existing map instance', { error });
          } finally {
            map.current = null;
            mapInitialized.current = false;
            setMapboxInstance(null);
            cleanupInProgress.current = false;
          }
        }

        // Create new instance
        logger.debug('Creating new map instance');
        if (!mapContainer.current) throw new Error('Map container not found');
        
        const mapInstance = new mapboxgl.Map({
          container: mapContainer.current,
          style: 'mapbox://styles/mapbox/light-v11',
          center: initialViewState?.center || [0, 0],
          zoom: initialViewState?.zoom || 1,
          pitch: initialViewState?.pitch || 0,
          bearing: initialViewState?.bearing || 0,
          accessToken: env.NEXT_PUBLIC_MAPBOX_TOKEN,
          preserveDrawingBuffer: true
        });

        // Wait for the map to load
        await new Promise<void>((resolve, reject) => {
          const timeoutId = setTimeout(() => reject(new Error('Map load timeout')), 10000);
          
          mapInstance.once('load', () => {
            clearTimeout(timeoutId);
            resolve();
          });
          
          mapInstance.once('error', (e) => {
            clearTimeout(timeoutId);
            reject(e.error);
          });
        });

        // Store the instance only after successful load
        map.current = mapInstance;
        mapInitialized.current = true;
        setMapboxInstance(mapInstance);
        
        logger.debug('Map initialized successfully');
        onLoad?.();
        onMapRef?.(mapInstance);

      } catch (error) {
        logger.error('Failed to initialize map', { error });
        // Cleanup on initialization failure
        if (map.current) {
          try {
            map.current.remove();
          } catch (cleanupError) {
            logger.warn('Error during cleanup after failed initialization', { cleanupError });
          }
        }
        map.current = null;
        mapInitialized.current = false;
        setMapboxInstance(null);
      } finally {
        initializationInProgress.current = false;
      }
    };

    initializeMap();

    // Cleanup function
    return () => {
      cleanupInProgress.current = true;
      
      if (map.current) {
        try {
          if (mapInitialized.current) {
            logger.debug('Removing initialized map instance');
            map.current.remove();
          }
        } catch (error) {
          logger.warn('Error during map cleanup', { error });
        } finally {
          map.current = null;
          mapInitialized.current = false;
          setMapboxInstance(null);
        }
      }
      
      cleanupInProgress.current = false;
    };
  }, [initialViewState, onLoad, onMapRef, setMapboxInstance]);

  return (
    <div ref={mapContainer} className="w-full h-full relative">
      <LayerVerification mapInitialized={mapInitialized.current} />
      <DebugPanel>
        <div className="space-y-1">
          <div>Map Status:</div>
          <div className="text-xs">
            Loaded: {mapInitialized.current ? 'Yes' : 'No'}
          </div>
        </div>
      </DebugPanel>
    </div>
  );
} 