'use client';

import { useEffect, useState, useRef } from 'react';
import createClient from '@/utils/supabase/client';
import { useMapInstanceStore } from '@/store/map/mapInstanceStore';
import { useLayer } from '@/store/layers/hooks';
import { LogManager } from '@/core/logging/log-manager';
import type { FeatureCollection } from 'geojson';

const SOURCE = 'useLayerData';
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

// Cache for layer data
const layerCache = new Map<string, {
  data: FeatureCollection;
  timestamp: number;
  subscribers: number;
  isValid: boolean;
  lastUpdate: number;
}>();

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const UPDATE_THROTTLE = 1000; // 1 second between updates

function validateCoordinates(coordinates: any): boolean {
  if (!Array.isArray(coordinates)) return false;
  
  // Handle nested arrays (for polygons, etc.)
  if (Array.isArray(coordinates[0])) {
    return coordinates.every((coord: any[]) => validateCoordinates(coord));
  }
  
  // Handle single coordinate
  return coordinates.length >= 2 && 
         coordinates.length <= 3 && // Allow z-value
         coordinates.every(c => typeof c === 'number' && !isNaN(c));
}

function validateGeometry(geometry: any): boolean {
  if (!geometry || !geometry.type || !geometry.coordinates) return false;
  
  try {
    // For LineString, validate each coordinate pair
    if (geometry.type === 'LineString') {
      return Array.isArray(geometry.coordinates) && 
        geometry.coordinates.length >= 2 &&
        geometry.coordinates.every((coord: any[]) => 
          Array.isArray(coord) && 
          coord.length >= 2 && 
          coord.length <= 3 && // Allow z-value
          coord.every(c => typeof c === 'number' && !isNaN(c))
        );
    }
    
    // For Polygon, validate each ring
    if (geometry.type === 'Polygon') {
      return Array.isArray(geometry.coordinates) &&
        geometry.coordinates.every((ring: any[]) =>
          Array.isArray(ring) &&
          ring.length >= 4 && // At least 4 points for a closed ring
          ring.every((coord: any[]) =>
            Array.isArray(coord) &&
            coord.length >= 2 &&
            coord.length <= 3 && // Allow z-value
            coord.every(c => typeof c === 'number' && !isNaN(c))
          )
        );
    }
    
    // For other types, use general validation
    return validateCoordinates(geometry.coordinates);
  } catch (error) {
    logger.warn('Invalid geometry', { error });
    return false;
  }
}

