import type { FullDataset, PreviewDataset, PreviewFeature, PreviewConfig } from '@/types/geo-import';
import simplify from '@turf/simplify';
import type { Feature, Geometry, GeoJsonProperties } from 'geojson';
import { LogManager } from '@/core/logging/log-manager';

const DEFAULT_CONFIG: Required<PreviewConfig> = {
  maxFeatures: 500,
  simplificationTolerance: 0.00001,
  randomSampling: true
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
 * Simplifies a GeoJSON geometry using the Douglas-Peucker algorithm
 */
function simplifyGeometry(geometry: Geometry, tolerance: number): Geometry {
  try {
    const feature: Feature = {
      type: 'Feature',
      geometry,
      properties: {}
    };
    
    const simplified = simplify(feature, { tolerance, highQuality: true });
    return simplified.geometry;
  } catch (error) {
    logger.warn('Failed to simplify geometry', { error, geometryType: geometry.type });
    return geometry; // Return original geometry if simplification fails
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

/**
 * Generates a preview dataset from a full dataset
 */
export function generatePreview(
  dataset: FullDataset,
  config: Partial<PreviewConfig> = {}
): PreviewDataset {
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
    randomSampling: config.randomSampling ?? DEFAULT_CONFIG.randomSampling
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

  // Create preview features with simplified geometries
  logger.info('Simplifying geometries...');
  const startTime = Date.now();
  let simplifiedCount = 0;
  let skippedCount = 0;

  const previewFeatures: PreviewFeature[] = sampledFeatures.map((feature, index) => {
    const originalFeature = dataset.features.find(f => f.id === feature.id);
    if (!originalFeature) {
      logger.error('Original feature not found', { featureId: feature.id });
      throw new Error('Original feature not found');
    }

    try {
      const simplifiedGeometry = simplifyGeometry(feature.geometry, finalConfig.simplificationTolerance);
      simplifiedCount++;

      return {
        id: originalFeature.id,
        previewId: index,
        originalFeatureIndex: originalFeature.originalIndex || originalFeature.id,
        geometry: simplifiedGeometry,
        properties: feature.properties || {}
      };
    } catch (error) {
      logger.warn('Failed to process feature', {
        featureId: feature.id,
        error
      });
      skippedCount++;

      // Return feature with original geometry
      return {
        id: originalFeature.id,
        previewId: index,
        originalFeatureIndex: originalFeature.originalIndex || originalFeature.id,
        geometry: feature.geometry,
        properties: feature.properties || {}
      };
    }
  });

  const processingTime = Date.now() - startTime;
  logger.info('Preview generation complete', {
    originalFeatures: dataset.features.length,
    previewFeatures: previewFeatures.length,
    simplifiedGeometries: simplifiedCount,
    skippedFeatures: skippedCount,
    processingTimeMs: processingTime
  });

  return {
    sourceFile: dataset.sourceFile,
    features: previewFeatures,
    metadata: dataset.metadata
  };
} 