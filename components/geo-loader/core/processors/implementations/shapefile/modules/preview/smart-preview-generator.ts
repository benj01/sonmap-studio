import { Feature } from 'geojson';
import { 
  PreviewStrategy, 
  GeoBounds, 
  DensityAnalysis, 
  FeatureScore, 
  ViewportConfig, 
  PreviewResult 
} from './types';
import { Logger } from '../../../../../utils/logger';
import { DensityAnalyzer } from './density-analyzer';

export class SmartPreviewGenerator {
  private readonly LOG_SOURCE = 'SmartPreviewGenerator';
  private readonly DEFAULT_STRATEGY: PreviewStrategy = {
    targetFeatureCount: 1000,
    minFeatureDistance: 0.001, // Adjust based on coordinate system
    weights: {
      density: 0.4,
      distribution: 0.4,
      importance: 0.2
    }
  };

  private readonly densityAnalyzer: DensityAnalyzer;

  constructor(
    private readonly logger: Logger
  ) {
    this.densityAnalyzer = new DensityAnalyzer(logger);
  }

  /**
   * Generate an optimized preview of the features
   */
  public async generatePreview(
    features: Feature[],
    strategy: Partial<PreviewStrategy> = {},
    viewportConfig?: ViewportConfig
  ): Promise<PreviewResult> {
    const startTime = Date.now();
    const finalStrategy = { ...this.DEFAULT_STRATEGY, ...strategy };

    this.logger.debug(this.LOG_SOURCE, 'Generating preview', {
      featureCount: features.length,
      strategy: finalStrategy
    });

    try {
      // Step 1: Analyze feature density
      const densityAnalysis = this.densityAnalyzer.analyze(features);

      // Step 2: Score features
      const scoredFeatures = this.scoreFeatures(features, densityAnalysis, finalStrategy);

      // Step 3: Select representative features
      const selectedFeatures = this.selectFeatures(scoredFeatures, finalStrategy);

      // Step 4: Optimize viewport
      const viewport = this.optimizeViewport(selectedFeatures, viewportConfig);

      const processingTime = Date.now() - startTime;
      
      return {
        features: selectedFeatures,
        viewport,
        analysis: {
          density: densityAnalysis,
          coverage: this.calculateCoverage(selectedFeatures, features),
          representativeness: this.calculateRepresentativeness(selectedFeatures, features)
        },
        metrics: {
          processingTime,
          originalFeatureCount: features.length,
          selectedFeatureCount: selectedFeatures.length
        }
      };
    } catch (error) {
      this.logger.error(this.LOG_SOURCE, 'Preview generation failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Score features based on the strategy
   */
  private scoreFeatures(
    features: Feature[],
    densityAnalysis: DensityAnalysis,
    strategy: PreviewStrategy
  ): FeatureScore[] {
    return features.map(feature => {
      const densityScore = this.calculateDensityScore(feature, densityAnalysis);
      const distributionScore = this.calculateDistributionScore(feature, features);
      const importanceScore = this.calculateImportanceScore(feature);

      const score = 
        strategy.weights.density * densityScore +
        strategy.weights.distribution * distributionScore +
        strategy.weights.importance * importanceScore;

      return {
        feature,
        score,
        components: {
          density: densityScore,
          distribution: distributionScore,
          importance: importanceScore
        }
      };
    });
  }

  /**
   * Calculate density score for a feature
   */
  private calculateDensityScore(feature: Feature, analysis: DensityAnalysis): number {
    // Check if feature is in a hotspot
    const inHotspot = analysis.hotspots.some(hotspot => 
      this.isFeatureInBounds(feature, hotspot.bounds)
    );

    // Check if feature is in a sparse area
    const inSparseArea = analysis.sparseAreas.some(area => 
      this.isFeatureInBounds(feature, area.bounds)
    );

    // Prefer features in sparse areas for better distribution
    if (inSparseArea) return 0.8;
    if (inHotspot) return 0.3;
    return 0.5;
  }

  /**
   * Calculate distribution score based on distance to other features
   */
  private calculateDistributionScore(feature: Feature, allFeatures: Feature[]): number {
    const coords = this.getFeatureCenter(feature);
    if (!coords) return 0;

    // Calculate average distance to nearest N features
    const N = Math.min(10, allFeatures.length);
    const distances = allFeatures
      .map(other => {
        const otherCoords = this.getFeatureCenter(other);
        if (!otherCoords) return Infinity;
        return this.calculateDistance(coords, otherCoords);
      })
      .sort((a, b) => a - b)
      .slice(1, N + 1); // Skip first (distance to self)

    const avgDistance = distances.reduce((sum, d) => sum + d, 0) / distances.length;
    const maxDistance = Math.max(...distances);

    // Normalize score (0-1)
    return avgDistance / maxDistance;
  }

  /**
   * Calculate importance score based on feature properties
   */
  private calculateImportanceScore(feature: Feature): number {
    if (!feature.properties) return 0.5;

    // Example criteria for importance:
    // 1. Features with more properties
    // 2. Features with specific important properties
    // 3. Features with non-null values
    const propertyCount = Object.keys(feature.properties).length;
    const nonNullCount = Object.values(feature.properties)
      .filter(value => value !== null && value !== undefined).length;

    const hasImportantProps = this.hasImportantProperties(feature.properties);

    return (
      0.4 * (propertyCount / 10) + // Max score for 10+ properties
      0.4 * (nonNullCount / propertyCount) +
      0.2 * (hasImportantProps ? 1 : 0)
    );
  }

  /**
   * Select representative features based on scores
   */
  private selectFeatures(
    scoredFeatures: FeatureScore[],
    strategy: PreviewStrategy
  ): Feature[] {
    // Sort by score and apply minimum distance filter
    const sorted = [...scoredFeatures].sort((a, b) => b.score - a.score);
    const selected: Feature[] = [];
    
    for (const scored of sorted) {
      if (selected.length >= strategy.targetFeatureCount) break;
      
      if (strategy.minFeatureDistance) {
        const center = this.getFeatureCenter(scored.feature);
        if (!center) continue;

        const tooClose = selected.some(feat => {
          const otherCenter = this.getFeatureCenter(feat);
          if (!otherCenter) return false;
          return this.calculateDistance(center, otherCenter) < strategy.minFeatureDistance!;
        });

        if (tooClose) continue;
      }
      
      selected.push(scored.feature);
    }

    return selected;
  }

  /**
   * Optimize viewport for selected features
   */
  private optimizeViewport(
    features: Feature[],
    config?: ViewportConfig
  ): { bounds: GeoBounds; zoom: number } {
    const bounds = this.calculateBounds(features);
    const padding = config?.padding || 0.1;
    
    // Apply padding
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    const padX = width * padding;
    const padY = height * padding;

    // Adjust aspect ratio if specified
    if (config?.aspectRatio) {
      const currentRatio = width / height;
      if (currentRatio < config.aspectRatio) {
        // Too tall, add padding to sides
        const targetWidth = height * config.aspectRatio;
        const extraPadding = (targetWidth - width) / 2;
        bounds.minX -= extraPadding;
        bounds.maxX += extraPadding;
      } else {
        // Too wide, add padding to top/bottom
        const targetHeight = width / config.aspectRatio;
        const extraPadding = (targetHeight - height) / 2;
        bounds.minY -= extraPadding;
        bounds.maxY += extraPadding;
      }
    }

    return {
      bounds: {
        minX: bounds.minX - padX,
        minY: bounds.minY - padY,
        maxX: bounds.maxX + padX,
        maxY: bounds.maxY + padY
      },
      zoom: this.calculateOptimalZoom(bounds, config)
    };
  }

  // Helper methods

  private getFeatureCenter(feature: Feature): [number, number] | null {
    if (!feature.geometry) return null;

    switch (feature.geometry.type) {
      case 'Point':
        return feature.geometry.coordinates as [number, number];
      case 'LineString': {
        const coords = feature.geometry.coordinates as [number, number][];
        const mid = Math.floor(coords.length / 2);
        return coords[mid];
      }
      case 'Polygon': {
        const coords = feature.geometry.coordinates[0] as [number, number][];
        // Calculate centroid
        const sumX = coords.reduce((sum, [x]) => sum + x, 0);
        const sumY = coords.reduce((sum, [, y]) => sum + y, 0);
        return [sumX / coords.length, sumY / coords.length];
      }
      default:
        return null;
    }
  }

  private calculateBounds(features: Feature[]): GeoBounds {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    features.forEach(feature => {
      const center = this.getFeatureCenter(feature);
      if (center) {
        const [x, y] = center;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    });

    return { minX, minY, maxX, maxY };
  }

  private calculateDistance(coord1: [number, number], coord2: [number, number]): number {
    const [x1, y1] = coord1;
    const [x2, y2] = coord2;
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
  }

  private isFeatureInBounds(feature: Feature, bounds: GeoBounds): boolean {
    const center = this.getFeatureCenter(feature);
    if (!center) return false;

    const [x, y] = center;
    return (
      x >= bounds.minX &&
      x <= bounds.maxX &&
      y >= bounds.minY &&
      y <= bounds.maxY
    );
  }

  private hasImportantProperties(properties: Record<string, unknown>): boolean {
    // Define properties that indicate importance
    const importantKeys = [
      'name',
      'title',
      'id',
      'type',
      'category',
      'class',
      'importance',
      'priority'
    ];

    return importantKeys.some(key => 
      key in properties && 
      properties[key] !== null && 
      properties[key] !== undefined
    );
  }

  private calculateOptimalZoom(bounds: GeoBounds, config?: ViewportConfig): number {
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    
    // Simple logarithmic scale based on the larger dimension
    const size = Math.max(width, height);
    const zoom = Math.floor(Math.log2(1 / size)) + 8;

    return Math.min(zoom, config?.maxZoom || 20);
  }

  private calculateCoverage(selected: Feature[], all: Feature[]): number {
    if (all.length === 0) return 0;
    
    const selectedBounds = this.calculateBounds(selected);
    const allBounds = this.calculateBounds(all);
    
    const selectedArea = this.calculateArea(selectedBounds);
    const totalArea = this.calculateArea(allBounds);
    
    return selectedArea / totalArea;
  }

  private calculateArea(bounds: GeoBounds): number {
    return (bounds.maxX - bounds.minX) * (bounds.maxY - bounds.minY);
  }

  private calculateRepresentativeness(selected: Feature[], all: Feature[]): number {
    if (all.length === 0) return 0;

    // Compare property distributions between selected and all features
    const allProps = this.analyzePropertyDistribution(all);
    const selectedProps = this.analyzePropertyDistribution(selected);

    // Calculate similarity between distributions
    let totalSimilarity = 0;
    let comparedProperties = 0;

    for (const [key, allDist] of Object.entries(allProps)) {
      const selectedDist = selectedProps[key];
      if (!selectedDist) continue;

      totalSimilarity += this.calculateDistributionSimilarity(allDist, selectedDist);
      comparedProperties++;
    }

    return comparedProperties > 0 ? totalSimilarity / comparedProperties : 0;
  }

  private analyzePropertyDistribution(features: Feature[]): Record<string, Map<string, number>> {
    const distributions: Record<string, Map<string, number>> = {};

    features.forEach(feature => {
      if (!feature.properties) return;

      Object.entries(feature.properties).forEach(([key, value]) => {
        if (!distributions[key]) {
          distributions[key] = new Map();
        }

        const valueStr = String(value);
        distributions[key].set(
          valueStr,
          (distributions[key].get(valueStr) || 0) + 1
        );
      });
    });

    return distributions;
  }

  private calculateDistributionSimilarity(
    dist1: Map<string, number>,
    dist2: Map<string, number>
  ): number {
    const allValues = new Set([...dist1.keys(), ...dist2.keys()]);
    let similarity = 0;
    
    allValues.forEach(value => {
      const freq1 = (dist1.get(value) || 0) / dist1.size;
      const freq2 = (dist2.get(value) || 0) / dist2.size;
      similarity += 1 - Math.abs(freq1 - freq2);
    });

    return similarity / allValues.size;
  }
} 