'use client';

import { useEffect, useState, useRef } from 'react';
import createClient from '@/utils/supabase/client';
import { LogManager } from '@/core/logging/log-manager';
import { useLayerStore } from '@/store/layers/layerStore';
import type { Feature } from 'geojson';

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
  data: LayerData;
  timestamp: number;
  subscribers: number;
  isValid: boolean;
  lastUpdate: number;
}>();

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const UPDATE_THROTTLE = 1000; // 1 second between updates

interface LayerData {
  id: string;
  name: string;
  type: string;
  properties: Record<string, any>;
  features: GeoJSON.Feature[];
}

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
  const [data, setData] = useState<LayerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const supabase = createClient();
  const mounted = useRef(true);
  const fetchingRef = useRef(false);
  const cleanupRef = useRef(false);
  const lastUpdateRef = useRef(0);

  logger.info('useLayerData hook called', {
    layerId,
    loading,
    error: error?.message,
    hasCachedData: !!layerCache.get(layerId)
  });

  useEffect(() => {
    mounted.current = true;
    cleanupRef.current = false;
    
    logger.info('useLayerData mount effect', {
      layerId,
      isMounted: mounted.current,
      isCleanup: cleanupRef.current
    });
    
    // Subscribe to cache
    const cached = layerCache.get(layerId);
    if (cached) {
      cached.subscribers++;
      if (cached.isValid) {
        logger.info('Using cached layer data', {
          layerId,
          dataTimestamp: new Date(cached.timestamp).toISOString(),
          subscribers: cached.subscribers,
          lastUpdate: new Date(cached.lastUpdate).toISOString()
        });
        setData(cached.data);
        setLoading(false);
      }
    }
    
    return () => {
      mounted.current = false;
      cleanupRef.current = true;
      
      logger.info('useLayerData cleanup', {
        layerId,
        isMounted: mounted.current,
        isCleanup: cleanupRef.current
      });
      
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
        logger.info('Skipping fetch - already fetching or cleanup in progress', {
          layerId,
          isFetching: fetchingRef.current,
          isCleanup: cleanupRef.current
        });
        return;
      }

      // Throttle updates
      const now = Date.now();
      if (now - lastUpdateRef.current < UPDATE_THROTTLE) {
        logger.debug('Skipping fetch - update throttled', {
          layerId,
          timeSinceLastUpdate: now - lastUpdateRef.current
        });
        return;
      }

      fetchingRef.current = true;

      try {
        // Check cache first
        const cached = layerCache.get(layerId);
        if (cached && cached.isValid && Date.now() - cached.timestamp < CACHE_TTL) {
          logger.info('Using cached layer data', {
            layerId,
            dataTimestamp: new Date(cached.timestamp).toISOString(),
            subscribers: cached.subscribers,
            lastUpdate: new Date(cached.lastUpdate).toISOString()
          });
          if (mounted.current) {
            setData(cached.data);
            setLoading(false);
          }
          return;
        }

        // Skip if cleanup started
        if (cleanupRef.current) return;

        logger.info('Fetching layer data from Supabase', { layerId });
        
        // First get the layer metadata
        const { data: layerData, error: layerError } = await supabase
          .from('layers')
          .select('*')
          .eq('id', layerId)
          .single();

        // Skip if cleanup started
        if (cleanupRef.current) {
          logger.info('Skipping metadata processing - cleanup in progress', { layerId });
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

        logger.info('Layer metadata fetched', { 
          layerId,
          name: layerData.name,
          type: layerData.type
        });

        // Skip if cleanup started
        if (cleanupRef.current) return;

        logger.info('Fetching layer features', { layerId });

        // Then get the features for this layer with PostGIS geometry
        const { data: features, error: featuresError } = await supabase
          .rpc('get_layer_features', {
            p_layer_id: layerId
          });

        // Skip if cleanup started
        if (cleanupRef.current) {
          logger.info('Skipping features processing - cleanup in progress', { layerId });
          return;
        }

        if (featuresError) {
          logger.error('Features fetch error', { error: featuresError });
          throw featuresError;
        }

        logger.info('Layer features fetched', {
          layerId,
          featureCount: features?.length || 0
        });

        // Process features into GeoJSON
        const processedFeatures = features?.map((feature: {
          id: string;
          geojson: string | GeoJSON.Geometry;
          properties: Record<string, any>;
        }) => {
          try {
            const geometry = typeof feature.geojson === 'string' 
              ? JSON.parse(feature.geojson)
              : feature.geojson;

            if (!validateGeometry(geometry)) {
              logger.warn('Invalid geometry in feature', { featureId: feature.id });
              return null;
            }

            return {
              type: 'Feature',
              id: feature.id,
              geometry,
              properties: feature.properties || {}
            } as Feature;
          } catch (error) {
            logger.warn('Failed to process feature', { featureId: feature.id, error });
            return null;
          }
        }).filter(Boolean) || [];

        const featureCollection: GeoJSON.FeatureCollection = {
          type: 'FeatureCollection',
          features: processedFeatures
        };

        const layerDataWithFeatures: LayerData = {
          id: layerData.id,
          name: layerData.name,
          type: layerData.type,
          properties: layerData.properties || {},
          features: processedFeatures
        };

        // Cache the data
        layerCache.set(layerId, {
          data: layerDataWithFeatures,
          timestamp: Date.now(),
          subscribers: 1,
          isValid: true,
          lastUpdate: Date.now()
        });

        logger.info('Layer data cached', {
          layerId,
          name: layerData.name,
          featureCount: processedFeatures.length
        });

        // Update layer store with GeoJSON data
        const layerStore = useLayerStore.getState();
        layerStore.setLayerGeoJsonData(layerId, featureCollection);
        layerStore.updateLayerStatus(layerId, 'complete');

        if (mounted.current) {
          setData(layerDataWithFeatures);
          setLoading(false);
        }

        lastUpdateRef.current = Date.now();

      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to fetch layer data';
        logger.error('Layer data fetch error', { error: err });
        if (mounted.current) {
          setError(new Error(errorMessage));
          setLoading(false);
        }
      } finally {
        fetchingRef.current = false;
      }
    }

    if (layerId) {
      fetchLayerData();
    }
  }, [layerId]);

  return {
    data,
    loading,
    error
  };
} 