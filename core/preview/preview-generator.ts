import { FullDataset, PreviewDataset, PreviewFeature, GeoFeature } from '@/types/geo-import';
import { GeometrySimplifier, SimplificationOptions } from '../processors/geometry-simplifier';
import { ParserProgressEvent } from '../processors/base-parser';

/**
 * Configuration for preview generation
 */
export interface PreviewGeneratorOptions {
  maxFeatures?: number;  // Maximum number of features to include
  simplification?: SimplificationOptions;  // Geometry simplification options
  randomSampling?: boolean;  // Whether to use random sampling
  maintainTopology?: boolean;  // Whether to maintain topology between features
  bounds?: [number, number, number, number];  // Bounding box to filter features
}

/**
 * Default preview generator options
 */
const DEFAULT_OPTIONS: PreviewGeneratorOptions = {
  maxFeatures: 1000,
  simplification: {
    tolerance: 0.0001,
    highQuality: true,
    preserveTopology: true
  },
  randomSampling: true,
  maintainTopology: true
};

/**
 * Utility class for generating preview datasets
 */
export class PreviewGenerator {
  /**
   * Generate a preview dataset from a full dataset
   */
  static async generate(
    dataset: FullDataset,
    options: PreviewGeneratorOptions = DEFAULT_OPTIONS,
    onProgress?: (event: ParserProgressEvent) => void
  ): Promise<PreviewDataset> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const features = await this.sampleFeatures(dataset.features, opts, onProgress);
    
    return {
      sourceFile: dataset.sourceFile,
      features: await this.simplifyFeatures(features, opts, onProgress),
      metadata: dataset.metadata
    };
  }

  /**
   * Sample features from the full dataset
   */
  private static async sampleFeatures(
    features: GeoFeature[],
    options: PreviewGeneratorOptions,
    onProgress?: (event: ParserProgressEvent) => void
  ): Promise<GeoFeature[]> {
    let sampled = [...features];

    // Filter by bounds if specified
    if (options.bounds) {
      sampled = sampled.filter(feature => this.isFeatureInBounds(feature, options.bounds!));
    }

    // Sample features if needed
    if (options.maxFeatures && sampled.length > options.maxFeatures) {
      if (options.randomSampling) {
        // Random sampling
        sampled = this.randomSample(sampled, options.maxFeatures);
      } else {
        // Regular interval sampling
        const interval = Math.ceil(sampled.length / options.maxFeatures);
        sampled = sampled.filter((_, index) => index % interval === 0);
      }
    }

    if (onProgress) {
      onProgress({
        phase: 'processing',
        progress: 50,
        message: 'Features sampled',
        featuresProcessed: sampled.length,
        totalFeatures: features.length
      });
    }

    return sampled;
  }

  /**
   * Simplify features for preview
   */
  private static async simplifyFeatures(
    features: GeoFeature[],
    options: PreviewGeneratorOptions,
    onProgress?: (event: ParserProgressEvent) => void
  ): Promise<PreviewFeature[]> {
    const total = features.length;
    const simplified: PreviewFeature[] = [];

    for (let i = 0; i < features.length; i++) {
      const feature = features[i];
      
      // Simplify geometry
      const simplifiedGeometry = options.simplification
        ? GeometrySimplifier.simplify(feature.geometry, options.simplification)
        : feature.geometry;

      // Create preview feature
      simplified.push({
        ...feature,
        geometry: simplifiedGeometry,
        previewId: i,
        originalFeatureIndex: feature.originalIndex || i
      });

      if (onProgress) {
        onProgress({
          phase: 'processing',
          progress: 50 + (i / total) * 50,
          message: 'Simplifying geometries',
          featuresProcessed: i + 1,
          totalFeatures: total
        });
      }
    }

    return simplified;
  }

  /**
   * Check if a feature is within the specified bounds
   */
  private static isFeatureInBounds(
    feature: GeoFeature,
    bounds: [number, number, number, number]
  ): boolean {
    const [minX, minY, maxX, maxY] = bounds;

    switch (feature.geometry.type) {
      case 'Point': {
        const [x, y] = feature.geometry.coordinates;
        return x >= minX && x <= maxX && y >= minY && y <= maxY;
      }
      case 'MultiPoint':
      case 'LineString': {
        return feature.geometry.coordinates.some(([x, y]) =>
          x >= minX && x <= maxX && y >= minY && y <= maxY
        );
      }
      case 'MultiLineString':
      case 'Polygon': {
        return feature.geometry.coordinates.some(line =>
          line.some(([x, y]) => x >= minX && x <= maxX && y >= minY && y <= maxY)
        );
      }
      case 'MultiPolygon': {
        return feature.geometry.coordinates.some(polygon =>
          polygon.some(line =>
            line.some(([x, y]) => x >= minX && x <= maxX && y >= minY && y <= maxY)
          )
        );
      }
      default:
        return false;
    }
  }

  /**
   * Randomly sample n items from an array
   */
  private static randomSample<T>(array: T[], n: number): T[] {
    const sampled = [...array];
    let m = array.length;
    
    // Fisher-Yates shuffle, but only up to n elements
    while (m > 0 && m > array.length - n) {
      const i = Math.floor(Math.random() * m--);
      [sampled[m], sampled[i]] = [sampled[i], sampled[m]];
    }
    
    return sampled.slice(-n);
  }
} 