import { Feature, FeatureCollection, Point } from 'geojson';
import { FeatureManager } from '../core/feature-manager';
import { cacheManager } from '../core/cache-manager';
import { geoErrorManager } from '../core/error-manager';
import { ErrorSeverity } from '../../../types/errors';
import { COORDINATE_SYSTEMS, CoordinateSystem } from '../types/coordinates';
import { coordinateSystemManager } from '../core/coordinate-system-manager';

export interface PreviewOptions {
  /** Maximum number of features to include in preview */
  maxFeatures?: number;
  /** Visible layers to include */
  visibleLayers?: string[];
  /** Selected element type and layer */
  selectedElement?: {
    type: string;
    layer: string;
  } | null;
  /** Target coordinate system */
  coordinateSystem?: CoordinateSystem;
  /** Whether to enable caching */
  enableCaching?: boolean;
  /** Whether to use smart sampling */
  smartSampling?: boolean;
  /** Analysis results including warnings */
  analysis?: {
    warnings: Array<{ type: string; message: string; }>;
  };
}

export interface PreviewResult {
  features: FeatureCollection;
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  layers: string[];
  featureCount: number;
  coordinateSystem: CoordinateSystem;
}

interface SamplingStrategy {
  shouldIncludeFeature(feature: Feature, index: number): boolean;
}

/**
 * Manages preview generation with streaming and caching support
 */
export const createPreviewManager = (options: PreviewOptions = {}) => {
  return new PreviewManager(options);
};

export class PreviewManager {
  private readonly DEFAULT_MAX_FEATURES = 1000;
  private readonly BOUNDS_PADDING = 0.1; // 10% padding
  private featureManager: FeatureManager;
  private options: Required<PreviewOptions>;

  constructor(options: PreviewOptions = {}) {
    this.options = {
      maxFeatures: options.maxFeatures || this.DEFAULT_MAX_FEATURES,
      visibleLayers: options.visibleLayers || [],
      selectedElement: options.selectedElement || null,
      coordinateSystem: options.coordinateSystem || COORDINATE_SYSTEMS.WGS84,
      enableCaching: options.enableCaching ?? true,
      smartSampling: options.smartSampling ?? true,
      analysis: options.analysis || { warnings: [] }
    };

    this.featureManager = new FeatureManager({
      chunkSize: Math.ceil(this.options.maxFeatures / 10), // Split into ~10 chunks
      maxMemoryMB: 256 // Lower memory limit for preview
    });
  }

  /**
   * Generate preview from feature stream
   */
  public async generatePreview(
    stream: AsyncGenerator<Feature>,
    fileId: string
  ): Promise<PreviewResult> {
    // Check cache first
    if (this.options.enableCaching) {
      const cached = cacheManager.getCachedPreview(fileId, this.options);
      if (cached) {
        return cached;
      }
    }

    const samplingStrategy = this.createSamplingStrategy();
    const layers = new Set<string>();
    let featureCount = 0;
    let previewCount = 0;
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    try {
      for await (const feature of stream) {
        featureCount++;

        // Track layers
        const layer = feature.properties?.layer;
        if (layer) layers.add(layer);

        // Apply sampling strategy
        if (!samplingStrategy.shouldIncludeFeature(feature, featureCount)) {
          continue;
        }

        // Apply layer filtering
        if (this.options.visibleLayers.length > 0 && 
            !this.options.visibleLayers.includes(layer)) {
          continue;
        }

        // Update bounds
        if (feature.geometry.type === 'Point') {
          const [x, y] = feature.geometry.coordinates;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }

        // Store feature
        await this.featureManager.addFeature(feature);
        previewCount++;

        // Check preview size limit
        if (previewCount >= this.options.maxFeatures) {
          break;
        }
      }

      // Add padding to bounds
      const width = maxX - minX;
      const height = maxY - minY;
      const paddingX = width * this.BOUNDS_PADDING;
      const paddingY = height * this.BOUNDS_PADDING;

      const result: PreviewResult = {
        features: {
          type: 'FeatureCollection',
          features: []
        },
        bounds: {
          minX: minX - paddingX,
          minY: minY - paddingY,
          maxX: maxX + paddingX,
          maxY: maxY + paddingY
        },
        layers: Array.from(layers),
        featureCount,
        coordinateSystem: this.options.coordinateSystem
      };

      // Collect features from manager
      const features: Feature[] = [];
      for await (const feature of this.featureManager.getFeatures()) {
        features.push(feature);
      }
      result.features.features = features;

      // Cache result
      if (this.options.enableCaching) {
        cacheManager.cachePreview(fileId, this.options, result);
      }

      return result;

    } catch (error) {
      geoErrorManager.addError(
        'preview_manager',
        'PREVIEW_GENERATION_ERROR',
        `Failed to generate preview: ${error instanceof Error ? error.message : String(error)}`,
        ErrorSeverity.ERROR,
        {
          fileId,
          options: this.options,
          error: error instanceof Error ? error.message : String(error)
        }
      );
      throw error;
    } finally {
      // Clean up
      this.featureManager.clear();
    }
  }

