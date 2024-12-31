import { Feature, FeatureCollection, Point, GeoJsonProperties } from 'geojson';
import { FeatureManager } from '../core/feature-manager';
import { cacheManager } from '../core/cache-manager';
import { geoErrorManager } from '../core/error-manager';
import { ErrorSeverity } from '../../../types/errors';
import { COORDINATE_SYSTEMS, CoordinateSystem } from '../types/coordinates';
import { coordinateSystemManager } from '../core/coordinate-system-manager';
import { calculateFeatureBounds, Bounds } from '../core/feature-manager/bounds';
import { GeoFeature, GeoFeatureCollection } from '../../../types/geo';

interface PreviewCollectionResult {
  points: GeoFeatureCollection;
  lines: GeoFeatureCollection;
  polygons: GeoFeatureCollection;
  totalCount: number;
  visibleCount: number;
  bounds: Required<Bounds>;
}

interface SamplingStrategy {
  shouldIncludeFeature(feature: GeoFeature, index: number): boolean;
}

export interface PreviewOptions {
  maxFeatures?: number;
  coordinateSystem?: CoordinateSystem;
  enableCaching?: boolean;
  smartSampling?: boolean;
  analysis?: {
    warnings: string[];
  };
  viewportBounds?: [number, number, number, number];
  initialBounds?: Bounds;
  onProgress?: (progress: number) => void;
  visibleLayers?: string[];
  selectedElement?: string;
}

/**
 * Manages preview generation with streaming and caching support
 */
export class PreviewManager {
  private readonly DEFAULT_MAX_FEATURES = 1000;
  private readonly BOUNDS_PADDING = 0.1; // 10% padding
  private readonly MEMORY_LIMIT_MB = 512; // Increased memory limit for large files

  private featureManager: FeatureManager;
  private options: Required<PreviewOptions>;
  private collectionsCache: Map<string, {
    points: GeoFeature[];
    lines: GeoFeature[];
    polygons: GeoFeature[];
    totalCount: number;
    bounds: Required<Bounds>;
  }> = new Map();

  constructor(options: PreviewOptions = {}) {
    const defaultOptions: Required<PreviewOptions> = {
      maxFeatures: this.DEFAULT_MAX_FEATURES,
      coordinateSystem: COORDINATE_SYSTEMS.WGS84,
      enableCaching: true,
      smartSampling: true,
      analysis: { warnings: [] },
      viewportBounds: [2485000, 1075000, 2834000, 1296000],
      initialBounds: {
        minX: 2485000,
        minY: 1075000,
        maxX: 2834000,
        maxY: 1296000
      },
      onProgress: () => {},
      visibleLayers: [],
      selectedElement: ''
    };

    this.options = {
      ...defaultOptions,
      ...options,
      viewportBounds: options.viewportBounds ?? defaultOptions.viewportBounds,
      initialBounds: options.initialBounds ?? defaultOptions.initialBounds,
      visibleLayers: options.visibleLayers ?? defaultOptions.visibleLayers,
      selectedElement: options.selectedElement ?? defaultOptions.selectedElement
    };

    console.debug('[DEBUG] PreviewManager initialized:', {
      viewportBounds: this.options.viewportBounds,
      initialBounds: this.options.initialBounds,
      coordinateSystem: this.options.coordinateSystem
    });

    this.featureManager = new FeatureManager({
      chunkSize: Math.ceil(this.options.maxFeatures / 10),
      maxMemoryMB: this.MEMORY_LIMIT_MB,
      monitorMemory: true
    });
  }

