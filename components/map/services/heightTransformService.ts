'use client';

import { processStoredLv95Coordinates } from '@/core/utils/coordinates';
import { dbLogger } from '@/utils/logging/dbLogger';
import type { FeatureCollection } from 'geojson';
import { summarizeFeaturesForLogging } from '../utils/logging';

const LOG_SOURCE = 'HeightTransformService';

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
  const context = {
    source: LOG_SOURCE,
    featureCount: featureCollection.features.length,
    summary: summarizeFeaturesForLogging(featureCollection.features, 'info')
  };

  try {
    await dbLogger.info('Processing feature collection heights', context);
    
    let transformedCount = 0;
    let unchangedCount = 0;
    
    // Process each feature in parallel
    const transformedFeatures = await Promise.all(
      featureCollection.features.map(async (feature) => {
        const featureContext = {
          ...context,
          featureId: feature.id
        };

        // Check if this feature has lv95_stored height mode
        if (feature.properties?.height_mode === 'lv95_stored') {
          try {
            // Transform using the utility function
            const transformedFeature = await processStoredLv95Coordinates(feature);
            transformedCount++;
            return transformedFeature;
          } catch (error) {
            await dbLogger.error('Error transforming feature height', {
              ...featureContext,
              error: error instanceof Error ? {
                message: error.message,
                stack: error.stack,
                name: error.name
              } : error
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
    
    await dbLogger.info('Feature heights processed', {
      ...context,
      transformedCount,
      unchangedCount,
      totalCount: featureCollection.features.length
    });
    
    return {
      ...featureCollection,
      features: transformedFeatures
    };
  } catch (error) {
    await dbLogger.error('Error processing feature collection heights', {
      ...context,
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : error
    });
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
  const context = {
    source: LOG_SOURCE,
    layerId
  };

  try {
    await dbLogger.debug('Fetching height transformation status', context);
    
    const response = await fetch(`/api/height-transformation/status?layerId=${encodeURIComponent(layerId)}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      await dbLogger.error('Failed to retrieve height transformation status', { 
        ...context,
        status: response.status,
        error: errorText
      });
      return null;
    }
    
    const data = await response.json();
    await dbLogger.debug('Height transformation status retrieved', {
      ...context,
      data
    });
    
    return data as HeightTransformationStatus;
  } catch (error) {
    await dbLogger.error('Error getting height transformation status', {
      ...context,
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : error
    });
    return null;
  }
} 