  private createSamplingStrategy(): SamplingStrategy {
    if (!this.options.smartSampling) {
      // Simple sequential sampling
      return {
        shouldIncludeFeature: () => true
      };
    }

    // Smart sampling based on feature density
    const gridSize = Math.ceil(Math.sqrt(this.options.maxFeatures));
    const grid = new Map<string, number>();

    return {
      shouldIncludeFeature: (feature: Feature) => {
        if (feature.geometry.type !== 'Point') {
          return true;
        }

        const [x, y] = (feature.geometry as Point).coordinates;
        const gridX = Math.floor(x / gridSize);
        const gridY = Math.floor(y / gridSize);
        const key = `${gridX}:${gridY}`;

        const count = grid.get(key) || 0;
        if (count >= 3) { // Max 3 features per grid cell
          return false;
        }

        grid.set(key, count + 1);
        return true;
      }
    };
  }

  /**
   * Transform preview to target coordinate system
   */
  public async transformPreview(
    preview: PreviewResult,
    targetSystem: CoordinateSystem
  ): Promise<PreviewResult> {
    if (preview.coordinateSystem === targetSystem) {
      return preview;
    }

    if (!coordinateSystemManager.isInitialized()) {
      await coordinateSystemManager.initialize();
    }

    const transformedFeatures: Feature[] = [];
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const feature of preview.features.features) {
      if (feature.geometry.type === 'Point') {
        const [x, y] = feature.geometry.coordinates;
        const transformed = await coordinateSystemManager.transform(
          { x, y },
          preview.coordinateSystem,
          targetSystem
        );

        transformedFeatures.push({
          ...feature,
          geometry: {
            ...feature.geometry,
            coordinates: [transformed.x, transformed.y]
          }
        });

        minX = Math.min(minX, transformed.x);
        minY = Math.min(minY, transformed.y);
        maxX = Math.max(maxX, transformed.x);
        maxY = Math.max(maxY, transformed.y);
      } else {
        transformedFeatures.push(feature);
      }
    }

    // Add padding to bounds
    const width = maxX - minX;
    const height = maxY - minY;
    const paddingX = width * this.BOUNDS_PADDING;
    const paddingY = height * this.BOUNDS_PADDING;

    return {
      ...preview,
      features: {
        type: 'FeatureCollection',
        features: transformedFeatures
      },
      bounds: {
        minX: minX - paddingX,
        minY: minY - paddingY,
        maxX: maxX + paddingX,
        maxY: maxY + paddingY
      },
      coordinateSystem: targetSystem
    };
  }

  /**
   * Update preview options
   */
  public setOptions(options: Partial<PreviewOptions>): void {
    this.options = {
      ...this.options,
      ...options
    };
  }

  /**
   * Get current preview options
   */
  public getOptions(): Required<PreviewOptions> {
    return { ...this.options };
  }

  /**
   * Set features directly for preview
   */
  public setFeatures(features: Feature[] | FeatureCollection) {
    this.featureManager.clear();
    
    const featureArray = Array.isArray(features) 
      ? features 
      : features.features;

    for (const feature of featureArray) {
      this.featureManager.addFeature(feature);
    }
  }

  /**
   * Get features by type and layer
   */
  public async getFeaturesByTypeAndLayer(type: string, layer: string): Promise<Feature[]> {
    const features: Feature[] = [];
    for await (const feature of this.featureManager.getFeatures()) {
      if (
        feature.geometry.type === type &&
        feature.properties?.layer === layer
      ) {
        features.push(feature);
      }
    }
    return features;
  }

  /**
   * Get preview collections separated by geometry type
   */
  public async getPreviewCollections() {
    const points: Feature[] = [];
    const lines: Feature[] = [];
    const polygons: Feature[] = [];
    let totalCount = 0;

    for await (const feature of this.featureManager.getFeatures()) {
      totalCount++;
      switch (feature.geometry.type) {
        case 'Point':
          points.push(feature);
          break;
        case 'LineString':
        case 'MultiLineString':
          lines.push(feature);
          break;
        case 'Polygon':
        case 'MultiPolygon':
          polygons.push(feature);
          break;
      }
    }

    return {
      points: {
        type: 'FeatureCollection' as const,
        features: points
      },
      lines: {
        type: 'FeatureCollection' as const,
        features: lines
      },
      polygons: {
        type: 'FeatureCollection' as const,
        features: polygons
      },
      totalCount,
      visibleCount: points.length + lines.length + polygons.length
    };
  }

  /**
   * Check if there are any visible features
   */
  public async hasVisibleFeatures(): Promise<boolean> {
    const collections = await this.getPreviewCollections();
    return collections.visibleCount > 0;
  }
}
