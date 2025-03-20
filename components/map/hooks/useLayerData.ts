'use client';

import { useEffect, useState } from 'react';
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

function validateCoordinates(coordinates: any[]): boolean {
  if (!Array.isArray(coordinates)) return false;
  
  // Handle different geometry types
  if (coordinates.length === 2) {
    // Single point coordinates [lng, lat]
    return (
      typeof coordinates[0] === 'number' &&
      typeof coordinates[1] === 'number' &&
      coordinates[0] >= -180 &&
      coordinates[0] <= 180 &&
      coordinates[1] >= -90 &&
      coordinates[1] <= 90
    );
  }
  
  // Handle nested coordinate arrays (LineString, Polygon, etc.)
  return coordinates.every(coord => 
    Array.isArray(coord) ? validateCoordinates(coord) : false
  );
}

function validateGeometry(geometry: any): boolean {
  if (!geometry || !geometry.type || !geometry.coordinates) return false;
  
  try {
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

  useEffect(() => {
    async function fetchLayerData() {
      try {
        logger.debug('Fetching layer data', { layerId });
        
        // First get the layer metadata
        const { data: layerData, error: layerError } = await supabase
          .from('layers')
          .select('*')
          .eq('id', layerId)
          .single();

        if (layerError) {
          logger.error('Layer metadata fetch error', { error: layerError });
          throw layerError;
        }
        if (!layerData) {
          logger.error('Layer not found', { layerId });
          throw new Error('Layer not found');
        }

        logger.debug('Layer metadata fetched', { name: layerData.name });

        // Then get the features for this layer with PostGIS geometry
        const { data: features, error: featuresError } = await supabase
          .rpc('get_layer_features', {
            layer_id: layerId
          });

        if (featuresError) {
          logger.error('Features fetch error', { error: featuresError });
          throw featuresError;
        }

        logger.debug('Features fetched', { 
          featureCount: features?.length || 0
        });

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

        const preparedData = {
          id: layerData.id,
          name: layerData.name,
          type: layerData.type,
          properties: layerData.properties || {},
          features: geoJsonFeatures
        };

        logger.info('Layer loaded', { 
          name: preparedData.name,
          featureCount: geoJsonFeatures.length,
          invalidFeatures: (features || []).length - geoJsonFeatures.length
        });

        setData(preparedData);
      } catch (err) {
        const error = err as Error;
        logger.error('Failed to load layer data', { error });
        setError(error);
      } finally {
        setLoading(false);
      }
    }

    logger.debug('Initializing layer data fetch', { layerId });
    fetchLayerData();

    return () => {
      logger.debug('Cleaning up layer data', { layerId });
    };
  }, [layerId]);

  return { data, loading, error };
} 