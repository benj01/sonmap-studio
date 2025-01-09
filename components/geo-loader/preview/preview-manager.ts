import { Feature, FeatureCollection, Point, GeoJsonProperties } from 'geojson';
import { FeatureManager } from '../core/feature-manager';
import { cacheManager } from '../core/cache-manager';
import { geoErrorManager } from '../core/error-manager';
import { ErrorSeverity } from '../../../types/errors';
import { COORDINATE_SYSTEMS, CoordinateSystem } from '../types/coordinates';
import { coordinateSystemManager } from '../core/coordinate-systems/coordinate-system-manager';
import { calculateFeatureBounds, Bounds } from '../core/feature-manager/bounds';
import { GeoFeature, GeoFeatureCollection } from '../../../types/geo';

interface PreviewCollections {
  points: GeoFeatureCollection;
  lines: GeoFeatureCollection;
  polygons: GeoFeatureCollection;
}

interface PreviewCollectionResult extends PreviewCollections {
  totalCount: number;
  bounds: Required<Bounds>;
  coordinateSystem: CoordinateSystem;
  timestamp: number;
}

interface SamplingStrategy {
  shouldIncludeFeature(feature: GeoFeature, index: number): boolean;
}

export interface PreviewOptions {
  maxFeatures?: number;
  coordinateSystem?: CoordinateSystem;
  visibleLayers?: string[];
  viewportBounds?: [number, number, number, number];
  enableCaching?: boolean;
  smartSampling?: boolean;
  analysis?: {
    warnings: string[];
  };
  initialBounds?: Bounds;
  onProgress?: (progress: number) => void;
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
  private readonly STREAM_THRESHOLD = 10000; // Number of features that triggers streaming mode

  private featureManager: FeatureManager;
  private options: Required<PreviewOptions>;
  private collectionsCache: Map<string, PreviewCollectionResult> = new Map();

  constructor(options: PreviewOptions = {}) {
    console.debug('[PreviewManager] Initializing with options:', {
      maxFeatures: options.maxFeatures,
      coordinateSystem: options.coordinateSystem,
      enableCaching: options.enableCaching,
      smartSampling: options.smartSampling,
      viewportBounds: options.viewportBounds,
      initialBounds: options.initialBounds,
      visibleLayers: options.visibleLayers
    });

    const defaultOptions: Required<PreviewOptions> = {
      maxFeatures: this.DEFAULT_MAX_FEATURES,
      coordinateSystem: COORDINATE_SYSTEMS.WGS84,
      visibleLayers: [],
      viewportBounds: [-180, -90, 180, 90],
      enableCaching: true,
      smartSampling: true,
      analysis: { warnings: [] },
      initialBounds: null as unknown as Required<Bounds>,
      onProgress: () => {},
      selectedElement: ''
    };

    const visibleLayers = Array.isArray(options.visibleLayers)
      ? options.visibleLayers
      : defaultOptions.visibleLayers;

    this.options = {
      ...defaultOptions,
      ...options,
      viewportBounds: options.viewportBounds ?? defaultOptions.viewportBounds,
      initialBounds: options.initialBounds ?? defaultOptions.initialBounds,
      visibleLayers,
      selectedElement: options.selectedElement ?? defaultOptions.selectedElement
    };

    console.debug('[PreviewManager] Configuration finalized:', {
      finalOptions: this.options,
      useStreaming: this.options.maxFeatures > this.STREAM_THRESHOLD,
      cacheEnabled: this.options.enableCaching,
      cacheTTL: this.CACHE_TTL / 1000
    });

    this.featureManager = new FeatureManager({
      chunkSize: Math.ceil(this.options.maxFeatures / 10),
      maxMemoryMB: this.MEMORY_LIMIT_MB,
      monitorMemory: true,
      streamingMode: true
    });

    // Initialize coordinate system validation
    void this.validateCoordinateSystem();
  }

  /**
   * Validate coordinate system configuration
   */
  private async validateCoordinateSystem(): Promise<void> {
    const startTime = performance.now();
    
    if (!coordinateSystemManager.isInitialized()) {
      console.warn('[PreviewManager] Coordinate system manager not initialized');
      return;
    }

    const system = this.options.coordinateSystem;
    const isValid = await coordinateSystemManager.validateSystem(system);
    
    console.debug('[PreviewManager] Validating coordinate system:', {
      system,
      isValid,
      validationTime: Math.round(performance.now() - startTime)
    });

    if (!isValid) {
      console.warn('[PreviewManager] Invalid coordinate system:', {
        requested: system,
        fallback: COORDINATE_SYSTEMS.WGS84
      });
      this.options.coordinateSystem = COORDINATE_SYSTEMS.WGS84;
      this.invalidateCache('unsupported coordinate system');
    }
  }