export function useLayerData(layerId: string) {
  const supabase = createClient();
  const [data, setData] = useState<FeatureCollection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const mapboxInstance = useMapInstanceStore(state => state.mapInstances.mapbox.instance);
  const { layer, updateStatus } = useLayer(layerId);
  const mounted = useRef(true);
  const fetchingRef = useRef(false);
  const cleanupRef = useRef(false);
  const lastUpdateRef = useRef(0);

  useEffect(() => {
    if (!layer?.metadata?.dataUrl) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        setLoading(true);
        const response = await fetch(layer.metadata.dataUrl);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const jsonData = await response.json();
        
        if (jsonData.type !== 'FeatureCollection') {
          throw new Error('Invalid GeoJSON: not a FeatureCollection');
        }

        logger.debug('Layer data fetched', {
          layerId,
          featureCount: jsonData.features?.length || 0
        });

        setData(jsonData);
        setError(null);
      } catch (err) {
        logger.error('Failed to fetch layer data', {
          layerId,
          error: err instanceof Error ? err.message : 'Unknown error'
        });
        setError(err instanceof Error ? err : new Error('Unknown error'));
        setData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [layer?.metadata?.dataUrl, layerId]);

  useEffect(() => {
    mounted.current = true;
    cleanupRef.current = false;
    
    // logger.info('useLayerData mount effect', {
    //   layerId,
    //   isMounted: mounted.current,
    //   isCleanup: cleanupRef.current
    // });
    
    // Subscribe to cache
    const cached = layerCache.get(layerId);
    if (cached) {
      cached.subscribers++;
      if (cached.isValid) {
        // logger.info('Using cached layer data', {
        //   layerId,
        //   dataTimestamp: new Date(cached.timestamp).toISOString(),
        //   subscribers: cached.subscribers,
        //   lastUpdate: new Date(cached.lastUpdate).toISOString()
        // });
        // Use the exact same reference from cache
        setData(cached.data);
        setLoading(false);
      }
    }
    
    return () => {
      mounted.current = false;
      cleanupRef.current = true;
      
      // logger.info('useLayerData cleanup', {
      //   layerId,
      //   isMounted: mounted.current,
      //   isCleanup: cleanupRef.current
      // });
      
      // Unsubscribe from cache
      const cached = layerCache.get(layerId);
      if (cached) {
        cached.subscribers--;
        if (cached.subscribers === 0) {
          cached.isValid = false; // Mark as invalid but keep data for potential reuse
          if (Date.now() - cached.timestamp > CACHE_TTL) {
            layerCache.delete(layerId); // Only delete if also expired
          }
        }
      }
    };
  }, [layerId]);

  useEffect(() => {
    async function fetchLayerData() {
      // Prevent concurrent fetches or fetching during cleanup
      if (fetchingRef.current || cleanupRef.current) {
        // logger.info('Skipping fetch - already fetching or cleanup in progress', {
        //   layerId,
        //   isFetching: fetchingRef.current,
        //   isCleanup: cleanupRef.current
        // });
        return;
      }

      // Throttle updates
      const now = Date.now();
      if (now - lastUpdateRef.current < UPDATE_THROTTLE) {
        // logger.debug('Skipping fetch - update throttled', {
        //   layerId,
        //   timeSinceLastUpdate: now - lastUpdateRef.current
        // });
        return;
      }

      fetchingRef.current = true;

      try {
        // Check cache first
        const cached = layerCache.get(layerId);
        if (cached && cached.isValid && Date.now() - cached.timestamp < CACHE_TTL) {
          // logger.info('Using cached layer data', {
          //   layerId,
          //   dataTimestamp: new Date(cached.timestamp).toISOString(),
          //   subscribers: cached.subscribers,
          //   lastUpdate: new Date(cached.lastUpdate).toISOString()
          // });
          if (mounted.current) {
            // Use the exact same reference from cache
            setData(cached.data);
            setLoading(false);
          }
          return;
        }

        // Skip if cleanup started
        if (cleanupRef.current) return;

        // logger.info('Fetching layer data from Supabase', { layerId });
        
        // First get the layer metadata
        const { data: layerData, error: layerError } = await supabase
          .from('layers')
          .select('*')
          .eq('id', layerId)
          .single();

        // Skip if cleanup started
        if (cleanupRef.current) {
          // logger.info('Skipping metadata processing - cleanup in progress', { layerId });
          return;
        }

        if (layerError) {
          logger.error('Layer metadata fetch error', { error: layerError });
          throw layerError;
        }
        if (!layerData) {
          logger.error('Layer not found', { layerId });
          throw new Error('Layer not found');
        }

        // logger.info('Layer metadata fetched', { 
        //   layerId,
        //   name: layerData.name,
        //   type: layerData.type
        // });

        // Skip if cleanup started
        if (cleanupRef.current) return;

        // logger.info('Fetching layer features', { layerId });

        // Then get the features for this layer with PostGIS geometry
        const { data: features, error: featuresError } = await supabase
          .rpc('get_layer_features', {
            layer_id: layerId
          });

        // Skip if cleanup started
        if (cleanupRef.current) {
          // logger.info('Skipping features processing - cleanup in progress', { layerId });
          return;
        }

        if (featuresError) {
          logger.error('Features fetch error', { error: featuresError });
          throw featuresError;
        }

        // logger.info('Layer features fetched', {
        //   layerId,
        //   featureCount: features?.length || 0
        // });

        const layerDataWithFeatures: FeatureCollection = {
          type: 'FeatureCollection',
          features: features || []
        };

        // Cache the data
        layerCache.set(layerId, {
          data: layerDataWithFeatures,
          timestamp: Date.now(),
          subscribers: 1,
          isValid: true,
          lastUpdate: Date.now()
        });

        // logger.info('Layer data cached', {
        //   layerId,
        //   name: layerData.name,
        //   featureCount: features?.length || 0
        // });

        if (mounted.current) {
          // Use the exact same reference from cache
          setData(layerDataWithFeatures);
          setLoading(false);
        }

        lastUpdateRef.current = Date.now();

        // Initialize the layer in Mapbox if available
        if (mapboxInstance && layer?.visible) {
          try {
            // logger.info('Initializing layer in Mapbox', { layerId });
            updateStatus('adding');

            // Add source if it doesn't exist
            if (!mapboxInstance.getSource(layerId)) {
              // logger.info('Adding source to map', { layerId });
              mapboxInstance.addSource(layerId, {
                type: 'geojson',
                data: {
                  type: 'FeatureCollection',
                  features: features || []
                }
              });
            }

            // Add layer if it doesn't exist
            if (!mapboxInstance.getLayer(layerId)) {
              // logger.info('Adding layer to map', { layerId });
              mapboxInstance.addLayer({
                id: layerId,
                type: 'fill',
                source: layerId,
                paint: {
                  'fill-color': '#088',
                  'fill-opacity': 0.8
                }
              });
            }

            // logger.info('Layer initialization complete', { layerId });
            updateStatus('complete', undefined);
          } catch (err) {
            logger.error('Error initializing layer in Mapbox', { 
              error: err instanceof Error ? err.message : err,
              stack: err instanceof Error ? err.stack : undefined,
              layerId 
            });
            updateStatus('error', err instanceof Error ? err.message : 'Failed to initialize layer');
          }
        }

      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to fetch layer data';
        logger.error('Layer data fetch error', { error: err });
        if (mounted.current) {
          setError(new Error(errorMessage));
          setLoading(false);
        }
        updateStatus('error', errorMessage);
      } finally {
        fetchingRef.current = false;
      }
    }

    if (layerId) {
      fetchLayerData();
    }
  }, [layerId, mapboxInstance, layer?.visible, updateStatus]);

  return {
    data,
    loading,
    error
  };
} 