import { CoordinateSystem } from '../../../../../types/coordinates';
import { coordinateSystemManager } from '../../../../coordinate-system-manager';
import { DxfEntity } from '../types';
import { DxfTransformer } from './transformer';
import { DxfEntityProcessor } from './entity-processor';
import { Feature } from 'geojson';

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export class DxfCoordinateHandler {
  /**
   * Initialize and verify coordinate system manager
   */
  static async initializeCoordinateSystem(sourceSystem: CoordinateSystem): Promise<void> {
    if (!coordinateSystemManager.isInitialized()) {
      console.debug('[DEBUG] Initializing coordinate system manager');
      await coordinateSystemManager.initialize();

      // Verify transformation with test point
      const testPoint = { x: 2645021, y: 1249991 };
      const transformed = await coordinateSystemManager.transform(
        testPoint,
        sourceSystem,
        'EPSG:4326'
      );

      console.debug('[DEBUG] Coordinate system verification:', {
        sourceSystem,
        testPoint,
        transformed,
        expectedWGS84: { x: 8.0, y: 47.4 }
      });
    }
  }

  /**
   * Transform entities and convert to features
   */
  static async processEntities(
    entities: DxfEntity[],
    sourceSystem: CoordinateSystem
  ): Promise<Feature[]> {
    console.debug('[DEBUG] Processing entities with coordinate transformation:', {
      count: entities.length,
      sourceSystem
    });

    // Transform entities to WGS84
    const transformedEntities = await DxfTransformer.transformEntities(
      entities,
      sourceSystem,
      'EPSG:4326'
    );

    // Convert transformed entities to features
    const features = await DxfEntityProcessor.entitiesToFeatures(transformedEntities);
    
    // Add original coordinate system to feature properties
    features.forEach(feature => {
      if (feature.properties) {
        feature.properties.originalSystem = sourceSystem;
      }
    });

    console.debug('[DEBUG] Entity processing complete:', {
      inputCount: entities.length,
      outputCount: features.length,
      sourceSystem,
      targetSystem: 'EPSG:4326'
    });

    return features;
  }

  /**
   * Transform bounds to WGS84
   */
  static async transformBounds(
    bounds: Bounds,
    sourceSystem: CoordinateSystem
  ): Promise<Bounds> {
    console.debug('[DEBUG] Transforming bounds:', {
      bounds,
      sourceSystem
    });

    // Transform min point
    const minPoint = await coordinateSystemManager.transform(
      { x: bounds.minX, y: bounds.minY },
      sourceSystem,
      'EPSG:4326'
    );

    // Transform max point
    const maxPoint = await coordinateSystemManager.transform(
      { x: bounds.maxX, y: bounds.maxY },
      sourceSystem,
      'EPSG:4326'
    );

    const transformedBounds = {
      minX: minPoint.x,
      minY: minPoint.y,
      maxX: maxPoint.x,
      maxY: maxPoint.y
    };

    console.debug('[DEBUG] Bounds transformation complete:', {
      original: bounds,
      transformed: transformedBounds,
      sourceSystem
    });

    return transformedBounds;
  }

  /**
   * Verify coordinate range for system
   */
  static verifyCoordinateRange(
    point: { x: number; y: number },
    system: CoordinateSystem
  ): boolean {
    const definition = coordinateSystemManager.getSystemDefinition(system);
    if (!definition?.bounds) return true;

    const { bounds } = definition;
    const inRange = (
      point.x >= bounds.minX &&
      point.x <= bounds.maxX &&
      point.y >= bounds.minY &&
      point.y <= bounds.maxY
    );

    if (!inRange) {
      console.warn('[DEBUG] Coordinate out of range:', {
        point,
        system,
        bounds,
        difference: {
          x: point.x < bounds.minX ? point.x - bounds.minX : point.x - bounds.maxX,
          y: point.y < bounds.minY ? point.y - bounds.minY : point.y - bounds.maxY
        }
      });
    }

    return inRange;
  }

  /**
   * Get system bounds
   */
  static getSystemBounds(system: CoordinateSystem): Bounds | undefined {
    return coordinateSystemManager.getSystemDefinition(system)?.bounds;
  }
}
