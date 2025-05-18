'use client';

import { useEffect, useState, useRef } from 'react';
import createClient from '@/utils/supabase/client';
import { dbLogger } from '@/utils/logging/dbLogger';
import { useLayerStore } from '@/store/layers/layerStore';
import type { Feature } from 'geojson';
import { processStoredLv95Coordinates } from '@/core/utils/coordinates';
import { summarizeFeaturesForLogging, abbreviateCoordinatesForLog } from '../utils/logging';

const SOURCE = 'useLayerData';

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
  properties: Record<string, unknown>;
  features: GeoJSON.Feature[];
}

interface Coordinate extends Array<number> {
  [index: number]: number;
  length: 2 | 3;
}

type NestedCoordinate = Coordinate | Coordinate[] | Coordinate[][] | Coordinate[][][];

function validateCoordinates(coordinates: unknown): coordinates is NestedCoordinate {
  if (!Array.isArray(coordinates)) return false;
  
  // Handle nested arrays (for polygons, etc.)
  if (Array.isArray(coordinates[0])) {
    return coordinates.every((coord) => validateCoordinates(coord));
  }
  
  // Handle single coordinate
  return coordinates.length >= 2 && 
         coordinates.length <= 3 && // Allow z-value
         coordinates.every(c => typeof c === 'number' && !isNaN(c));
}

function validateGeometry(geometry: unknown): geometry is GeoJSON.Geometry {
  if (!geometry || typeof geometry !== 'object' || !('type' in geometry) || !('coordinates' in geometry)) return false;
  
  try {
    const geom = geometry as { type: string; coordinates: unknown };
    
    // For LineString, validate each coordinate pair
    if (geom.type === 'LineString') {
      return Array.isArray(geom.coordinates) && 
        geom.coordinates.length >= 2 &&
        geom.coordinates.every((coord) => 
          Array.isArray(coord) && 
          coord.length >= 2 && 
          coord.length <= 3 && // Allow z-value
          coord.every(c => typeof c === 'number' && !isNaN(c))
        );
    }
    
    // For Polygon, validate each ring
    if (geom.type === 'Polygon') {
      return Array.isArray(geom.coordinates) &&
        geom.coordinates.every((ring) =>
          Array.isArray(ring) &&
          ring.length >= 4 && // At least 4 points for a closed ring
          ring.every((coord) =>
            Array.isArray(coord) &&
            coord.length >= 2 &&
            coord.length <= 3 && // Allow z-value
            coord.every(c => typeof c === 'number' && !isNaN(c))
          )
        );
    }
    
    // For other types, use general validation
    return validateCoordinates(geom.coordinates);
  } catch (error) {
    // Since this is a synchronous validation function, we can't await the logger call
    // Instead, we use a separate error handler function
    handleValidationError(error);
    return false;
  }
}

