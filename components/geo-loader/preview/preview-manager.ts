
import { Feature, FeatureCollection, Point, GeoJsonProperties } from 'geojson';
import { FeatureManager } from '../core/feature-manager';
import { cacheManager } from '../core/cache-manager';
import { geoErrorManager } from '../core/error-manager';
import { ErrorSeverity } from '../../../types/errors';
import { COORDINATE_SYSTEMS, CoordinateSystem } from '../types/coordinates';
import { coordinateSystemManager } from '../core/coordinate-system-manager';
import { calculateFeatureBounds, Bounds } from '../utils/geometry-utils';
import { GeoFeature } from '../../../types/geo';


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
  shouldIncludeFeature(feature: Feature<any, { [key: string]: any; layer?: string; type?: string }>, index: number): boolean;
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

  private ensureValidBounds(bounds: Bounds | null): Required<Bounds> {
    // Check if bounds are valid
    if (!bounds || 
        !isFinite(bounds.minX) || !isFinite(bounds.minY) ||
        !isFinite(bounds.maxX) || !isFinite(bounds.maxY)) {
      // Return default bounds centered around 0,0 with some extent
      return { minX: -1, minY: -1, maxX: 1, maxY: 1 };
    }
    return bounds;
  }

  private addPaddingToBounds(bounds: Required<Bounds>): Required<Bounds> {
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    const paddingX = width * this.BOUNDS_PADDING;
    const paddingY = height * this.BOUNDS_PADDING;

    return {
      minX: bounds.minX - paddingX,
      minY: bounds.minY - paddingY,
      maxX: bounds.maxX + paddingX,
      maxY: bounds.maxY + paddingY
    };
  }

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
    stream: AsyncGenerator<Feature<any, { [key: string]: any; layer?: string; type?: string }>>,
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
    let bounds: Bounds | null = null;

    try {
      for await (const feature of stream) {
        featureCount++;

        // Track layers
        const layer = feature.properties?.layer || '';
        layers.add(layer);

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
        const featureBounds = calculateFeatureBounds(feature);
        if (featureBounds) {
          if (!bounds) {
            bounds = featureBounds;
          } else {
            bounds = {
              minX: Math.min(bounds.minX, featureBounds.minX),
              minY: Math.min(bounds.minY, featureBounds.minY),
              maxX: Math.max(bounds.maxX, featureBounds.maxX),
              maxY: Math.max(bounds.maxY, featureBounds.maxY)
            };
          }
        }

        // Ensure feature has valid properties object
        const geoFeature: GeoFeature = {
          type: 'Feature',
          geometry: feature.geometry,
          properties: {
            ...feature.properties,
            layer: feature.properties?.layer || '',
            type: feature.properties?.type || feature.geometry.type
          }
        };

        // Store feature
        await this.featureManager.addFeature(geoFeature);
        previewCount++;

        // Check preview size limit
        if (previewCount >= this.options.maxFeatures) {
          break;
        }
      }

      // Ensure bounds are valid and add padding
      const validBounds = this.ensureValidBounds(bounds);
      const paddedBounds = this.addPaddingToBounds(validBounds);

      const result: PreviewResult = {
        features: {
          type: 'FeatureCollection',
          features: []
        },
        bounds: paddedBounds,
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

    try {
      const transformedFeatures: Feature[] = [];
      let bounds: Bounds | null = null;

      for (const feature of preview.features.features) {
        let transformedFeature: GeoFeature;

        // Transform all geometry types, not just points
        if (feature.geometry && 'coordinates' in feature.geometry) {
          // Deep clone the geometry to avoid modifying the original
          const transformedGeometry = JSON.parse(JSON.stringify(feature.geometry));
          
          // Recursively transform coordinates
          const transformCoordinates = async (coords: any): Promise<any> => {
            if (Array.isArray(coords)) {
              if (coords.length === 2 && typeof coords[0] === 'number') {
                // This is a coordinate pair
                const transformed = await coordinateSystemManager.transform(
                  { x: coords[0], y: coords[1] },
                  preview.coordinateSystem,
                  targetSystem
                );
                return [transformed.x, transformed.y];
              }
              // This is an array of coordinates or arrays
              return Promise.all(coords.map(transformCoordinates));
            }
            return coords;
          };

          transformedGeometry.coordinates = await transformCoordinates(transformedGeometry.coordinates);

          transformedFeature = {
            type: 'Feature',
            geometry: transformedGeometry,
            properties: {
              ...feature.properties,
              layer: feature.properties?.layer || '',
              type: feature.properties?.type || feature.geometry.type
            }
          };
        } else {
          transformedFeature = {
            type: 'Feature',
            geometry: feature.geometry,
            properties: {
              ...feature.properties,
              layer: feature.properties?.layer || '',
              type: feature.properties?.type || feature.geometry.type
            }
          };
        }

        transformedFeatures.push(transformedFeature);

        // Update bounds
        const featureBounds = calculateFeatureBounds(transformedFeature);
        if (featureBounds) {
          if (!bounds) {
            bounds = featureBounds;
          } else {
            bounds = {
              minX: Math.min(bounds.minX, featureBounds.minX),
              minY: Math.min(bounds.minY, featureBounds.minY),
              maxX: Math.max(bounds.maxX, featureBounds.maxX),
              maxY: Math.max(bounds.maxY, featureBounds.maxY)
            };
          }
        }
      }

      // Log transformation results
      console.debug('Preview transformation complete:', {
        fromSystem: preview.coordinateSystem,
        toSystem: targetSystem,
        featureCount: transformedFeatures.length,
        bounds
      });

      // Ensure bounds are valid and add padding
      const validBounds = this.ensureValidBounds(bounds);
      const paddedBounds = this.addPaddingToBounds(validBounds);

      return {
        ...preview,
        features: {
          type: 'FeatureCollection',
          features: transformedFeatures
        },
        bounds: paddedBounds,
        coordinateSystem: targetSystem
      };
    } catch (error) {
      console.error('Preview transformation failed:', error);
      throw new Error(`Failed to transform preview: ${error instanceof Error ? error.message : String(error)}`);
    }
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
      const geoFeature: GeoFeature = {
        type: 'Feature',
        geometry: feature.geometry,
        properties: {
          ...feature.properties,
          layer: feature.properties?.layer || '',
          type: feature.properties?.type || feature.geometry.type
        }
      };
      this.featureManager.addFeature(geoFeature);
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