  /**
   * Invalidate cache with reason
   */
  private invalidateCache(reason?: string): void {
    const cacheSize = this.collectionsCache.size;
    const cacheKeys = Array.from(this.collectionsCache.keys());
    
    console.debug('[PreviewManager] Invalidating cache:', {
      reason,
      previousSize: cacheSize,
      keys: cacheKeys,
      oldestEntry: cacheKeys.length > 0 ? 
        Math.min(...Array.from(this.collectionsCache.values()).map(v => v.timestamp)) : 
        null
    });
    
    this.collectionsCache.clear();
  }

  /**
   * Get cache key for coordinate system
   */
  private getCacheKey(): string {
    return `preview:${this.options.coordinateSystem}:all-visible`;
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
      console.debug('[PreviewManager] Using provided bounds:', bounds);
      return bounds as Required<Bounds>;
    }

    // Then try initial bounds
    if (this.options.initialBounds && 
        isFinite(this.options.initialBounds.minX) && isFinite(this.options.initialBounds.minY) &&
        isFinite(this.options.initialBounds.maxX) && isFinite(this.options.initialBounds.maxY) &&
        this.options.initialBounds.minX !== this.options.initialBounds.maxX && 
        this.options.initialBounds.minY !== this.options.initialBounds.maxY) {
      console.debug('[PreviewManager] Using initial bounds:', this.options.initialBounds);
      return this.options.initialBounds as Required<Bounds>;
    }

    // Then try viewport bounds
    if (this.options.viewportBounds && 
        this.options.viewportBounds.length === 4 &&
        this.options.viewportBounds.every(n => isFinite(n)) &&
        this.options.viewportBounds[0] !== this.options.viewportBounds[2] &&
        this.options.viewportBounds[1] !== this.options.viewportBounds[3]) {
      console.debug('[PreviewManager] Using viewport bounds:', {
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
          console.debug('[PreviewManager] Using bounds from features:', featureBounds);
          return featureBounds as Required<Bounds>;
        }
      }
    } catch (error) {
      console.warn('[PreviewManager] Failed to calculate bounds from features:', error);
    }

