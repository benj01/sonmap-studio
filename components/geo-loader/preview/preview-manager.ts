import { Feature, FeatureCollection, Position } from 'geojson';
import { PreviewOptions, PreviewCollections, ViewportBounds } from './types';
import { CoordinateSystem } from '../types/coordinates';
import { GeoFeature } from '../../../types/geo';
import { PreviewCacheManager } from './cache-manager';
import { BoundsValidator } from './modules/bounds-validator';
import { CoordinateSystemHandler } from './modules/coordinate-system-handler';
import { MapboxProjectionManager } from './modules/mapbox-projection-manager';
import { PreviewFeatureManager } from './modules/preview-feature-manager';
import { PreviewOptionsManager } from './modules/preview-options-manager';
import { LogManager } from '../core/logging/log-manager';
import { Bounds } from '../core/feature-manager/bounds';
import { isPointInBounds } from '../utils/geometry';

const DEFAULT_BATCH_SIZE = 1000;
const MIN_VIEWPORT_CHANGE = 0.1; // 10% change threshold

interface ViewportCache {
  bounds: ViewportBounds;
  collections: PreviewCollections;
  timestamp: number;
}

// Re-export types that might be used by consumers
export type { PreviewOptions, PreviewCollections, ViewportBounds };

/**
 * Manages preview generation with streaming and caching support
 */
export class PreviewManager {
  private static readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  private readonly optionsManager: PreviewOptionsManager;
  private readonly featureManager: PreviewFeatureManager;
  private readonly coordinateHandler: CoordinateSystemHandler;
  private readonly projectionManager: MapboxProjectionManager;
  private readonly boundsValidator: BoundsValidator;
  private readonly cacheManager: PreviewCacheManager;
  private readonly logger = LogManager.getInstance();
  private readonly viewportCache = new Map<string, ViewportCache>();
  private options: PreviewOptions;
  private processingQueue: Promise<void> | null = null;
  private lastViewportUpdate = 0;

  constructor(options: PreviewOptions) {
    this.options = options;
    this.optionsManager = new PreviewOptionsManager(options);
    this.coordinateHandler = new CoordinateSystemHandler(options.coordinateSystem);
    this.projectionManager = new MapboxProjectionManager();
    this.boundsValidator = new BoundsValidator();
    this.cacheManager = new PreviewCacheManager(PreviewManager.CACHE_TTL);
    this.featureManager = new PreviewFeatureManager();

    // Validate coordinate system
    void this.validateCoordinateSystem();

    // Only log initialization in development
    if (process.env.NODE_ENV === 'development') {
      this.logger.info('PreviewManager', 'Initialized with configuration', {
        options: this.optionsManager.getOptions(),
        projection: this.projectionManager.getProjection()
      });
    }
  }

  /**
   * Convert Feature to GeoFeature with required properties
   */
  private toGeoFeature(feature: Feature): GeoFeature {
    return {
      ...feature,
      properties: {
        ...feature.properties,
        layer: feature.properties?.layer || 'shapes',
        type: feature.properties?.type || feature.geometry?.type || 'unknown'
      }
    } as GeoFeature;
  }

  /**
   * Convert array of Features to GeoFeatures
   */
  private toGeoFeatures(features: Feature[]): GeoFeature[] {
    return features.map(f => this.toGeoFeature(f));
  }

  /**
   * Validate coordinate system configuration
   */
  private async validateCoordinateSystem(): Promise<void> {
    const isValid = await this.coordinateHandler.validate();
    
    if (!isValid) {
      console.warn('[PreviewManager] Invalid coordinate system, falling back to WGS84');
      this.coordinateHandler.setCoordinateSystem(COORDINATE_SYSTEMS.WGS84);
      this.invalidateCache('unsupported coordinate system');
    }
  }

  /**
   * Get cache key for current state
   */
  private getCacheKey(): string {
    return this.cacheManager.getCacheKey(
      this.optionsManager.getCoordinateSystem(),
      this.optionsManager.getVisibleLayers()
    );
  }

  /**
   * Invalidate cache with reason
   */
  private invalidateCache(reason?: string): void {
    if (this.optionsManager.isCachingEnabled()) {
      this.cacheManager.invalidate(reason);
    }
  }

  /**
   * Set preview options
   */
  public setOptions(options: Partial<PreviewOptions>): void {
    this.options = { ...this.options, ...options };
    this.optionsManager.updateOptions(this.options);
    this.coordinateHandler.setCoordinateSystem(this.options.coordinateSystem);
    this.invalidateCache('options changed');
  }

