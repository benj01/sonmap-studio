import type { FullDataset, PreviewDataset, PreviewFeature, PreviewConfig } from '@/types/geo-import';
import simplify from '@turf/simplify';
import type { Feature, Geometry, GeoJsonProperties } from 'geojson';

const DEFAULT_CONFIG: Required<PreviewConfig> = {
  maxFeatures: 500,
  simplificationTolerance: 0.00001,
  randomSampling: true
};

/**
 * Simplifies a GeoJSON geometry using the Douglas-Peucker algorithm
 */
function simplifyGeometry(geometry: Geometry, tolerance: number): Geometry {
  const feature: Feature = {
    type: 'Feature',
    geometry,
    properties: {}
  };
  
  const simplified = simplify(feature, { tolerance, highQuality: true });
  return simplified.geometry;
}

/**
 * Samples features from a dataset
 */
function sampleFeatures(features: Feature[], maxFeatures: number, random: boolean): Feature[] {
  if (features.length <= maxFeatures) return features;

  if (random) {
    // Random sampling
    const indices = new Set<number>();
    while (indices.size < maxFeatures) {
      indices.add(Math.floor(Math.random() * features.length));
    }
    return Array.from(indices).map(i => features[i]);
  } else {
    // Systematic sampling
    const step = Math.ceil(features.length / maxFeatures);
    return features.filter((_, i) => i % step === 0);
  }
}

/**
 * Generates a preview dataset from a full dataset
 */
export function generatePreview(
  dataset: FullDataset,
  config: Partial<PreviewConfig> = {}
): PreviewDataset {
  const finalConfig: Required<PreviewConfig> = {
    ...DEFAULT_CONFIG,
    ...config,
    simplificationTolerance: config.simplificationTolerance || DEFAULT_CONFIG.simplificationTolerance,
    maxFeatures: config.maxFeatures || DEFAULT_CONFIG.maxFeatures,
    randomSampling: config.randomSampling ?? DEFAULT_CONFIG.randomSampling
  };

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
  const previewFeatures: PreviewFeature[] = sampledFeatures.map((feature, index) => {
    const originalFeature = dataset.features.find(f => f.id === feature.id);
    if (!originalFeature) throw new Error('Original feature not found');

    return {
      id: originalFeature.id,
      previewId: index,
      originalFeatureIndex: originalFeature.originalIndex || originalFeature.id,
      geometry: simplifyGeometry(feature.geometry, finalConfig.simplificationTolerance),
      properties: feature.properties || {}
    };
  });

  return {
    sourceFile: dataset.sourceFile,
    features: previewFeatures,
    metadata: dataset.metadata
  };
} 