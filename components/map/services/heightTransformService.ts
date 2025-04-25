'use client';

import { processStoredLv95Coordinates } from '@/core/utils/coordinates';
import { LogManager } from '@/core/logging/log-manager';
import type { Feature, FeatureCollection } from 'geojson';

const SOURCE = 'HeightTransformService';
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

/**
 * Processes a GeoJSON FeatureCollection to transform heights for features 
 * with LV95 stored coordinates.
 * 
 * @param featureCollection The GeoJSON feature collection to process
 * @returns A transformed feature collection with accurate ellipsoidal heights
 */
export async function processFeatureCollectionHeights(
  featureCollection: FeatureCollection
): Promise<FeatureCollection> {
  try {
    logger.info('Processing feature collection heights', {
      featureCount: featureCollection.features.length
    });
    
    let transformedCount = 0;
    let unchangedCount = 0;
    
    // Process each feature in parallel
    const transformedFeatures = await Promise.all(
      featureCollection.features.map(async (feature) => {
        // Check if this feature has lv95_stored height mode
        if (feature.properties?.height_mode === 'lv95_stored') {
          try {
            // Transform using the utility function
            const transformedFeature = await processStoredLv95Coordinates(feature);
            transformedCount++;
            return transformedFeature;
          } catch (error) {
            logger.error('Error transforming feature height', {
              featureId: feature.id,
              error
            });
            // Return original feature if transformation fails
            unchangedCount++;
            return feature;
          }
        } else {
          // Feature doesn't need height transformation
          unchangedCount++;
          return feature;
        }
      })
    );
    
    logger.info('Feature heights processed', {
      transformedCount,
      unchangedCount,
      totalCount: featureCollection.features.length
    });
    
    return {
      ...featureCollection,
      features: transformedFeatures
    };
  } catch (error) {
    logger.error('Error processing feature collection heights', error);
    // Return original collection if processing fails
    return featureCollection;
  }
}

/**
 * Detects if a feature collection contains any features that need height transformation
 * 
 * @param featureCollection The GeoJSON feature collection to check
 * @returns True if any feature needs height transformation
 */
export function needsHeightTransformation(featureCollection: FeatureCollection): boolean {
  return featureCollection.features.some(
    feature => feature.properties?.height_mode === 'lv95_stored'
  );
}

/**
 * Interface for the height transformation status response
 */
export interface HeightTransformationStatus {
  layer_id: string;
  latest_batch?: {
    id: string;
    status: 'pending' | 'in_progress' | 'complete' | 'failed';
    height_source_type: string;
    height_source_attribute: string | null;
    total_features: number;
    processed_features: number;
    failed_features: number;
    started_at: string;
    completed_at: string | null;
  };
  feature_status: {
    total: number;
    pending: number;
    in_progress: number;
    complete: number;
    failed: number;
  };
}

/**
 * Gets the current height transformation status for a layer
 * 
 * @param layerId The layer ID to check status for
 * @returns The transformation status data or null if an error occurs
 */
export async function getHeightTransformationStatus(layerId: string): Promise<HeightTransformationStatus | null> {
  try {
    logger.debug('Fetching height transformation status', { layerId });
    
    const response = await fetch(`/api/height-transformation/status?layerId=${encodeURIComponent(layerId)}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Failed to retrieve height transformation status', { 
        layerId, 
        status: response.status,
        error: errorText
      });
      return null;
    }
    
    const data = await response.json();
    logger.debug('Height transformation status retrieved', { layerId, data });
    
    return data as HeightTransformationStatus;
  } catch (error) {
    logger.error('Error getting height transformation status', { layerId, error });
    return null;
  }
} 