  /**
   * Get preview collections for the current viewport
   */
  public async getPreviewCollections(): Promise<PreviewCollections | null> {
    try {
      if (!this.options.viewportBounds) {
        this.logger.warn('PreviewManager', 'No viewport bounds provided');
        return null;
      }

      // Check if viewport has changed significantly
      if (!this.hasViewportChangedSignificantly(this.options.viewportBounds)) {
        const cached = this.getCachedCollections(this.options.viewportBounds);
        if (cached) {
          this.logger.debug('PreviewManager', 'Using cached collections');
          return cached;
        }
      }

      // Process features in viewport
      return await this.processViewportFeatures();
    } catch (error) {
      this.logger.error('PreviewManager', 'Error getting preview collections', {
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  /**
   * Process features within the current viewport
   */
  private async processViewportFeatures(): Promise<PreviewCollections | null> {
    if (!this.options.viewportBounds) return null;

    try {
      // Wait for any ongoing processing
      if (this.processingQueue) {
        await this.processingQueue;
      }

      // Get features in viewport
      const viewportFeatures = await this.getViewportFeatures(this.options.viewportBounds);
      if (!viewportFeatures || viewportFeatures.length === 0) {
        this.logger.debug('PreviewManager', 'No features in viewport');
        return null;
      }

      // Transform features in batches
      const transformedFeatures = await this.transformFeatureBatches(viewportFeatures);
      if (!transformedFeatures || transformedFeatures.length === 0) {
        this.logger.warn('PreviewManager', 'No features after transformation');
        return null;
      }

      // Process transformed features
      const collections = await this.featureManager.processFeatures(transformedFeatures, {
        enableCaching: this.options.enableCaching,
        smartSampling: this.options.smartSampling
      });

      // Cache the results
      this.cacheViewportCollections(this.options.viewportBounds, collections);

      return collections;
    } catch (error) {
      this.logger.error('PreviewManager', 'Error processing viewport features', {
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  /**
   * Transform features in batches
   */
  private async transformFeatureBatches(
    features: Feature[]
  ): Promise<Feature[]> {
    const batchSize = DEFAULT_BATCH_SIZE;
    const batches: Feature[][] = [];

    // Split features into batches
    for (let i = 0; i < features.length; i += batchSize) {
      batches.push(features.slice(i, i + batchSize));
    }

    // Transform batches
    const transformedBatches = await Promise.all(
      batches.map(batch => 
        this.coordinateHandler.transformFeatures(
          batch,
          this.options.coordinateSystem,
          'EPSG:3857'
        )
      )
    );

    // Combine transformed batches
    return transformedBatches.flat();
  }

  /**
   * Get features within viewport bounds
   */
  private async getViewportFeatures(bounds: ViewportBounds): Promise<Feature[]> {
    // Transform viewport bounds to source coordinate system
    const sourceBounds = await this.coordinateHandler.transformBounds(
      bounds,
      'EPSG:3857',
      this.options.coordinateSystem
    );

    // Get features within bounds
    return this.featureManager.getFeaturesInBounds(sourceBounds);
  }

  /**
   * Check if viewport has changed significantly
   */
  private hasViewportChangedSignificantly(bounds: ViewportBounds): boolean {
    const cached = this.getCachedCollections(bounds);
    if (!cached) return true;

    const now = Date.now();
    if (now - this.lastViewportUpdate < 100) return false;

    const cachedBounds = cached.bounds;
    const dx = Math.abs(bounds[2] - bounds[0] - (cachedBounds[2] - cachedBounds[0])) / (cachedBounds[2] - cachedBounds[0]);
    const dy = Math.abs(bounds[3] - bounds[1] - (cachedBounds[3] - cachedBounds[1])) / (cachedBounds[3] - cachedBounds[1]);

    return dx > MIN_VIEWPORT_CHANGE || dy > MIN_VIEWPORT_CHANGE;
  }

  /**
   * Get cached collections for viewport
   */
  private getCachedCollections(bounds: ViewportBounds): PreviewCollections | null {
    const key = this.getViewportCacheKey(bounds);
    const cached = this.viewportCache.get(key);
    
    if (cached && Date.now() - cached.timestamp < 30000) {
      return cached.collections;
    }

    return null;
  }

  /**
   * Cache collections for viewport
   */
  private cacheViewportCollections(
    bounds: ViewportBounds,
    collections: PreviewCollections
  ): void {
    const key = this.getViewportCacheKey(bounds);
    this.viewportCache.set(key, {
      bounds,
      collections,
      timestamp: Date.now()
    });
    this.lastViewportUpdate = Date.now();

    // Clean old cache entries
    this.cleanViewportCache();
  }

  /**
   * Clean old viewport cache entries
   */
  private cleanViewportCache(): void {
    const now = Date.now();
    for (const [key, cache] of this.viewportCache.entries()) {
      if (now - cache.timestamp > 30000) {
        this.viewportCache.delete(key);
      }
    }
  }

  /**
   * Get cache key for viewport
   */
  private getViewportCacheKey(bounds: ViewportBounds): string {
    const precision = 2; // Round to 2 decimal places for cache key
    return bounds
      .map(coord => Math.round(coord * Math.pow(10, precision)) / Math.pow(10, precision))
      .join(':');
  }

  /**
   * Set features directly for preview
   */
  public async setFeatures(features: Feature[] | FeatureCollection): Promise<void> {
    console.debug('[PreviewManager] Setting features:', {
      type: Array.isArray(features) ? 'array' : 'collection',
      count: Array.isArray(features) ? features.length : features.features.length,
      sample: Array.isArray(features) ? features[0] : features.features[0]
    });
    
    this.invalidateCache('new features');

    const collection: FeatureCollection = Array.isArray(features) 
      ? { type: 'FeatureCollection', features }
      : features;

    // Validate and transform bounds if needed
    const { bounds: validatedBounds, detectedSystem } = await this.boundsValidator.validateAndTransform(
      this.featureManager.calculateBounds({
        points: { type: 'FeatureCollection', features: [] },
        lines: { type: 'FeatureCollection', features: [] },
        polygons: { type: 'FeatureCollection', features: [] }
      }),
      this.optionsManager.getCoordinateSystem()
    );

    // Update coordinate system if a different one was detected
    if (detectedSystem) {
      console.debug('[PreviewManager] Detected coordinate system:', detectedSystem);
      this.setOptions({ coordinateSystem: detectedSystem as CoordinateSystem });
    }

    // Transform coordinates if needed
    const processedFeatures = await this.processFeatures(collection.features);
    console.debug('[PreviewManager] Processed features:', {
      count: processedFeatures.length,
      types: processedFeatures.map(f => f.geometry?.type),
      layers: processedFeatures.map(f => f.properties?.layer)
    });

    // Set processed features
    await this.featureManager.setFeatures(processedFeatures);
  }

  /**
   * Get features by type and layer
   */
  public async getFeaturesByTypeAndLayer(type: string, layer: string): Promise<GeoFeature[]> {
    return this.featureManager.getFeaturesByTypeAndLayer(type, layer);
  }

  /**
   * Check if there are any visible features
   */
  public async hasVisibleFeatures(): Promise<boolean> {
    return this.featureManager.hasVisibleFeatures();
  }

  /**
   * Set Mapbox projection configuration
   */
  public setMapProjection(projection: Partial<MapboxProjection>): void {
    if (this.projectionManager.setProjection(projection)) {
      this.invalidateCache('projection changed');
    }
  }

  /**
   * Get current preview options
   */
  public getOptions(): Required<PreviewOptions> {
    return this.optionsManager.getOptions();
  }

  /**
   * Clean up resources and dispose of the preview manager
   */
  public dispose(): void {
    console.debug('[PreviewManager] Disposing preview manager');
    
    this.invalidateCache('dispose');
    this.featureManager.dispose();
    this.optionsManager.reset();
  }

  private async processFeatures(features: Feature[]): Promise<GeoFeature[]> {
    const logger = LogManager.getInstance();
    
    logger.debug('PreviewManager', 'Starting feature processing', {
      featureCount: features.length,
      firstFeature: features[0] ? {
        type: features[0].geometry?.type,
        coordinates: features[0].geometry?.coordinates,
        properties: features[0].properties
      } : null,
      coordinateSystem: this.optionsManager.getCoordinateSystem()
    });

    if (!this.coordinateHandler.requiresTransformation()) {
      logger.debug('PreviewManager', 'No transformation required', {
        coordinateSystem: this.optionsManager.getCoordinateSystem()
      });
      return this.toGeoFeatures(features);
    }

    try {
      logger.debug('PreviewManager', 'Starting coordinate transformation', {
        fromSystem: this.optionsManager.getCoordinateSystem(),
        toSystem: COORDINATE_SYSTEMS.WGS84,
        projection: this.projectionManager.getProjection()
      });

      const transformedFeatures = await this.coordinateHandler.transformFeatures(
        features,
        COORDINATE_SYSTEMS.WGS84,
        this.projectionManager.getProjection()
      );

      logger.debug('PreviewManager', 'Transformation complete', {
        originalCount: features.length,
        transformedCount: transformedFeatures.length,
        firstTransformed: transformedFeatures[0] ? {
          type: transformedFeatures[0].geometry?.type,
          coordinates: transformedFeatures[0].geometry?.coordinates,
          properties: transformedFeatures[0].properties
        } : null
      });

      return transformedFeatures;
    } catch (error) {
      logger.error('PreviewManager', 'Feature transformation failed', {
        error: error instanceof Error ? error.message : String(error),
        featureCount: features.length
      });
      throw error;
    }
  }
}

/**
 * Create a new preview manager instance
 */
export const createPreviewManager = (options: PreviewOptions): PreviewManager => {
  return new PreviewManager(options);
};
