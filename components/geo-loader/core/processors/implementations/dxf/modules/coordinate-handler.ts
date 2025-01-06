import { CoordinateSystem } from '../../../../../types/coordinates';
import { CoordinateSystemManager } from '../../../../coordinate-systems/coordinate-system-manager';
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
    if (!CoordinateSystemManager.isInitialized()) {
      console.debug('[DEBUG] Initializing coordinate system manager');
      await CoordinateSystemManager.initialize();

      // Verify transformation with test point
      const testPoint = { x: 2645021, y: 1249991 };
      const transformed = await CoordinateSystemManager.transform(
        testPoint,
        sourceSystem,
        'EPSG:4326'
      );

      console.debug('[DEBUG] Coordinate system verification:', {
        sourceSystem,
        testPoint,
        transformed,
        expectedWGS84: { x: 8.0, y: 47.4 },
        difference: {
          x: Math.abs(transformed.x - 8.0),
          y: Math.abs(transformed.y - 47.4)
        }
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
    if (!entities || entities.length === 0) {
      console.debug('[DEBUG] No entities to process');
      return [];
    }

    // Initialize coordinate system if needed
    await this.initializeCoordinateSystem(sourceSystem);

    console.debug('[DEBUG] Processing entities with coordinate transformation:', {
      count: entities.length,
      sourceSystem,
      entityTypes: entities.map(e => e.type)
    });

    // Transform entities to WGS84
    console.debug('[DEBUG] Entity coordinates before transformation:', 
      entities.slice(0, 3).map(e => ({
        type: e.type,
        data: {
          x: e.data.x,
          y: e.data.y,
          x2: e.data.x2,
          y2: e.data.y2,
          vertices: e.data.vertices?.slice(0, 2)
        },
        attributes: e.attributes
      }))
    );

    const transformedEntities = await DxfTransformer.transformEntities(
      entities,
      sourceSystem,
      'EPSG:4326'
    );

    if (!transformedEntities || transformedEntities.length === 0) {
      console.warn('[DEBUG] No entities after transformation');
      return [];
    }

    console.debug('[DEBUG] Entity coordinates after transformation:',
      transformedEntities.slice(0, 3).map(e => ({
        type: e.type,
        data: {
          x: e.data.x,
          y: e.data.y,
          x2: e.data.x2,
          y2: e.data.y2,
          vertices: e.data.vertices?.slice(0, 2)
        },
        attributes: e.attributes
      }))
    );

    // Convert transformed entities to features
    const features = await DxfEntityProcessor.entitiesToFeatures(transformedEntities);
    
    if (!features || features.length === 0) {
      console.warn('[DEBUG] No features after conversion');
      return [];
    }

    console.debug('[DEBUG] Features after conversion:', {
      count: features.length,
      types: features.map(f => f.geometry.type),
      samples: features.slice(0, 3).map(f => ({
        type: f.geometry.type,
        coordinates: f.geometry.coordinates,
        properties: f.properties
      }))
    });
    
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
      targetSystem: 'EPSG:4326',
      featureTypes: features.map(f => f.geometry.type)
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
      sourceSystem,
      sourceBoundsValid: bounds && 
        isFinite(bounds.minX) && isFinite(bounds.minY) &&
        isFinite(bounds.maxX) && isFinite(bounds.maxY),
      sourceBoundsRange: bounds ? {
        width: bounds.maxX - bounds.minX,
        height: bounds.maxY - bounds.minY,
        center: {
          x: (bounds.minX + bounds.maxX) / 2,
          y: (bounds.minY + bounds.maxY) / 2
        }
      } : null
    });

    // Transform min point
    const minPoint = await CoordinateSystemManager.transform(
      { x: bounds.minX, y: bounds.minY },
      sourceSystem,
      'EPSG:4326'
    );

    // Transform max point
    const maxPoint = await CoordinateSystemManager.transform(
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
      sourceSystem,
      transformedBoundsValid: 
        isFinite(transformedBounds.minX) && isFinite(transformedBounds.minY) &&
        isFinite(transformedBounds.maxX) && isFinite(transformedBounds.maxY),
      transformedBoundsRange: {
        width: transformedBounds.maxX - transformedBounds.minX,
        height: transformedBounds.maxY - transformedBounds.minY,
        center: {
          x: (transformedBounds.minX + transformedBounds.maxX) / 2,
          y: (transformedBounds.minY + transformedBounds.maxY) / 2
        }
      }
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
    const definition = CoordinateSystemManager.getSystemDefinition(system);
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
    return CoordinateSystemManager.getSystemDefinition(system)?.bounds;
  }
}
