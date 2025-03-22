'use client';

import { useEffect, useState, useRef } from 'react';
import createClient from '@/utils/supabase/client';
import { Database } from '@/types/supabase';
import { LogManager } from '@/core/logging/log-manager';

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
}>();

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface LayerData {
  id: string;
  name: string;
  type: string;
  properties: Record<string, any>;
  features: GeoJSON.Feature[];
}

interface LayerFeature {
  id: string;
  properties: Record<string, any>;
  geojson: string;
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

  useEffect(() => {
    mounted.current = true;
    cleanupRef.current = false;
    
    // Subscribe to cache
    const cached = layerCache.get(layerId);
    if (cached) {
      cached.subscribers++;
      if (cached.isValid) {
        setData(cached.data);
        setLoading(false);
      }
    }
    
    return () => {
      mounted.current = false;
      cleanupRef.current = true;
      
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
      if (fetchingRef.current || cleanupRef.current) return;
      fetchingRef.current = true;

      try {
        // Check cache first
        const cached = layerCache.get(layerId);
        if (cached && cached.isValid && Date.now() - cached.timestamp < CACHE_TTL) {
          logger.debug('Using cached layer data', { layerId });
          if (mounted.current) {
            setData(cached.data);
            setLoading(false);
          }
          return;
        }

        // Skip if cleanup started
        if (cleanupRef.current) return;

        logger.debug('Fetching layer data', { layerId });
        
        // First get the layer metadata
        const { data: layerData, error: layerError } = await supabase
          .from('layers')
          .select('*')
          .eq('id', layerId)
          .single();

        // Skip if cleanup started
        if (cleanupRef.current) return;

        if (layerError) {
          logger.error('Layer metadata fetch error', { error: layerError });
          throw layerError;
        }
        if (!layerData) {
          logger.error('Layer not found', { layerId });
          throw new Error('Layer not found');
        }

        logger.debug('Layer metadata fetched', { name: layerData.name });

        // Skip if cleanup started
        if (cleanupRef.current) return;

        // Then get the features for this layer with PostGIS geometry
        const { data: features, error: featuresError } = await supabase
          .rpc('get_layer_features', {
            layer_id: layerId
          });

        // Skip if cleanup started
        if (cleanupRef.current) return;

        if (featuresError) {
          logger.error('Features fetch error', { error: featuresError });
          throw featuresError;
        }

        logger.debug('Features fetched', { 
          featureCount: features?.length || 0
        });

        // Skip if cleanup started
        if (cleanupRef.current) return;

        // Convert features to GeoJSON with validation
        const geoJsonFeatures: GeoJSON.Feature[] = [];
        
        for (const feature of features || []) {
          try {
            const geometry = JSON.parse(feature.geojson);
            
            // Validate geometry and coordinates
            if (!validateGeometry(geometry)) {
              logger.warn('Invalid geometry in feature', { 
                featureId: feature.id,
                geometry 
              });
              continue;
            }

            geoJsonFeatures.push({
              type: 'Feature',
              id: feature.id,
              geometry,
              properties: feature.properties || {}
            });
          } catch (error) {
            logger.warn('Error parsing feature geometry', { 
              featureId: feature.id,
              error 
            });
          }
        }

        // Skip if cleanup started
        if (cleanupRef.current) return;

        const preparedData = {
          id: layerData.id,
          name: layerData.name,
          type: layerData.type,
          properties: layerData.properties || {},
          features: geoJsonFeatures
        };

        // Update cache
        layerCache.set(layerId, {
          data: preparedData,
          timestamp: Date.now(),
          subscribers: cached?.subscribers || 1,
          isValid: true
        });

        if (mounted.current) {
          setData(preparedData);
        }
      } catch (err) {
        const error = err as Error;
        logger.error('Failed to load layer data', { error });
        if (mounted.current) {
          setError(error);
        }
      } finally {
        if (mounted.current) {
          setLoading(false);
        }
        fetchingRef.current = false;
      }
    }

    fetchLayerData();
  }, [layerId]);

  return { data, loading, error };
} 