  private ensureValidBounds(bounds: Bounds | null): Required<Bounds> {
    // First try provided bounds
    if (bounds && 
        isFinite(bounds.minX) && isFinite(bounds.minY) &&
        isFinite(bounds.maxX) && isFinite(bounds.maxY) &&
        bounds.minX !== bounds.maxX && bounds.minY !== bounds.maxY) {
      console.debug('[DEBUG] Using provided bounds:', bounds);
      return bounds as Required<Bounds>;
    }

    // Then try initial bounds
    if (this.options.initialBounds && 
        isFinite(this.options.initialBounds.minX) && isFinite(this.options.initialBounds.minY) &&
        isFinite(this.options.initialBounds.maxX) && isFinite(this.options.initialBounds.maxY) &&
        this.options.initialBounds.minX !== this.options.initialBounds.maxX && 
        this.options.initialBounds.minY !== this.options.initialBounds.maxY) {
      console.debug('[DEBUG] Using initial bounds:', this.options.initialBounds);
      return this.options.initialBounds;
    }

    // Finally try viewport bounds
    if (this.options.viewportBounds && 
        this.options.viewportBounds.length === 4 &&
        this.options.viewportBounds.every(n => isFinite(n)) &&
        this.options.viewportBounds[0] !== this.options.viewportBounds[2] &&
        this.options.viewportBounds[1] !== this.options.viewportBounds[3]) {
      console.debug('[DEBUG] Using viewport bounds:', {
        minX: this.options.viewportBounds[0],
        minY: this.options.viewportBounds[1],
        maxX: this.options.viewportBounds[2],
        maxY: this.options.viewportBounds[3]
      });
      return {
        minX: this.options.viewportBounds[0],
        minY: this.options.viewportBounds[1],
        maxX: this.options.viewportBounds[2],
        maxY: this.options.viewportBounds[3]
      };
    }

    // Use appropriate default bounds based on coordinate system
    if (this.options.coordinateSystem === COORDINATE_SYSTEMS.SWISS_LV95) {
      // Use wider bounds for Swiss LV95 to accommodate more data
      console.debug('[DEBUG] Using expanded Swiss LV95 default bounds');
      return {
        minX: 2400000, // Expanded west
        minY: 1000000, // Expanded south
        maxX: 2900000, // Expanded east
        maxY: 1400000  // Expanded north
      };
    }

    console.debug('[DEBUG] Using WGS84 default bounds');
    return { minX: -180, minY: -85, maxX: 180, maxY: 85 };
  }

  private addPaddingToBounds(bounds: Required<Bounds>): Required<Bounds> {
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    const paddingX = width * this.BOUNDS_PADDING;
    const paddingY = height * this.BOUNDS_PADDING;

    const paddedBounds = {
      minX: bounds.minX - paddingX,
      minY: bounds.minY - paddingY,
      maxX: bounds.maxX + paddingX,
      maxY: bounds.maxY + paddingY
    };

    console.debug('[DEBUG] Added padding to bounds:', {
      original: bounds,
      padded: paddedBounds
    });

    return paddedBounds;
  }

  private getCacheKey(): string {
    return 'all-visible';
  }

  private invalidateCache() {
    console.debug('[DEBUG] Invalidating preview cache');
    this.collectionsCache.clear();
  }

  private createSamplingStrategy(): SamplingStrategy {
    if (!this.options.smartSampling) {
      return {
        shouldIncludeFeature: () => true
      };
    }

    // Enhanced sampling strategy for large files
    const gridSize = Math.ceil(Math.sqrt(this.options.maxFeatures));
    const grid = new Map<string, number>();
    let totalFeatures = 0;

    return {
      shouldIncludeFeature: (feature: GeoFeature) => {
        // Apply progressive sampling based on total features
        if (totalFeatures >= this.options.maxFeatures) {
          return false;
        }

        // Always include non-point features but count them
        if (feature.geometry.type !== 'Point') {
          totalFeatures++;
          return true;
        }

        // Grid-based sampling for points
        const [x, y] = (feature.geometry as Point).coordinates;
        const gridX = Math.floor(x / gridSize);
        const gridY = Math.floor(y / gridSize);
        const key = `${gridX}:${gridY}`;

        const count = grid.get(key) || 0;
        // Dynamically adjust cell limit based on density
        const cellLimit = Math.max(1, Math.floor(this.options.maxFeatures / (gridSize * gridSize)));
        
        if (count >= cellLimit) {
          return false;
        }

        grid.set(key, count + 1);
        totalFeatures++;
        return true;
      }
    };
  }

