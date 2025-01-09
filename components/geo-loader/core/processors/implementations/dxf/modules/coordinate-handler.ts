import { CoordinateSystem } from '../../../../../types/coordinates';
import { coordinateSystemManager } from '../../../../coordinate-systems/coordinate-system-manager';
import { DxfEntity } from '../types';
import { DxfTransformer } from './transformer';
import { DxfEntityProcessor } from './entity-processor';
import { Feature, Point, LineString, Polygon } from 'geojson';

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
      samples: features.slice(0, 3).map(f => {
        const sample: { type: string; coordinates?: any; properties?: any } = {
          type: f.geometry.type,
          properties: f.properties
        };

        // Handle different geometry types appropriately
        switch (f.geometry.type) {
          case 'Point':
            sample.coordinates = (f.geometry as Point).coordinates;
            break;
          case 'LineString':
            sample.coordinates = (f.geometry as LineString).coordinates;
            break;
          case 'Polygon':
            sample.coordinates = (f.geometry as Polygon).coordinates;
            break;
          default:
            // For other geometry types, omit coordinates
            break;
        }

        return sample;
      })
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
    // Note: Coordinate range validation is not currently supported
    // This could be implemented in the future when coordinate system definitions include bounds
    return true;
  }
}
