import { Feature, FeatureCollection, Point } from 'geojson';
import { FeatureManager } from '../core/feature-manager';
import { COORDINATE_SYSTEMS, CoordinateSystem } from '../types/coordinates';
import { coordinateSystemManager } from '../core/coordinate-systems';
import { calculateFeatureBounds, Bounds } from '../core/feature-manager/bounds';
import { GeoFeature } from '../../../types/geo';
import { PreviewCacheManager } from './cache-manager';
import { FeatureProcessor } from './feature-processor';
import { 
  PreviewOptions, 
  PreviewCollectionResult,
  PreviewCollections,
  SamplingStrategy
} from './types';

/**
 * Manages preview generation with streaming and caching support
 */
export class PreviewManager {
  private static readonly DEFAULT_MAX_FEATURES = 1000;
  private static readonly MEMORY_LIMIT_MB = 512; 
  private static readonly STREAM_THRESHOLD = 10000; // Number of features that triggers streaming mode
  private static readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  private featureManager: FeatureManager;
  private options: Required<PreviewOptions>;
  private readonly cacheManager: PreviewCacheManager;
  private readonly featureProcessor: FeatureProcessor;

  constructor(options: PreviewOptions = {}) {
    // Initialize managers and caches
    this.cacheManager = new PreviewCacheManager(PreviewManager.CACHE_TTL);
    this.featureProcessor = new FeatureProcessor();

    // Initialize options
    const defaultOptions: Required<PreviewOptions> = {
      maxFeatures: PreviewManager.DEFAULT_MAX_FEATURES,
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
      useStreaming: this.options.maxFeatures > PreviewManager.STREAM_THRESHOLD,
      cacheEnabled: this.options.enableCaching,
      cacheTTL: PreviewManager.CACHE_TTL / 1000
    });

    this.featureManager = new FeatureManager({
      chunkSize: Math.ceil(this.options.maxFeatures / 10),
      maxMemoryMB: PreviewManager.MEMORY_LIMIT_MB,
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
    
    const manager = coordinateSystemManager.getInstance();
    if (!manager.isInitialized()) {
      console.warn('[PreviewManager] Coordinate system manager not initialized');
      await manager.initialize();
    }

    const system = this.options.coordinateSystem;
    const isValid = await manager.validate(system);
    
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
    this.cacheManager.invalidate(reason);
  }

  /**
   * Get cache key for coordinate system
   */
  private getCacheKey(): string {
    return this.cacheManager.getCacheKey(
      this.options.coordinateSystem,
      this.options.visibleLayers
    );
  }

  /**
   * Clean expired cache entries
   */
  private cleanExpiredCache(): void {
    this.cacheManager.cleanExpired();
  }

  private createSamplingStrategy(): SamplingStrategy {
    return this.featureProcessor.createSamplingStrategy(
      this.options.maxFeatures,
      this.options.smartSampling
    );
  }

  /**
   * Set preview options and update state accordingly
   */
  setOptions(options: PreviewOptions): void {
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
   * Get preview collections for the current viewport
   */
  public async getPreviewCollections(): Promise<PreviewCollectionResult> {
    console.debug('[PreviewManager] Getting preview collections');
    
    const cacheKey = this.getCacheKey();
    const cached = this.cacheManager.get(cacheKey);
    
    if (cached) {
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

      const collections = this.featureProcessor.categorizeFeatures(visibleFeatures);
      const bounds = this.featureProcessor.calculateBounds(collections);
      
      const result: PreviewCollectionResult = {
        ...collections,
        bounds,
        totalCount: visibleFeatures.length,
        coordinateSystem: this.options.coordinateSystem || COORDINATE_SYSTEMS.WGS84,
        timestamp: Date.now()
      };

      // Cache the result
      this.cacheManager.set(cacheKey, result);
      
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
        this.invalidateCache('layer visibility changed');
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
  public async setFeatures(features: Feature[] | FeatureCollection): Promise<void> {
    console.debug('[PreviewManager] Setting features in preview manager');
    
    // Clear existing cache
    this.invalidateCache('new features');

    // Convert to feature collection if needed
    const collection: FeatureCollection = Array.isArray(features) 
      ? { type: 'FeatureCollection', features }
      : features;

    // Determine if we should use streaming mode
    const useStreaming = collection.features.length > PreviewManager.STREAM_THRESHOLD;
    
    // Update feature manager configuration
    this.featureManager = new FeatureManager({
      chunkSize: Math.ceil(this.options.maxFeatures / 10),
      maxMemoryMB: PreviewManager.MEMORY_LIMIT_MB,
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
      if (!feature.geometry || !feature.properties) continue;
      
      if (feature.geometry.type === type && feature.properties.layer === layer) {
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
    return collections.totalCount > 0;
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
      this.featureManager.dispose();
    }
    
    // Clear options
    this.options = {
      maxFeatures: PreviewManager.DEFAULT_MAX_FEATURES,
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
export const createPreviewManager = (options: PreviewOptions = {}): PreviewManager => {
  return new PreviewManager(options);
};
