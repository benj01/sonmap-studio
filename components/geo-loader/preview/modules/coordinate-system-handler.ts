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
}
