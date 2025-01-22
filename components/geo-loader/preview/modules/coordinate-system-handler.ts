import { Feature, FeatureCollection } from 'geojson';
import { COORDINATE_SYSTEMS, CoordinateSystem } from '../../types/coordinates';
import { coordinateSystemManager } from '../../core/coordinate-systems/coordinate-system-manager';
import { GeoFeature } from '../../../../types/geo';
import { MapboxProjection } from '../types/mapbox';

export class CoordinateSystemHandler {
  private coordinateSystem: CoordinateSystem;

  private initializationPromise: Promise<void> | null = null;

  constructor(initialSystem?: CoordinateSystem) {
    // Detect or default to WGS84 if no system provided
    this.coordinateSystem = initialSystem || COORDINATE_SYSTEMS.WGS84;
    // Initialize asynchronously but don't block constructor
    this.initializationPromise = this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      const manager = coordinateSystemManager;
      if (!manager.isInitialized()) {
        console.debug('[CoordinateSystemHandler] Initializing coordinate system manager');
        await manager.initialize();
      }

      // Validate the coordinate system directly with manager
      const isValid = await manager.validateSystem(this.coordinateSystem);
      if (!isValid) {
        console.warn('[CoordinateSystemHandler] Invalid initial coordinate system, falling back to WGS84');
        this.coordinateSystem = COORDINATE_SYSTEMS.WGS84;
      }
    } catch (error) {
      console.error('[CoordinateSystemHandler] Initialization failed:', error);
      this.coordinateSystem = COORDINATE_SYSTEMS.WGS84;
      throw new Error('Failed to initialize coordinate system handler');
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initializationPromise) {
      this.initializationPromise = this.initialize();
    }
    try {
      await this.initializationPromise;
    } catch (error) {
      // Reset initialization promise on failure
      this.initializationPromise = null;
      throw error;
    }
  }

  public async validate(): Promise<boolean> {
    const startTime = performance.now();
    await this.ensureInitialized();

    // Use validateSystem instead of validate to avoid circular dependency
    const isValid = await coordinateSystemManager.validateSystem(this.coordinateSystem);
    
    console.debug('[CoordinateSystemHandler] Validation:', {
      system: this.coordinateSystem,
      isValid,
      validationTime: Math.round(performance.now() - startTime)
    });

    return isValid;
  }

  public async transformFeatures(
    features: Feature[] | FeatureCollection,
    targetSystem: CoordinateSystem = COORDINATE_SYSTEMS.WGS84,
    projectionInfo?: MapboxProjection
  ): Promise<GeoFeature[]> {
    // Ensure initialization before transformation
    await this.ensureInitialized();
    const collection: FeatureCollection = Array.isArray(features) 
      ? { type: 'FeatureCollection', features }
      : features;

    if (this.coordinateSystem === targetSystem) {
      return this.addMetadata(collection.features, this.coordinateSystem, projectionInfo);
    }

    console.debug('[CoordinateSystemHandler] Transforming coordinates:', {
      from: this.coordinateSystem,
      to: targetSystem,
      featureCount: collection.features.length
    });

    try {
      await this.ensureInitialized();
      const transformedFeatures = await coordinateSystemManager.transform(
        collection.features,
        this.coordinateSystem,
        targetSystem
      );

      return this.addMetadata(
        transformedFeatures,
        this.coordinateSystem,
        projectionInfo,
        collection.features.map(f => f.geometry)
      );
    } catch (error) {
      console.error('[CoordinateSystemHandler] Transformation failed:', error);
      throw error;
    }
  }

  private addMetadata(
    features: Feature[],
    originalSystem: CoordinateSystem,
    projectionInfo?: MapboxProjection,
    originalGeometries?: any[]
  ): GeoFeature[] {
    return features.map((feature, index) => ({
      ...feature,
      properties: {
        ...feature.properties,
        layer: feature.properties?.layer || 'default',
        type: feature.properties?.type || feature.geometry?.type || 'unknown',
        originalSystem,
        ...(originalGeometries ? { originalGeometry: originalGeometries[index] } : {}),
        _transformedCoordinates: originalSystem !== COORDINATE_SYSTEMS.WGS84,
        ...(projectionInfo ? {
          _projectionInfo: {
            original: originalSystem,
            display: projectionInfo.name,
            center: projectionInfo.center,
            parallels: projectionInfo.parallels
          }
        } : {})
      }
    })) as GeoFeature[];
  }

  public async setCoordinateSystem(system: CoordinateSystem): Promise<void> {
    try {
      await this.ensureInitialized();
      
      // Validate the new coordinate system
      const isValid = await coordinateSystemManager.validateSystem(system);
      if (!isValid) {
        throw new Error(`Invalid coordinate system: ${system}`);
      }

      if (system !== this.coordinateSystem) {
        console.debug('[CoordinateSystemHandler] Updating coordinate system:', {
          from: this.coordinateSystem,
          to: system
        });
        this.coordinateSystem = system;
      }
    } catch (error) {
      console.error('[CoordinateSystemHandler] Failed to set coordinate system:', error);
      throw error;
    }
  }

  public getCoordinateSystem(): CoordinateSystem {
    return this.coordinateSystem;
  }

  public isSwissSystem(): boolean {
    return this.coordinateSystem === COORDINATE_SYSTEMS.SWISS_LV95;
  }

  public requiresTransformation(): boolean {
    return this.coordinateSystem !== COORDINATE_SYSTEMS.WGS84;
  }

  /**
   * Validate Swiss coordinates
   */
  private validateSwissCoordinates(x: number, y: number): boolean {
    // Swiss LV95 bounds
    const MIN_X = 2485000;
    const MAX_X = 2834000;
    const MIN_Y = 1075000;
    const MAX_Y = 1299000;

    return isFinite(x) && isFinite(y) &&
           x >= MIN_X && x <= MAX_X &&
           y >= MIN_Y && y <= MAX_Y;
  }

  /**
   * Transform coordinates to WGS84
   */
  public async transformToWGS84(coordinates: [number, number]): Promise<[number, number]> {
    if (this.coordinateSystem === COORDINATE_SYSTEMS.WGS84) {
      return coordinates;
    }

    try {
      if (this.isSwissSystem()) {
        // Validate Swiss coordinates before transformation
        if (!this.validateSwissCoordinates(coordinates[0], coordinates[1])) {
          console.warn('[CoordinateSystemHandler] Invalid Swiss coordinates:', coordinates);
          return coordinates;
        }

        const projection = this.getProjection();
        if (!projection) {
          console.error('[CoordinateSystemHandler] No projection found for:', this.coordinateSystem);
          return coordinates;
        }

        const [lon, lat] = proj4(projection, 'WGS84', coordinates);
        if (!isFinite(lon) || !isFinite(lat)) {
          console.error('[CoordinateSystemHandler] Invalid transformation result:', { lon, lat });
          return coordinates;
        }

        return [lon, lat];
      }

      console.warn('[CoordinateSystemHandler] Unsupported coordinate system:', this.coordinateSystem);
      return coordinates;
    } catch (error) {
      console.error('[CoordinateSystemHandler] Transformation error:', error);
      return coordinates;
    }
  }

  /**
   * Transform bounds to WGS84
   */
  public async transformBoundsToWGS84(bounds: Bounds): Promise<Bounds> {
    if (this.coordinateSystem === COORDINATE_SYSTEMS.WGS84) {
      return bounds;
    }

    try {
      console.debug('[CoordinateSystemHandler] Transforming bounds:', {
        from: this.coordinateSystem,
        bounds
      });

      // Transform each corner
      const corners = await Promise.all([
        this.transformToWGS84([bounds.minX, bounds.minY]),
        this.transformToWGS84([bounds.minX, bounds.maxY]),
        this.transformToWGS84([bounds.maxX, bounds.minY]),
        this.transformToWGS84([bounds.maxX, bounds.maxY])
      ]);

      // Calculate new bounds from transformed corners
      const transformedBounds = {
        minX: Math.min(...corners.map(c => c[0])),
        minY: Math.min(...corners.map(c => c[1])),
        maxX: Math.max(...corners.map(c => c[0])),
        maxY: Math.max(...corners.map(c => c[1]))
      };

      console.debug('[CoordinateSystemHandler] Transformed bounds:', transformedBounds);
      return transformedBounds;
    } catch (error) {
      console.error('[CoordinateSystemHandler] Error transforming bounds:', error);
      return bounds;
    }
  }
}
