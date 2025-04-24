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