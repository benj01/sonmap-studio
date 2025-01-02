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
  private readonly MEMORY_LIMIT_MB = 512; 
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  private featureManager: FeatureManager;
  private options: Required<PreviewOptions>;
  private collectionsCache: Map<string, {
    points: GeoFeature[];
    lines: GeoFeature[];
    polygons: GeoFeature[];
    totalCount: number;
    bounds: Required<Bounds>;
    coordinateSystem: CoordinateSystem;
    timestamp: number;
  }> = new Map();

  constructor(options: PreviewOptions = {}) {
    const defaultOptions: Required<PreviewOptions> = {
      maxFeatures: this.DEFAULT_MAX_FEATURES,
      coordinateSystem: COORDINATE_SYSTEMS.WGS84,
      enableCaching: true,
      smartSampling: true,
      analysis: { warnings: [] },
      viewportBounds: null as unknown as [number, number, number, number],
      initialBounds: null as unknown as Required<Bounds>,
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

    // Validate coordinate system on initialization
    this.validateCoordinateSystem();
  }

  /**
   * Validate coordinate system configuration
   */
  private validateCoordinateSystem(): void {
    if (!coordinateSystemManager.isInitialized()) {
      console.warn('[DEBUG] Coordinate system manager not initialized');
      return;
    }

    const system = this.options.coordinateSystem;
    const supported = coordinateSystemManager.getSupportedSystems().includes(system);
    
    console.debug('[DEBUG] Validating coordinate system:', {
      system,
      supported,
      available: coordinateSystemManager.getSupportedSystems()
    });

    if (!supported) {
      console.warn(`[DEBUG] Unsupported coordinate system: ${system}, falling back to WGS84`);
      this.options.coordinateSystem = COORDINATE_SYSTEMS.WGS84;
      this.invalidateCache('unsupported coordinate system');
    }
  }

  /**
   * Get cache key for coordinate system
   */
  private getCacheKey(coordinateSystem: CoordinateSystem): string {
    return `preview:${coordinateSystem}:all-visible`;
  }

  /**
   * Invalidate cache with reason
   */
  private invalidateCache(reason?: string): void {
    console.debug('[DEBUG] Invalidating preview cache:', { reason });
    this.collectionsCache.clear();
  }

  /**
   * Get default bounds for current coordinate system
   */
  private getDefaultBounds(): Required<Bounds> {
    if (this.options.coordinateSystem === COORDINATE_SYSTEMS.SWISS_LV95) {
      // Changed these to match coordinate-system-manager (EPSG:2056)
      console.debug('[DEBUG] Using Swiss LV95 default bounds');
      return {
        minX: 2485000, // Western boundary
        minY: 1075000, // Southern boundary
        maxX: 2835000, // Eastern boundary (updated from 2834000)
        maxY: 1295000  // Northern boundary (updated from 1296000)
      };
    }

    // WGS84 bounds covering Switzerland
    console.debug('[DEBUG] Using WGS84 default bounds');
    return {
      minX: 5.9,  
      minY: 45.8,
      maxX: 10.5,
      maxY: 47.8
    };
  }

  /**
   * Ensure valid bounds are available
   */
  private async ensureValidBounds(bounds: Bounds | null): Promise<Required<Bounds>> {
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
      return this.options.initialBounds as Required<Bounds>;
    }

    // Then try viewport bounds
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

    // Calculate bounds from features if available
    const features: GeoFeature[] = [];
    try {
      for await (const feature of this.featureManager.getFeatures()) {
        features.push(feature);
      }
      if (features.length > 0) {
        const featureBounds = calculateFeatureBounds(features);
        if (featureBounds) {
          console.debug('[DEBUG] Using bounds from features:', featureBounds);
          return featureBounds as Required<Bounds>;
        }
      }
    } catch (error) {
      console.warn('[DEBUG] Failed to calculate bounds from features:', error);
    }

    // Use default bounds as last resort
    return this.getDefaultBounds();
  }

  /**
   * Clean expired cache entries
   */
  private cleanExpiredCache(): void {
    const now = Date.now();
    for (const [key, value] of this.collectionsCache.entries()) {
      if (now - value.timestamp > this.CACHE_TTL) {
        console.debug('[DEBUG] Removing expired cache entry:', key);
        this.collectionsCache.delete(key);
      }
    }
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
    // Validate coordinate system configuration
    this.validateCoordinateSystem();
    
    // Clean expired cache entries
    this.cleanExpiredCache();

    try {
      const features: GeoFeature[] = [];
      for await (const feature of this.featureManager.getFeatures()) {
        features.push(feature as GeoFeature);
      }

      if (features.length === 0) {
        console.debug('[DEBUG] No valid features available');
        const defaultBounds = this.getDefaultBounds();
        return {
          points: { type: 'FeatureCollection', features: [] },
          lines: { type: 'FeatureCollection', features: [] },
          polygons: { type: 'FeatureCollection', features: [] },
          totalCount: 0,
          visibleCount: 0,
          bounds: defaultBounds
        };
      }

      console.debug('[DEBUG] Processing features:', {
        total: features.length,
        types: features.map(f => f.geometry?.type || 'unknown'),
        coordinateSystem: this.options.coordinateSystem
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

      // Calculate bounds from features first
      const featureBounds = calculateFeatureBounds(features);
      const bounds = await this.ensureValidBounds(featureBounds);

      console.debug('[DEBUG] Feature collections:', {
        points: points.length,
        lines: lines.length,
        polygons: polygons.length,
        bounds,
        coordinateSystem: this.options.coordinateSystem
      });

      const result: PreviewCollectionResult = {
        points: { type: 'FeatureCollection', features: points },
        lines: { type: 'FeatureCollection', features: lines },
        polygons: { type: 'FeatureCollection', features: polygons },
        totalCount: features.length,
        visibleCount: points.length + lines.length + polygons.length,
        bounds
      };

      // Cache the result with coordinate system info
      const cacheKey = this.getCacheKey(this.options.coordinateSystem);
      this.collectionsCache.set(cacheKey, {
        points,
        lines,
        polygons,
        totalCount: features.length,
        bounds,
        coordinateSystem: this.options.coordinateSystem,
        timestamp: Date.now()
      });

      return result;
    } catch (error) {
      console.error('Failed to get preview collections:', error);
      return null;
    }
  }

  /**
   * Update preview options with coordinate system validation
   */
  public setOptions(options: Partial<PreviewOptions>): void {
    console.debug('[DEBUG] Updating preview options:', {
      current: this.options,
      updates: options
    });

    const oldSystem = this.options.coordinateSystem;
    this.options = {
      ...this.options,
      ...options
    };

    // If coordinate system changed, validate and potentially invalidate cache
    if (options.coordinateSystem && options.coordinateSystem !== oldSystem) {
      this.validateCoordinateSystem();
    } else {
      // Invalidate cache for other changes
      this.invalidateCache('options updated');
    }

    console.debug('[DEBUG] Preview options updated:', {
      viewportBounds: this.options.viewportBounds,
      coordinateSystem: this.options.coordinateSystem
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
    // Validate coordinate system before processing features
    this.validateCoordinateSystem();

    console.debug('[DEBUG] Setting features:', {
      type: Array.isArray(features) ? 'array' : 'collection',
      count: Array.isArray(features) ? features.length : features.features.length,
      coordinateSystem: this.options.coordinateSystem
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
    this.invalidateCache('new features added');
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
