import { Feature, Geometry } from 'geojson';
import { LogManager } from '../logging/log-manager';

export interface SamplingOptions {
  maxFeatures?: number;
  preserveGeometryTypes?: boolean;
  preserveAttributeRanges?: boolean;
  attributeWeights?: Record<string, number>;
  spatialDistribution?: 'random' | 'grid' | 'clustered';
  seed?: number;
}

export interface SamplingStats {
  originalCount: number;
  sampledCount: number;
  geometryTypeDistribution: Record<string, number>;
  attributeRanges: Record<string, {
    min?: number;
    max?: number;
    uniqueValues?: Set<string>;
  }>;
}

export class FeatureSampler {
  private readonly logger = LogManager.getInstance();

  /**
   * Sample features using smart selection
   */
  public sampleFeatures(
    features: Feature[],
    options: SamplingOptions = {}
  ): { features: Feature[]; stats: SamplingStats } {
    try {
      const maxFeatures = options.maxFeatures || 1000;
      if (features.length <= maxFeatures) {
        return {
          features,
          stats: this.calculateStats(features)
        };
      }

      // Analyze original features
      const originalStats = this.calculateStats(features);

      // Determine sampling strategy
      let sampledFeatures: Feature[];
      switch (options.spatialDistribution) {
        case 'grid':
          sampledFeatures = this.sampleByGrid(features, maxFeatures);
          break;
        case 'clustered':
          sampledFeatures = this.sampleByClusters(features, maxFeatures);
          break;
        case 'random':
        default:
          sampledFeatures = this.sampleRandomly(features, maxFeatures, options.seed);
      }

      // Adjust sample to preserve geometry type distribution if requested
      if (options.preserveGeometryTypes) {
        sampledFeatures = this.adjustGeometryDistribution(
          sampledFeatures,
          originalStats.geometryTypeDistribution,
          maxFeatures
        );
      }

      // Adjust sample to preserve attribute ranges if requested
      if (options.preserveAttributeRanges) {
        sampledFeatures = this.adjustAttributeRanges(
          sampledFeatures,
          originalStats.attributeRanges,
          options.attributeWeights
        );
      }

      return {
        features: sampledFeatures,
        stats: this.calculateStats(sampledFeatures)
      };
    } catch (error) {
      this.logger.error('Error sampling features:', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * Calculate statistics for a set of features
   */
  private calculateStats(features: Feature[]): SamplingStats {
    const stats: SamplingStats = {
      originalCount: features.length,
      sampledCount: features.length,
      geometryTypeDistribution: {},
      attributeRanges: {}
    };

    for (const feature of features) {
      // Count geometry types
      if (feature.geometry) {
        const type = feature.geometry.type;
        stats.geometryTypeDistribution[type] = (stats.geometryTypeDistribution[type] || 0) + 1;
      }

      // Calculate attribute ranges
      if (feature.properties) {
        for (const [key, value] of Object.entries(feature.properties)) {
          if (!stats.attributeRanges[key]) {
            stats.attributeRanges[key] = {
              min: undefined,
              max: undefined,
              uniqueValues: new Set()
            };
          }

          if (typeof value === 'number') {
            const range = stats.attributeRanges[key];
            range.min = range.min === undefined ? value : Math.min(range.min, value);
            range.max = range.max === undefined ? value : Math.max(range.max, value);
          } else if (value !== null && value !== undefined) {
            stats.attributeRanges[key].uniqueValues?.add(String(value));
          }
        }
      }
    }

    return stats;
  }

  /**
   * Sample features randomly
   */
  private sampleRandomly(features: Feature[], maxFeatures: number, seed?: number): Feature[] {
    if (seed !== undefined) {
      // Use seeded random selection for reproducibility
      const random = this.createSeededRandom(seed);
      return this.shuffleArray([...features], random).slice(0, maxFeatures);
    }

    // Simple random selection
    const step = Math.max(1, Math.floor(features.length / maxFeatures));
    return features.filter((_, index) => index % step === 0).slice(0, maxFeatures);
  }

  /**
   * Sample features using a grid-based approach
   */
  private sampleByGrid(features: Feature[], maxFeatures: number): Feature[] {
    // Calculate bounds
    const bounds = this.calculateBounds(features);
    if (!bounds) return this.sampleRandomly(features, maxFeatures);

    // Create grid cells
    const gridSize = Math.ceil(Math.sqrt(maxFeatures));
    const cellWidth = (bounds.maxX - bounds.minX) / gridSize;
    const cellHeight = (bounds.maxY - bounds.minY) / gridSize;

    // Assign features to grid cells
    const grid: Feature[][] = Array(gridSize * gridSize).fill(null).map(() => []);
    for (const feature of features) {
      const centroid = this.calculateCentroid(feature);
      if (!centroid) continue;

      const col = Math.min(gridSize - 1, Math.floor((centroid[0] - bounds.minX) / cellWidth));
      const row = Math.min(gridSize - 1, Math.floor((centroid[1] - bounds.minY) / cellHeight));
      grid[row * gridSize + col].push(feature);
    }

    // Select features from each cell
    const sampledFeatures: Feature[] = [];
    const featuresPerCell = Math.ceil(maxFeatures / (gridSize * gridSize));
    for (const cell of grid) {
      if (cell.length > 0) {
        sampledFeatures.push(...this.sampleRandomly(cell, featuresPerCell));
      }
    }

    return sampledFeatures.slice(0, maxFeatures);
  }

  /**
   * Sample features using a clustering approach
   */
  private sampleByClusters(features: Feature[], maxFeatures: number): Feature[] {
    // TODO: Implement k-means or DBSCAN clustering
    // For now, fall back to random sampling
    return this.sampleRandomly(features, maxFeatures);
  }

  /**
   * Adjust sample to preserve geometry type distribution
   */
  private adjustGeometryDistribution(
    features: Feature[],
    targetDistribution: Record<string, number>,
    maxFeatures: number
  ): Feature[] {
    const total = Object.values(targetDistribution).reduce((a, b) => a + b, 0);
    const targetCounts = Object.fromEntries(
      Object.entries(targetDistribution).map(([type, count]) => [
        type,
        Math.round((count / total) * maxFeatures)
      ])
    );

    const byType = new Map<string, Feature[]>();
    for (const feature of features) {
      if (!feature.geometry) continue;
      const type = feature.geometry.type;
      if (!byType.has(type)) byType.set(type, []);
      byType.get(type)?.push(feature);
    }

    const result: Feature[] = [];
    for (const [type, count] of Object.entries(targetCounts)) {
      const typeFeatures = byType.get(type) || [];
      result.push(...this.sampleRandomly(typeFeatures, count));
    }

    return result;
  }

  /**
   * Adjust sample to preserve attribute ranges
   */
  private adjustAttributeRanges(
    features: Feature[],
    targetRanges: SamplingStats['attributeRanges'],
    weights: Record<string, number> = {}
  ): Feature[] {
    // For each numerical attribute, ensure we include min and max values
    for (const [attr, range] of Object.entries(targetRanges)) {
      if (range.min === undefined || range.max === undefined) continue;

      const weight = weights[attr] || 1;
      if (weight <= 0) continue;

      // Find features with extreme values
      const withMin = features.find(f => f.properties?.[attr] === range.min);
      const withMax = features.find(f => f.properties?.[attr] === range.max);

      // Add them to the sample if not already included
      if (withMin && !features.includes(withMin)) features.push(withMin);
      if (withMax && !features.includes(withMax)) features.push(withMax);
    }

    return features;
  }

  /**
   * Calculate bounds of features
   */
  private calculateBounds(features: Feature[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let hasValidBounds = false;

    for (const feature of features) {
      const centroid = this.calculateCentroid(feature);
      if (!centroid) continue;

      minX = Math.min(minX, centroid[0]);
      minY = Math.min(minY, centroid[1]);
      maxX = Math.max(maxX, centroid[0]);
      maxY = Math.max(maxY, centroid[1]);
      hasValidBounds = true;
    }

    return hasValidBounds ? { minX, minY, maxX, maxY } : null;
  }

  /**
   * Calculate centroid of a feature
   */
  private calculateCentroid(feature: Feature): [number, number] | null {
    if (!feature.geometry) return null;

    const coords = this.extractCoordinates(feature.geometry);
    if (coords.length === 0) return null;

    const sum = coords.reduce(
      ([x, y], [cx, cy]) => [x + cx, y + cy],
      [0, 0]
    );

    return [sum[0] / coords.length, sum[1] / coords.length];
  }

  /**
   * Extract coordinates from geometry
   */
  private extractCoordinates(geometry: Geometry): Array<[number, number]> {
    const coordinates: Array<[number, number]> = [];

    const processCoordinate = (coord: any) => {
      if (Array.isArray(coord) && typeof coord[0] === 'number' && coord.length >= 2) {
        coordinates.push([coord[0], coord[1]]);
      } else if (Array.isArray(coord)) {
        coord.forEach(processCoordinate);
      }
    };

    if ('coordinates' in geometry) {
      processCoordinate(geometry.coordinates);
    }

    return coordinates;
  }

  /**
   * Create a seeded random number generator
   */
  private createSeededRandom(seed: number): () => number {
    return () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
  }

  /**
   * Shuffle array using Fisher-Yates algorithm
   */
  private shuffleArray<T>(array: T[], random: () => number): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }
} 