// Separate error handler function to handle the async logging
function handleValidationError(error: unknown) {
  void dbLogger.warn('Invalid geometry', { error }, { source: SOURCE }).catch(err => {
    console.error('Failed to log validation error:', err);
  });
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

  // Log hook initialization
  useEffect(() => {
    async function logInitialization() {
      try {
        await dbLogger.info('useLayerData hook called', { layerId, loading, error: error?.message, hasCachedData: !!layerCache.get(layerId) }, { source: SOURCE });
      } catch (err) {
        console.error('Failed to log initialization:', err);
      }
    }
    void logInitialization().catch(err => {
      console.error('Failed to execute logInitialization:', err);
    });
  }, [layerId, loading, error]);

  useEffect(() => {
    async function setupAndSubscribe() {
      try {
        mounted.current = true;
        cleanupRef.current = false;
        
        // Log mount effect
        await dbLogger.info('useLayerData mount effect', { ...data }, { source: SOURCE });
        
        // Subscribe to cache
        const cached = layerCache.get(layerId);
        if (cached) {
          cached.subscribers++;
          if (cached.isValid) {
            await dbLogger.info('Using cached layer data', { ...data }, { source: SOURCE });
            setData(cached.data);
            setLoading(false);
          }
        }
      } catch (err) {
        console.error('Failed to setup and subscribe:', err);
      }
    }

    void setupAndSubscribe().catch(err => {
      console.error('Failed to execute setupAndSubscribe:', err);
    });
    
    return () => {
      async function cleanup() {
        try {
          mounted.current = false;
          cleanupRef.current = true;
          
          await dbLogger.info('useLayerData cleanup', { ...data }, { source: SOURCE });
          
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
        } catch (err) {
          console.error('Failed to cleanup:', err);
        }
      }
      void cleanup().catch(err => {
        console.error('Failed to execute cleanup:', err);
      });
    };
  }, [layerId]);

  useEffect(() => {
    async function fetchLayerData() {
      // Prevent concurrent fetches or fetching during cleanup
      if (fetchingRef.current || cleanupRef.current) {
        await dbLogger.info('Skipping fetch - already fetching or cleanup in progress', { ...data }, { source: SOURCE });
        return;
      }

      // Throttle updates
      const now = Date.now();
      if (now - lastUpdateRef.current < UPDATE_THROTTLE) {
        await dbLogger.debug('Skipping fetch - update throttled', { ...data }, { source: SOURCE });
        return;
      }

      fetchingRef.current = true;

      try {
        // Check cache first
        const cached = layerCache.get(layerId);
        if (cached && cached.isValid && Date.now() - cached.timestamp < CACHE_TTL) {
          await dbLogger.info('Using cached layer data', { ...data }, { source: SOURCE });
          if (mounted.current) {
            setData(cached.data);
            setLoading(false);
          }
          return;
        }

        // Skip if cleanup started
        if (cleanupRef.current) return;

        await dbLogger.info('Fetching layer data from Supabase', { ...data }, { source: SOURCE });
        
        // First get the layer metadata
        const { data: layerData, error: layerError } = await supabase
          .from('layers')
          .select('*')
          .eq('id', layerId)
          .single();

        // Skip if cleanup started
        if (cleanupRef.current) {
          await dbLogger.info('Skipping metadata processing - cleanup in progress', { ...data }, { source: SOURCE });
          return;
        }

        if (layerError) {
          await dbLogger.error('Layer metadata fetch error', { error: layerError instanceof Error ? layerError.message : String(layerError) }, { source: SOURCE });
          throw layerError;
        }
        if (!layerData) {
          await dbLogger.error('Layer not found', { ...data }, { source: SOURCE });
          throw new Error('Layer not found');
        }

        await dbLogger.info('Layer metadata fetched', { ...layerData }, { source: SOURCE });

        // Skip if cleanup started
        if (cleanupRef.current) return;

        await dbLogger.info('Fetching layer features', { ...data }, { source: SOURCE });

        // Then get the features for this layer with PostGIS geometry
        const { data: features, error: featuresError } = await supabase
          .rpc('get_layer_features', {
            p_layer_id: layerId
          });

        // Skip if cleanup started
        if (cleanupRef.current) {
          await dbLogger.info('Skipping features processing - cleanup in progress', { ...data }, { source: SOURCE });
          return;
        }

        if (featuresError) {
          await dbLogger.error('Features fetch error', { error: featuresError instanceof Error ? featuresError.message : String(featuresError) }, { source: SOURCE });
          throw featuresError;
        }

        await dbLogger.info('Layer features fetched', { ...data }, { source: SOURCE });

        // Process features into GeoJSON
        const processedFeatures = (await Promise.all(features?.map(async (feature: {
          id: string;
          geojson: string | GeoJSON.Geometry;
          properties: Record<string, unknown>;
        }) => {
          try {
            const geometry = typeof feature.geojson === 'string' 
              ? JSON.parse(feature.geojson)
              : feature.geojson;

            if (!validateGeometry(geometry)) {
              await dbLogger.warn('Invalid geometry in feature', { featureId: feature.id, error: error }, { source: SOURCE });
              return null;
            }

            // Create the GeoJSON feature
            let geoJsonFeature: Feature = {
              type: 'Feature',
              id: feature.id,
              geometry,
              properties: feature.properties || {}
            };

            // Process LV95 stored coordinates if needed
            if (feature.properties?.height_mode === 'lv95_stored' && 
                feature.properties?.lv95_easting && 
                feature.properties?.lv95_northing && 
                feature.properties?.lv95_height) {
              // Ensure feature is a valid GeoJSON Feature for logging
              const validFeature: Feature = {
                type: 'Feature',
                geometry: typeof feature.geojson === 'string' ? JSON.parse(feature.geojson) : feature.geojson,
                properties: feature.properties || {},
                id: feature.id || undefined
              };
              try {
                await dbLogger.debug('Processing feature with LV95 stored coordinates', { summary: summarizeFeaturesForLogging([validFeature], 'info') }, { source: SOURCE });
                geoJsonFeature = await processStoredLv95Coordinates(geoJsonFeature);
                await dbLogger.debug('Transformed LV95 coordinates to WGS84 with accurate height', { properties: { ...geoJsonFeature.properties }, geometry: abbreviateCoordinatesForLog(geoJsonFeature.geometry) }, { source: SOURCE });
              } catch (transformError) {
                await dbLogger.warn('Failed to transform LV95 coordinates, using original feature', { summary: summarizeFeaturesForLogging([validFeature], 'info') }, { source: SOURCE });
                // Continue with the original feature
              }
            }

            return geoJsonFeature;
          } catch (error) {
            await dbLogger.warn('Failed to process feature', { ...feature }, { source: SOURCE });
            return null;
          }
        }) || [])).filter((feature): feature is Feature => feature !== null);

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

        await dbLogger.info('Layer data cached', { ...layerData }, { source: SOURCE });

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
        await dbLogger.error('Layer data fetch error', { error: errorMessage }, { source: SOURCE });
        if (mounted.current) {
          setError(new Error(errorMessage));
          setLoading(false);
        }
      } finally {
        fetchingRef.current = false;
      }
    }

    if (layerId) {
      void fetchLayerData().catch(async (error) => {
        await dbLogger.error('Unhandled error in fetchLayerData', { error: error instanceof Error ? error.message : String(error) }, { source: SOURCE });
      });
    }
  }, [layerId, supabase]);

  return {
    data,
    loading,
    error
  };
} 