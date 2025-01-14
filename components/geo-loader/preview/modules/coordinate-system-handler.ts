import { Feature, FeatureCollection } from 'geojson';
import { COORDINATE_SYSTEMS, CoordinateSystem } from '../../types/coordinates';
import { coordinateSystemManager } from '../../core/coordinate-systems/coordinate-system-manager';
import { GeoFeature } from '../../../../types/geo';
import { MapboxProjection } from '../types/mapbox';

export class CoordinateSystemHandler {
  private coordinateSystem: CoordinateSystem;

  constructor(initialSystem: CoordinateSystem = COORDINATE_SYSTEMS.SWISS_LV95) {
    this.coordinateSystem = initialSystem;
    // Force initialization when handler is created
    void this.ensureInitialized();
  }

  private async ensureInitialized(): Promise<void> {
    const manager = coordinateSystemManager;
    if (!manager.isInitialized()) {
      console.debug('[CoordinateSystemHandler] Initializing coordinate system manager');
      await manager.initialize();
    }
    // Clear cache to ensure we use updated proj4 definitions
    manager.clearCache();
  }

  public async validate(): Promise<boolean> {
    const startTime = performance.now();
    await this.ensureInitialized();

    const isValid = await coordinateSystemManager.validate(this.coordinateSystem);
    
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

  public setCoordinateSystem(system: CoordinateSystem): void {
    if (system !== this.coordinateSystem) {
      console.debug('[CoordinateSystemHandler] Updating coordinate system:', {
        from: this.coordinateSystem,
        to: system
      });
      this.coordinateSystem = system;
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
