import type { FullDataset, PreviewDataset, PreviewFeature, PreviewConfig } from '@/types/geo-import';
import simplify from '@turf/simplify';
import kinks from '@turf/kinks';
import unkink from '@turf/unkink-polygon';
import area from '@turf/area';
import type { Feature, Geometry, GeoJsonProperties, Polygon, MultiPolygon } from 'geojson';
import { LogManager } from '@/core/logging/log-manager';

const DEFAULT_CONFIG: Required<PreviewConfig> = {
  maxFeatures: 500,
  simplificationTolerance: 0.0001,
  randomSampling: true,
  chunkSize: 100
};

const SOURCE = 'PreviewGenerator';
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
  }
};

/**
 * Validates and repairs a polygon geometry
 */
function validateAndRepairGeometry(geometry: Geometry): { 
  geometry: Geometry | null; 
  wasRepaired: boolean;
  error?: string;
} {
  try {
    // Only process polygon geometries
    if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') {
      return { geometry, wasRepaired: false };
    }

    const feature: Feature<Polygon | MultiPolygon> = {
      type: 'Feature',
      geometry: geometry as Polygon | MultiPolygon,
      properties: {}
    };

    // Check for self-intersections
    const intersections = kinks(feature);
    if (intersections.features.length === 0) {
      // No self-intersections found
      return { geometry, wasRepaired: false };
    }

    logger.info('Found self-intersections in geometry', { 
      intersectionCount: intersections.features.length 
    });

    // Try to repair using unkink-polygon
    const unkinked = unkink(feature);
    if (!unkinked || !unkinked.features.length) {
      return { 
        geometry: null, 
        wasRepaired: false,
        error: 'Failed to repair self-intersecting polygon' 
      };
    }

    // If we got multiple polygons after unkinking, use the largest one
    if (unkinked.features.length > 1) {
      const largestPolygon = unkinked.features.reduce((largest, current) => {
        const currentArea = area(current);
        const largestArea = area(largest);
        return currentArea > largestArea ? current : largest;
      });

      logger.info('Repaired self-intersecting polygon', {
        originalPolygons: unkinked.features.length,
        selectedArea: area(largestPolygon)
      });

      return { 
        geometry: largestPolygon.geometry, 
        wasRepaired: true 
      };
    }

    // Single polygon after unkinking
    return { 
      geometry: unkinked.features[0].geometry, 
      wasRepaired: true 
    };

  } catch (error) {
    logger.warn('Failed to validate/repair geometry', { error });
    return { 
      geometry: null, 
      wasRepaired: false,
      error: error instanceof Error ? error.message : 'Unknown error during geometry repair'
    };
  }
}

/**
 * Simplifies a GeoJSON geometry using the Douglas-Peucker algorithm
 */
function simplifyGeometry(geometry: Geometry, tolerance: number): Geometry {
  try {
    const feature: Feature = {
      type: 'Feature',
      geometry,
      properties: {}
    };
    
    const simplified = simplify(feature, { tolerance });
    return simplified.geometry;
  } catch (error) {
    logger.warn('Failed to simplify geometry', { error, geometryType: geometry.type });
    return geometry;
  }
}

/**
 * Samples features from a dataset
 */
function sampleFeatures(features: Feature[], maxFeatures: number, random: boolean): Feature[] {
  if (features.length <= maxFeatures) {
    logger.info('No sampling needed, feature count within limit', {
      featureCount: features.length,
      maxFeatures
    });
    return features;
  }

  logger.info('Sampling features', {
    totalFeatures: features.length,
    targetCount: maxFeatures,
    method: random ? 'random' : 'systematic'
  });

  let sampledFeatures: Feature[];
  if (random) {
    // Random sampling
    const indices = new Set<number>();
    while (indices.size < maxFeatures) {
      indices.add(Math.floor(Math.random() * features.length));
    }
    sampledFeatures = Array.from(indices).map(i => features[i]);
  } else {
    // Systematic sampling
    const step = Math.ceil(features.length / maxFeatures);
    sampledFeatures = features.filter((_, i) => i % step === 0);
  }

  logger.info('Sampling complete', {
    sampledCount: sampledFeatures.length,
    reductionRatio: (sampledFeatures.length / features.length).toFixed(2)
  });

  return sampledFeatures;
}

interface ProcessedFeature extends PreviewFeature {
  properties: Record<string, any> & {
    wasRepaired: boolean;
  };
}

type ProcessingResult = ProcessedFeature | null;

/**
 * Process features in chunks to avoid blocking the UI
 */
