import { Feature, FeatureCollection } from 'geojson';
import { PreviewOptions, PreviewCollectionResult } from './types/preview';
import { MapboxProjection } from './types/mapbox';
import { COORDINATE_SYSTEMS, CoordinateSystem } from '../types/coordinates';
import { GeoFeature } from '../../../types/geo';
import { PreviewCacheManager } from './cache-manager';
import { BoundsValidator } from './modules/bounds-validator';
import { CoordinateSystemHandler } from './modules/coordinate-system-handler';
import { MapboxProjectionManager } from './modules/mapbox-projection-manager';
import { PreviewFeatureManager } from './modules/preview-feature-manager';
import { PreviewOptionsManager } from './modules/preview-options-manager';

// Re-export types that might be used by consumers
export type { PreviewOptions, PreviewCollectionResult, MapboxProjection };

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

  constructor(options: PreviewOptions = {}) {
    // Initialize all managers
    this.optionsManager = new PreviewOptionsManager(options);
    this.coordinateHandler = new CoordinateSystemHandler(
      this.optionsManager.getCoordinateSystem() as CoordinateSystem
    );
    this.projectionManager = new MapboxProjectionManager();
    this.boundsValidator = new BoundsValidator();
    this.cacheManager = new PreviewCacheManager(PreviewManager.CACHE_TTL);
    this.featureManager = new PreviewFeatureManager(
      this.optionsManager.getMaxFeatures(),
      this.optionsManager.getVisibleLayers()
    );

    // Validate coordinate system
    void this.validateCoordinateSystem();

    console.debug('[PreviewManager] Initialized with configuration:', {
      options: this.optionsManager.getOptions(),
      projection: this.projectionManager.getProjection()
    });
  }

  /**
   * Convert Feature to GeoFeature with required properties
   */
  private toGeoFeature(feature: Feature): GeoFeature {
    return {
      ...feature,
      properties: {
        ...feature.properties,
        layer: feature.properties?.layer || 'default',
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
   * Set preview options and update state accordingly
   */
  public setOptions(newOptions: PreviewOptions): void {
    const changes = this.optionsManager.updateOptions(newOptions);

    if (changes.layersChanged) {
      this.featureManager.setVisibleLayers(this.optionsManager.getVisibleLayers());
      this.invalidateCache('layers changed');
    }

    if (changes.coordinateSystemChanged) {
      this.coordinateHandler.setCoordinateSystem(
        this.optionsManager.getCoordinateSystem() as CoordinateSystem
      );
      void this.validateCoordinateSystem();
      this.invalidateCache('coordinate system changed');
    }
  }

  /**
   * Get preview collections for the current viewport
   */
  public async getPreviewCollections(): Promise<PreviewCollectionResult> {
    console.debug('[PreviewManager] Getting preview collections');
    
    const cacheKey = this.getCacheKey();
    const cached = this.cacheManager.get(cacheKey);
    
    if (cached) {
      const hasTransformedFeatures = this.hasTransformedFeatures(cached);
      if (hasTransformedFeatures) {
        console.debug('[PreviewManager] Using cached transformed collections:', {
          points: cached.points.features.length,
          lines: cached.lines.features.length,
          polygons: cached.polygons.features.length
        });
        return cached;
      }
    }

    try {
      const visibleFeatures = await this.featureManager.getVisibleFeatures();
      console.debug('[PreviewManager] Got visible features:', {
        count: visibleFeatures.length,
        types: visibleFeatures.map(f => f.geometry?.type),
        layers: visibleFeatures.map(f => f.properties?.layer),
        visibleLayers: this.optionsManager.getVisibleLayers()
      });

      // Transform coordinates if needed
      const processedFeatures = await this.processFeatures(visibleFeatures);
      console.debug('[PreviewManager] Processed visible features:', {
        count: processedFeatures.length,
        types: processedFeatures.map(f => f.geometry?.type),
        layers: processedFeatures.map(f => f.properties?.layer)
      });

      // Categorize and calculate bounds
      const collections = await this.featureManager.categorizeFeatures(processedFeatures);
      console.debug('[PreviewManager] Categorized features:', {
        points: collections.points.features.length,
        lines: collections.lines.features.length,
        polygons: collections.polygons.features.length
      });

      const bounds = this.featureManager.calculateBounds(collections);
      
      const result: PreviewCollectionResult = {
        ...collections,
        bounds,
        totalCount: processedFeatures.length,
        coordinateSystem: this.optionsManager.getCoordinateSystem() as CoordinateSystem,
        timestamp: Date.now()
      };

      // Cache the result if enabled
      if (this.optionsManager.isCachingEnabled()) {
        this.cacheManager.set(cacheKey, result);
      }
      
      return result;
    } catch (error) {
      console.error('[PreviewManager] Error generating collections:', error);
      throw error;
    }
  }

  private hasTransformedFeatures(collections: PreviewCollectionResult): boolean {
    return collections.points.features.some(f => f.properties?._transformedCoordinates) ||
           collections.lines.features.some(f => f.properties?._transformedCoordinates) ||
           collections.polygons.features.some(f => f.properties?._transformedCoordinates);
  }

  private async processFeatures(features: Feature[]): Promise<GeoFeature[]> {
    if (!this.coordinateHandler.requiresTransformation()) {
      return this.toGeoFeatures(features);
    }

    const transformedFeatures = await this.coordinateHandler.transformFeatures(
      features,
      COORDINATE_SYSTEMS.WGS84,
      this.projectionManager.getProjection()
    );

    return transformedFeatures;
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
}

/**
 * Create a new preview manager instance
 */
export const createPreviewManager = (options: PreviewOptions = {}): PreviewManager => {
  return new PreviewManager(options);
};
