import { Feature, FeatureCollection, Point, GeoJsonProperties } from 'geojson';
import { FeatureManager } from '../core/feature-manager';
import { cacheManager } from '../core/cache-manager';
import { geoErrorManager } from '../core/error-manager';
import { ErrorSeverity } from '../../../types/errors';
import { COORDINATE_SYSTEMS, CoordinateSystem } from '../types/coordinates';
import { coordinateSystemManager } from '../core/coordinate-system-manager';
import { calculateFeatureBounds, Bounds } from '../core/feature-manager/bounds';
import { GeoFeature } from '../../../types/geo';
import { PreviewOptions, PreviewResult } from '../types/map';

interface PreviewCollectionResult {
  points: FeatureCollection;
  lines: FeatureCollection;
  polygons: FeatureCollection;
  totalCount: number;
  visibleCount: number;
  bounds: Required<Bounds>;
}

interface SamplingStrategy {
  shouldIncludeFeature(feature: Feature<any, { [key: string]: any; layer?: string; type?: string }>, index: number): boolean;
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
    points: Feature[];
    lines: Feature[];
    polygons: Feature[];
    totalCount: number;
    visibleCount: number;
    bounds: Required<Bounds>;
  }> = new Map();

  constructor(options: PreviewOptions = {}) {
    const defaultOptions: Required<PreviewOptions> = {
      maxFeatures: this.DEFAULT_MAX_FEATURES,
      visibleLayers: [],
      selectedElement: null,
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
      onProgress: () => {}
    };

    this.options = {
      ...defaultOptions,
      ...options,
      // Ensure we don't override with undefined values
      viewportBounds: options.viewportBounds ?? defaultOptions.viewportBounds,
      initialBounds: options.initialBounds ?? defaultOptions.initialBounds
    };

    // Log initial state
    console.debug('[DEBUG] PreviewManager initialized:', {
      visibleLayers: this.options.visibleLayers,
      allLayersVisible: this.options.visibleLayers.length === 0,
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
    console.debug('[DEBUG] Validating bounds:', {
      inputBounds: bounds,
      initialBounds: this.options.initialBounds,
      viewportBounds: this.options.viewportBounds,
      coordinateSystem: this.options.coordinateSystem
    });

    // First try to use provided bounds
    if (bounds && 
        isFinite(bounds.minX) && isFinite(bounds.minY) &&
        isFinite(bounds.maxX) && isFinite(bounds.maxY) &&
        bounds.minX !== bounds.maxX && bounds.minY !== bounds.maxY) {
      console.debug('[DEBUG] Using provided bounds');
      return bounds as Required<Bounds>;
    }

    // Then try initial bounds
    if (this.options.initialBounds && 
        isFinite(this.options.initialBounds.minX) && isFinite(this.options.initialBounds.minY) &&
        isFinite(this.options.initialBounds.maxX) && isFinite(this.options.initialBounds.maxY) &&
        this.options.initialBounds.minX !== this.options.initialBounds.maxX && 
        this.options.initialBounds.minY !== this.options.initialBounds.maxY) {
      console.debug('[DEBUG] Using initial bounds');
      return this.options.initialBounds;
    }

    // Finally try viewport bounds
    if (this.options.viewportBounds && 
        this.options.viewportBounds.length === 4 &&
        this.options.viewportBounds.every(n => isFinite(n)) &&
        this.options.viewportBounds[0] !== this.options.viewportBounds[2] &&
        this.options.viewportBounds[1] !== this.options.viewportBounds[3]) {
      console.debug('[DEBUG] Using viewport bounds');
      return {
        minX: this.options.viewportBounds[0],
        minY: this.options.viewportBounds[1],
        maxX: this.options.viewportBounds[2],
        maxY: this.options.viewportBounds[3]
      };
    }

    // Use appropriate default bounds based on coordinate system
    if (this.options.coordinateSystem === COORDINATE_SYSTEMS.SWISS_LV95) {
      console.debug('[DEBUG] Using Swiss LV95 default bounds');
      return {
        minX: 2485000,
        minY: 1075000,
        maxX: 2834000,
        maxY: 1296000
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
    // Special key for "all layers visible" state
    if (this.options.visibleLayers.length === 0) {
      return 'all-visible';
    }
    return `visible:${this.options.visibleLayers.sort().join(',')}`;
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
      shouldIncludeFeature: (feature: Feature) => {
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
   * Get preview collections separated by geometry type
   */
  public async getPreviewCollections(): Promise<PreviewCollectionResult> {
    console.debug('[DEBUG] Starting getPreviewCollections');
    const cacheKey = this.getCacheKey();
    const cached = this.collectionsCache.get(cacheKey);
    
    if (cached) {
      console.debug('[DEBUG] Using cached collections');
      console.debug('[DEBUG] Using cached preview collections:', {
        cacheKey,
        points: cached.points.length,
        lines: cached.lines.length,
        polygons: cached.polygons.length,
        totalCount: cached.totalCount,
        visibleCount: cached.visibleCount
      });
      return {
        points: {
          type: 'FeatureCollection' as const,
          features: cached.points
        },
        lines: {
          type: 'FeatureCollection' as const,
          features: cached.lines
        },
        polygons: {
          type: 'FeatureCollection' as const,
          features: cached.polygons
        },
        totalCount: cached.totalCount,
        visibleCount: cached.visibleCount,
        bounds: cached.bounds
      };
    }

    // Calculate collections
    const points: Feature[] = [];
    const lines: Feature[] = [];
    const polygons: Feature[] = [];
    let totalCount = 0;
    let visibleCount = 0;
    let bounds: Bounds | null = null;

    for await (const feature of this.featureManager.getFeatures()) {
      totalCount++;
      
      // Apply layer visibility filtering
      const layer = feature.properties?.layer || '';
      const isVisible = this.options.visibleLayers.length === 0 || 
                       this.options.visibleLayers.includes(layer);
      
      if (!isVisible) {
        continue;
      }

      visibleCount++;
      console.debug('[DEBUG] Processing visible feature:', {
        geometryType: feature.geometry.type,
        layer,
        isVisible,
        visibleLayers: this.options.visibleLayers,
        coordinates: 'coordinates' in feature.geometry ? feature.geometry.coordinates : undefined,
        properties: feature.properties
      });

      // Convert to GeoFeature to ensure proper typing
      const geoFeature: GeoFeature = {
        type: 'Feature',
        geometry: feature.geometry,
        properties: {
          ...feature.properties,
          layer: feature.properties?.layer || '',
          type: feature.properties?.type || feature.geometry.type
        }
      };

      switch (feature.geometry.type) {
        case 'Point':
          points.push(geoFeature);
          break;
        case 'LineString':
        case 'MultiLineString':
          lines.push(geoFeature);
          break;
        case 'Polygon':
        case 'MultiPolygon':
          polygons.push(geoFeature);
          break;
        default:
          console.warn('[DEBUG] Unknown geometry type:', feature.geometry.type);
      }

      // Update bounds from feature
      const featureBounds = calculateFeatureBounds(geoFeature);
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

    console.debug('[DEBUG] Preview collections generated:', {
      points: points.length,
      lines: lines.length,
      polygons: polygons.length,
      totalCount,
      visibleCount,
      bounds,
      lineFeatures: lines.map(f => ({
        coordinates: 'coordinates' in f.geometry ? f.geometry.coordinates : undefined,
        properties: f.properties
      }))
    });

    // Ensure bounds are valid and add padding
    const validBounds = this.ensureValidBounds(bounds);
    const paddedBounds = this.addPaddingToBounds(validBounds);

    // Cache the results
    this.collectionsCache.set(cacheKey, {
      points,
      lines,
      polygons,
      totalCount,
      visibleCount: points.length + lines.length + polygons.length,
      bounds: paddedBounds
    });

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
      visibleCount: points.length + lines.length + polygons.length,
      bounds: paddedBounds
    };
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
      visibleLayers: this.options.visibleLayers,
      allLayersVisible: this.options.visibleLayers.length === 0,
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
  public async setFeatures(features: Feature[] | FeatureCollection) {
    console.debug('[DEBUG] Setting preview features');
    
    this.featureManager.clear();
    this.invalidateCache();
    
    const featureArray = Array.isArray(features) 
      ? features 
      : features.features;

    try {
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
        await this.featureManager.addFeature(geoFeature);
      }

      console.debug('[DEBUG] Features set successfully:', {
        count: featureArray.length,
        visibleLayers: this.options.visibleLayers,
        allLayersVisible: this.options.visibleLayers.length === 0
      });
    } catch (error) {
      console.error('[DEBUG] Error adding features:', error);
      // Clear any partially added features
      this.featureManager.clear();
      throw error;
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
   * Check if there are any visible features
   */
  public async hasVisibleFeatures(): Promise<boolean> {
    const collections = await this.getPreviewCollections();
    return collections.visibleCount > 0;
  }
}

/**
 * Create a new preview manager instance
 */
export const createPreviewManager = (options: PreviewOptions = {}) => {
  return new PreviewManager(options);
};