async function processChunks(
  features: Feature[],
  tolerance: number,
  chunkSize: number,
  onChunkProcessed?: (chunk: ProcessedFeature[]) => void
): Promise<{ 
  features: ProcessedFeature[];
  stats: { 
    processed: number;
    repaired: number;
    failed: number;
    simplified: number;
  };
}> {
  const chunks: Feature[][] = [];
  for (let i = 0; i < features.length; i += chunkSize) {
    chunks.push(features.slice(i, i + chunkSize));
  }

  const results: ProcessedFeature[] = [];
  let repairedCount = 0;
  let failedCount = 0;
  let simplifiedCount = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const chunkResults = await Promise.all(chunk.map(async (feature, index) => {
      try {
        // First validate and repair if necessary
        const { geometry: repairedGeometry, wasRepaired, error } = validateAndRepairGeometry(feature.geometry);
        
        if (error || !repairedGeometry) {
          logger.warn('Geometry repair failed', { 
            featureId: feature.id, 
            error 
          });
          failedCount++;
          return null;
        }

        if (wasRepaired) {
          repairedCount++;
          logger.info('Geometry repaired', { featureId: feature.id });
        }

        // Then simplify the repaired geometry
        const simplifiedGeometry = simplifyGeometry(repairedGeometry, tolerance);
        simplifiedCount++;
        
        const processedFeature: ProcessedFeature = {
          id: feature.id as number,
          previewId: i * chunkSize + index,
          originalFeatureIndex: feature.id as number,
          geometry: simplifiedGeometry,
          properties: {
            ...feature.properties || {},
            wasRepaired: wasRepaired || false
          }
        };

        return processedFeature;
      } catch (error) {
        logger.warn('Failed to process feature', { featureId: feature.id, error });
        failedCount++;
        return null;
      }
    }));

    // Filter out null results from failed processing
    const validResults = chunkResults.filter((result): result is ProcessedFeature => result !== null);
    results.push(...validResults);
    
    if (onChunkProcessed) {
      onChunkProcessed(validResults);
    }

    // Allow UI to update between chunks
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  logger.info('Chunk processing complete', {
    totalFeatures: features.length,
    processedFeatures: results.length,
    repairedCount,
    failedCount,
    simplifiedCount
  });

  return {
    features: results,
    stats: {
      processed: results.length,
      repaired: repairedCount,
      failed: failedCount,
      simplified: simplifiedCount
    }
  };
}

/**
 * Generates a preview dataset from a full dataset
 */
export async function generatePreview(
  dataset: FullDataset,
  config: Partial<PreviewConfig> = {},
  onProgress?: (features: ProcessedFeature[]) => void
): Promise<PreviewDataset & { 
  stats?: { 
    processed: number; 
    repaired: number; 
    failed: number; 
    simplified: number; 
  }; 
}> {
  logger.info('Starting preview generation', {
    sourceDataset: {
      featureCount: dataset.features.length,
      geometryTypes: dataset.metadata?.geometryTypes,
      sourceFile: dataset.sourceFile
    },
    config
  });

  const finalConfig: Required<PreviewConfig> = {
    ...DEFAULT_CONFIG,
    ...config,
    simplificationTolerance: config.simplificationTolerance || DEFAULT_CONFIG.simplificationTolerance,
    maxFeatures: config.maxFeatures || DEFAULT_CONFIG.maxFeatures,
    randomSampling: config.randomSampling ?? DEFAULT_CONFIG.randomSampling,
    chunkSize: config.chunkSize || DEFAULT_CONFIG.chunkSize
  };

  logger.info('Using configuration', finalConfig);

  // Sample features
  const sampledFeatures = sampleFeatures(
    dataset.features.map(f => ({
      type: 'Feature' as const,
      geometry: f.geometry,
      properties: f.properties || {},
      id: f.id
    })),
    finalConfig.maxFeatures,
    finalConfig.randomSampling
  );

  // Process features in chunks
  const startTime = Date.now();
  const { features: previewFeatures, stats } = await processChunks(
    sampledFeatures,
    finalConfig.simplificationTolerance,
    finalConfig.chunkSize,
    onProgress
  );

  const processingTime = Date.now() - startTime;
  logger.info('Preview generation complete', {
    originalFeatures: dataset.features.length,
    previewFeatures: previewFeatures.length,
    processingTimeMs: processingTime,
    stats
  });

  return {
    sourceFile: dataset.sourceFile,
    features: previewFeatures,
    metadata: dataset.metadata,
    stats
  };
} 