  /**
   * Get preview collections for the current viewport
   */
  async getPreviewCollections(): Promise<PreviewCollectionResult | null> {
    try {
      const features: GeoFeature[] = [];
      for await (const feature of this.featureManager.getFeatures()) {
        features.push(feature as GeoFeature);
      }

      if (features.length === 0) {
        console.debug('[DEBUG] No valid features available');
        return {
          points: { type: 'FeatureCollection', features: [] },
          lines: { type: 'FeatureCollection', features: [] },
          polygons: { type: 'FeatureCollection', features: [] },
          totalCount: 0,
          visibleCount: 0,
          bounds: this.ensureValidBounds(null)
        };
      }

      console.debug('[DEBUG] Processing features:', {
        total: features.length,
        types: features.map(f => f.geometry?.type || 'unknown')
      });

      // Split features by geometry type
      const points: GeoFeature[] = [];
      const lines: GeoFeature[] = [];
      const polygons: GeoFeature[] = [];

      features.forEach(feature => {
        if (!feature?.geometry?.type) {
          console.debug('[DEBUG] Invalid feature:', feature);
          return;
        }

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
          default:
            console.debug('[DEBUG] Unknown geometry type:', feature.geometry.type);
        }
      });

      const bounds = this.ensureValidBounds(calculateFeatureBounds(features));

      console.debug('[DEBUG] Feature collections:', {
        points: points.length,
        lines: lines.length,
        polygons: polygons.length,
        bounds
      });

      const result: PreviewCollectionResult = {
        points: { type: 'FeatureCollection', features: points },
        lines: { type: 'FeatureCollection', features: lines },
        polygons: { type: 'FeatureCollection', features: polygons },
        totalCount: features.length,
        visibleCount: points.length + lines.length + polygons.length,
        bounds
      };

      return result;
    } catch (error) {
      console.error('Failed to get preview collections:', error);
      return null;
    }
  }

  /**
   * Update preview options
   */
  public setOptions(options: Partial<PreviewOptions>): void {
    console.debug('[DEBUG] Updating preview options:', {
      current: this.options,
      updates: options
    });

    this.options = {
      ...this.options,
      ...options
    };

    // Invalidate cache for any option change
    this.invalidateCache();

    console.debug('[DEBUG] Preview options updated:', {
      viewportBounds: this.options.viewportBounds
    });
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
  public async setFeatures(features: Feature[] | FeatureCollection): Promise<void> {
    console.debug('[DEBUG] Setting features:', {
      type: Array.isArray(features) ? 'array' : 'collection',
      count: Array.isArray(features) ? features.length : features.features.length
    });

    // Clear existing features
    this.featureManager.clear();

    // Convert features to GeoFeatures
    const featureArray = Array.isArray(features) ? features : features.features;
    const geoFeatures: GeoFeature[] = featureArray.map(feature => ({
      ...feature,
      properties: {
        ...feature.properties,
        layer: feature.properties?.layer || '0',
        type: feature.properties?.type || feature.geometry.type
      }
    }));

    // Add new features
    await this.featureManager.addFeatures(geoFeatures);
    
    // Invalidate cache after adding features
    this.invalidateCache();
  }

  /**
   * Get features by type and layer
   */
  public async getFeaturesByTypeAndLayer(type: string, layer: string): Promise<GeoFeature[]> {
    const features: GeoFeature[] = [];
    for await (const feature of this.featureManager.getFeatures()) {
      const geoFeature = feature as GeoFeature;
      if (
        geoFeature.geometry.type === type &&
        geoFeature.properties?.layer === layer
      ) {
        features.push(geoFeature);
      }
    }
    return features;
  }

  /**
   * Check if there are any visible features
   */
  public async hasVisibleFeatures(): Promise<boolean> {
    const collections = await this.getPreviewCollections();
    return collections !== null && collections.visibleCount > 0;
  }
}

/**
 * Create a new preview manager instance
 */
export const createPreviewManager = (options: PreviewOptions = {}) => {
  return new PreviewManager(options);
};