    // Use default bounds as last resort
    return {
      minX: -180,
      minY: -90,
      maxX: 180,
      maxY: 90
    };
  }

  /**
   * Clean expired cache entries
   */
  private cleanExpiredCache(): void {
    const now = Date.now();
    for (const [key, value] of this.collectionsCache.entries()) {
      if (now - value.timestamp > this.CACHE_TTL) {
        console.debug('[PreviewManager] Removing expired cache entry:', key);
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
   * Set preview options and update state accordingly
   */
  setOptions(options: PreviewOptions) {
    console.debug('[PreviewManager] Setting options:', {
      oldOptions: this.options,
      newOptions: options
    });

    const layersChanged = options.visibleLayers && 
      (!this.options.visibleLayers || 
        options.visibleLayers.length !== this.options.visibleLayers.length ||
        options.visibleLayers.some(layer => !this.options.visibleLayers?.includes(layer)));

    if (layersChanged) {
      console.debug('[PreviewManager] Visible layers changed:', {
        old: this.options.visibleLayers,
        new: options.visibleLayers
      });
      this.invalidateCache('layers changed');
      this.featureManager.setVisibleLayers(options.visibleLayers || []);
    }

    this.options = {
      ...this.options,
      ...options
    };

    console.debug('[PreviewManager] Options updated:', {
      finalOptions: this.options,
      cacheCleared: layersChanged
    });
  }

  /**
   * Categorize features by geometry type
   */
  private categorizeFeatures(features: GeoFeature[]): PreviewCollections {
    console.debug('[PreviewManager] Categorizing features:', {
      total: features.length
    });

    const points: GeoFeature[] = [];
    const lines: GeoFeature[] = [];
    const polygons: GeoFeature[] = [];

    for (const feature of features) {
      if (!feature.geometry) continue;

      switch (feature.geometry.type.toLowerCase()) {
        case 'point':
        case 'multipoint':
          points.push(feature);
          break;
        case 'linestring':
        case 'multilinestring':
          lines.push(feature);
          break;
        case 'polygon':
        case 'multipolygon':
          polygons.push(feature);
          break;
      }
    }

    console.debug('[PreviewManager] Features categorized:', {
      points: points.length,
      lines: lines.length,
      polygons: polygons.length
    });

    return {
      points: { type: 'FeatureCollection', features: points },
      lines: { type: 'FeatureCollection', features: lines },
      polygons: { type: 'FeatureCollection', features: polygons }
    };
  }

  /**
   * Calculate bounds from collections
   */
  private calculateBounds(collections: PreviewCollections): Required<Bounds> {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    const updateBounds = (coords: number[]) => {
      minX = Math.min(minX, coords[0]);
      minY = Math.min(minY, coords[1]);
      maxX = Math.max(maxX, coords[0]);
      maxY = Math.max(maxY, coords[1]);
    };

    const processGeometry = (geometry: any) => {
      if (!geometry) return;

      switch (geometry.type.toLowerCase()) {
        case 'point':
          updateBounds(geometry.coordinates);
          break;
        case 'multipoint':
        case 'linestring':
          geometry.coordinates.forEach(updateBounds);
          break;
        case 'multilinestring':
        case 'polygon':
          geometry.coordinates.flat().forEach(updateBounds);
          break;
        case 'multipolygon':
          geometry.coordinates.flat(2).forEach(updateBounds);
          break;
      }
    };

    [...collections.points.features, 
     ...collections.lines.features, 
     ...collections.polygons.features].forEach(feature => {
      processGeometry(feature.geometry);
    });

    // Add padding
    const dx = (maxX - minX) * this.BOUNDS_PADDING;
    const dy = (maxY - minY) * this.BOUNDS_PADDING;

    return {
      minX: minX - dx,
      minY: minY - dy,
      maxX: maxX + dx,
      maxY: maxY + dy
    };
  }

  /**
   * Get preview collections for the current viewport
   */
  public async getPreviewCollections(): Promise<PreviewCollectionResult> {
    console.debug('[PreviewManager] Getting preview collections');
    
    const cacheKey = this.getCacheKey();
    const cached = this.collectionsCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      console.debug('[PreviewManager] Using cached collections:', {
        cacheKey,
        visibleLayers: this.options.visibleLayers,
        points: cached.points.features.length,
        lines: cached.lines.features.length,
        polygons: cached.polygons.features.length
      });
      return cached;
    }

    try {
      const visibleFeatures = await this.featureManager.getVisibleFeatures();
      console.debug('[PreviewManager] Got visible features:', {
        count: visibleFeatures.length,
        visibleLayers: this.options.visibleLayers
      });

      const collections = this.categorizeFeatures(visibleFeatures);
      const bounds = this.calculateBounds(collections);
      
      const result: PreviewCollectionResult = {
        ...collections,
        bounds,
        totalCount: visibleFeatures.length,
        coordinateSystem: this.options.coordinateSystem || COORDINATE_SYSTEMS.WGS84,
        timestamp: Date.now()
      };

      // Cache the result
      this.collectionsCache.set(cacheKey, result);
      
      console.debug('[PreviewManager] Generated collections:', {
        points: collections.points.features.length,
        lines: collections.lines.features.length,
        polygons: collections.polygons.features.length,
        bounds,
        totalCount: visibleFeatures.length
      });

      return result;
    } catch (error) {
      console.error('[PreviewManager] Error generating collections:', error);
      throw error;
    }
  }

  /**
   * Get preview collections filtered by visible layers
   */
  getPreviewCollectionsFiltered(): Promise<PreviewCollectionResult> {
    console.debug('[PreviewManager] Getting preview collections');
    
    const cacheKey = this.getCacheKey();
    const cached = this.collectionsCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      console.debug('[PreviewManager] Using cached collections:', {
        cacheKey,
        visibleLayers: this.options.visibleLayers,
        points: cached.points.features.length,
        lines: cached.lines.features.length,
        polygons: cached.polygons.features.length
      });
      return Promise.resolve(cached);
    }

    return this.generateCollections();
  }

  private async generateCollections(): Promise<PreviewCollectionResult> {
    console.debug('[PreviewManager] Generating new collections');
    
    const visibleFeatures = await this.featureManager.getVisibleFeatures();
    console.debug('[PreviewManager] Got visible features:', {
      count: visibleFeatures.length,
      visibleLayers: this.options.visibleLayers
    });

    const collections = this.categorizeFeatures(visibleFeatures);
    const bounds = this.calculateBounds(collections);
    
    const result: PreviewCollectionResult = {
      ...collections,
      bounds,
      totalCount: visibleFeatures.length,
      coordinateSystem: this.options.coordinateSystem || COORDINATE_SYSTEMS.WGS84,
      timestamp: Date.now()
    };

    // Cache the result
    this.collectionsCache.set(this.getCacheKey(), result);
    
    console.debug('[PreviewManager] Generated collections:', {
      points: collections.points.features.length,
      lines: collections.lines.features.length,
      polygons: collections.polygons.features.length,
      bounds,
      totalCount: visibleFeatures.length
    });

    return result;
  }

  /**
   * Update preview options with coordinate system validation
   */
  public setOptionsWithValidation(newOptions: Partial<PreviewOptions>): void {
    const oldOptions = { ...this.options };
    
    // Update options
    this.options = {
      ...this.options,
      ...newOptions
    };

    // Handle layer visibility changes
    if (newOptions.visibleLayers && 
        (!oldOptions.visibleLayers || 
         JSON.stringify(newOptions.visibleLayers) !== JSON.stringify(oldOptions.visibleLayers))) {
      console.debug('[PreviewManager] Updating visible layers:', {
        old: oldOptions.visibleLayers,
        new: newOptions.visibleLayers
      });
      
      // Update feature manager
      this.featureManager.setVisibleLayers(newOptions.visibleLayers);
      
      // Clear cache when layers change
      if (this.options.enableCaching) {
        console.debug('[PreviewManager] Clearing cache due to layer changes');
        this.collectionsCache.clear();
      }
    }

    // Handle viewport changes
    if (newOptions.viewportBounds && 
        (!oldOptions.viewportBounds ||
         JSON.stringify(newOptions.viewportBounds) !== JSON.stringify(oldOptions.viewportBounds))) {
      console.debug('[PreviewManager] Viewport bounds updated:', {
        old: oldOptions.viewportBounds,
        new: newOptions.viewportBounds
      });
    }
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
  async setFeatures(features: Feature[] | FeatureCollection): Promise<void> {
    console.debug('[PreviewManager] Setting features in preview manager');
    
    // Clear existing cache
    this.invalidateCache('new features');

    // Convert to feature collection if needed
    const collection: FeatureCollection = Array.isArray(features) 
      ? { type: 'FeatureCollection', features }
      : features;

    // Determine if we should use streaming mode
    const useStreaming = collection.features.length > this.STREAM_THRESHOLD;
    
    // Update feature manager configuration
    this.featureManager = new FeatureManager({
      chunkSize: Math.ceil(this.options.maxFeatures / 10),
      maxMemoryMB: this.MEMORY_LIMIT_MB,
      monitorMemory: true,
      streamingMode: useStreaming
    });

    // Set features in feature manager
    await this.featureManager.setFeatures(collection);
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
    return collections !== null && collections.totalCount > 0;
  }

  /**
   * Clean up resources and dispose of the preview manager
   */
  public dispose(): void {
    console.debug('[PreviewManager] Disposing preview manager');
    
    // Clear collections cache
    this.invalidateCache('dispose');
    
    // Clean up feature manager
    if (this.featureManager) {
      // Clean up feature manager
      this.featureManager.dispose();
    }
    
    // Clear options
    this.options = {
      maxFeatures: this.DEFAULT_MAX_FEATURES,
      coordinateSystem: COORDINATE_SYSTEMS.WGS84,
      visibleLayers: [],
      viewportBounds: [-180, -90, 180, 90],
      enableCaching: true,
      smartSampling: true,
      analysis: { warnings: [] },
      initialBounds: null as unknown as Required<Bounds>,
      onProgress: () => {},
      selectedElement: ''
    };

    console.debug('[PreviewManager] Disposed successfully');
  }
}

/**
 * Create a new preview manager instance
 */
export const createPreviewManager = (options: PreviewOptions = {}) => {
  return new PreviewManager(options);
};
