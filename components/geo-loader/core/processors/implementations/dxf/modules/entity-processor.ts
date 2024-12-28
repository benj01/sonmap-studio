import { Feature } from 'geojson';
import { DxfEntity, DxfEntityType } from '../types';
import { ValidationError } from '../../../../errors/types';

export class DxfEntityProcessor {
  /**
   * Validate and normalize entity data
   */
  static validateEntity(entity: any): entity is DxfEntity {
    // Basic structure check
    if (!entity || typeof entity !== 'object') {
      console.warn('[DEBUG] Invalid entity (not an object):', entity);
      return false;
    }

    // Type check
    if (!('type' in entity) || !this.isValidEntityType(entity.type)) {
      console.warn('[DEBUG] Invalid entity type:', entity?.type);
      return false;
    }

    // Initialize missing properties with defaults
    if (!('attributes' in entity) || !entity.attributes) {
      console.log('[DEBUG] Adding default attributes to entity');
      entity.attributes = { layer: '0' };
    }

    if (!('data' in entity) || !entity.data) {
      console.log('[DEBUG] Adding empty data object to entity');
      entity.data = {};
    }

    // Special handling for LWPOLYLINE
    if (entity.type === 'LWPOLYLINE') {
      if (!entity.data.vertices || !Array.isArray(entity.data.vertices)) {
        console.warn('[DEBUG] LWPOLYLINE missing vertices array:', entity);
        return false;
      }
      
      // Validate vertex structure
      const hasInvalidVertex = entity.data.vertices.some((vertex: any) => {
        const valid = typeof vertex === 'object' && 
                     typeof vertex.x === 'number' && 
                     typeof vertex.y === 'number';
        if (!valid) {
          console.warn('[DEBUG] Invalid LWPOLYLINE vertex:', vertex);
        }
        return !valid;
      });
      
      if (hasInvalidVertex) {
        console.warn('[DEBUG] LWPOLYLINE has invalid vertices');
        return false;
      }

      if (entity.data.vertices.length < 2) {
        console.warn('[DEBUG] LWPOLYLINE has insufficient vertices:', entity.data.vertices.length);
        return false;
      }
    }

    // Log validation result
    console.log('[DEBUG] Validated entity:', {
      type: entity.type,
      hasAttributes: 'attributes' in entity,
      hasData: 'data' in entity,
      dataKeys: entity.data ? Object.keys(entity.data) : [],
      vertexCount: entity.type === 'LWPOLYLINE' ? entity.data.vertices?.length : undefined
    });
    
    return true;
  }

  /**
   * Type guard for entity types
   */
  private static isValidEntityType(type: string): type is DxfEntityType {
    return [
      'POINT', 'LINE', 'POLYLINE', 'LWPOLYLINE', 'CIRCLE', 'ARC', 'ELLIPSE',
      'INSERT', 'TEXT', 'MTEXT', 'DIMENSION', 'SPLINE', 'HATCH', 'SOLID', 'FACE3D'
    ].includes(type);
  }

  /**
   * Convert entity to GeoJSON feature
   */
  static entityToFeature(entity: DxfEntity): Feature | null {
    try {
      console.log('[DEBUG] Converting entity to feature:', {
        type: entity.type,
        hasVertices: 'vertices' in entity.data,
        vertexCount: Array.isArray(entity.data.vertices) ? entity.data.vertices.length : 0,
        attributes: entity.attributes,
        dataKeys: Object.keys(entity.data)
      });

      switch (entity.type) {
        case 'POINT':
          if (typeof entity.data.x === 'number' && typeof entity.data.y === 'number') {
            return {
              type: 'Feature',
              geometry: {
                type: 'Point',
                coordinates: [entity.data.x, entity.data.y]
              },
              properties: {
                type: entity.type,
                ...entity.attributes
              }
            };
          }
          break;

        case 'LINE':
          if (typeof entity.data.x === 'number' && typeof entity.data.y === 'number' &&
              typeof entity.data.x2 === 'number' && typeof entity.data.y2 === 'number') {
            return {
              type: 'Feature',
              geometry: {
                type: 'LineString',
                coordinates: [
                  [entity.data.x, entity.data.y],
                  [entity.data.x2, entity.data.y2]
                ]
              },
              properties: {
                type: entity.type,
                ...entity.attributes
              }
            };
          }
          break;

        case 'POLYLINE':
        case 'LWPOLYLINE':
          if (Array.isArray(entity.data.vertices)) {
            const coordinates = entity.data.vertices.map((v: any) => [v.x, v.y]);
            if (coordinates.length >= 2) {
              const isClosed = entity.data.closed || 
                             (coordinates.length >= 3 && 
                              coordinates[0][0] === coordinates[coordinates.length - 1][0] &&
                              coordinates[0][1] === coordinates[coordinates.length - 1][1]);
              
              if (isClosed && coordinates.length >= 3) {
                // Ensure polygon is properly closed
                if (coordinates[0][0] !== coordinates[coordinates.length - 1][0] ||
                    coordinates[0][1] !== coordinates[coordinates.length - 1][1]) {
                  coordinates.push([...coordinates[0]]);
                }
                return {
                  type: 'Feature',
                  geometry: {
                    type: 'Polygon',
                    coordinates: [coordinates]
                  },
                  properties: {
                    type: entity.type,
                    ...entity.attributes
                  }
                };
              } else {
                return {
                  type: 'Feature',
                  geometry: {
                    type: 'LineString',
                    coordinates: coordinates
                  },
                  properties: {
                    type: entity.type,
                    ...entity.attributes
                  }
                };
              }
            }
          }
          break;

        case 'CIRCLE':
          if (typeof entity.data.x === 'number' && 
              typeof entity.data.y === 'number' && 
              typeof entity.data.radius === 'number') {
            const points = 32;
            const coordinates = [];
            for (let i = 0; i <= points; i++) {
              const angle = (i / points) * Math.PI * 2;
              coordinates.push([
                entity.data.x + Math.cos(angle) * entity.data.radius,
                entity.data.y + Math.sin(angle) * entity.data.radius
              ]);
            }
            return {
              type: 'Feature',
              geometry: {
                type: 'Polygon',
                coordinates: [coordinates]
              },
              properties: {
                type: entity.type,
                ...entity.attributes
              }
            };
          }
          break;

        case 'ARC':
          if (typeof entity.data.x === 'number' && 
              typeof entity.data.y === 'number' && 
              typeof entity.data.radius === 'number' &&
              typeof entity.data.startAngle === 'number' &&
              typeof entity.data.endAngle === 'number') {
            const points = 32;
            const coordinates = [];
            const startAngle = (entity.data.startAngle * Math.PI) / 180;
            const endAngle = (entity.data.endAngle * Math.PI) / 180;
            const angleRange = endAngle - startAngle;
            for (let i = 0; i <= points; i++) {
              const angle = startAngle + (i / points) * angleRange;
              coordinates.push([
                entity.data.x + Math.cos(angle) * entity.data.radius,
                entity.data.y + Math.sin(angle) * entity.data.radius
              ]);
            }
            return {
              type: 'Feature',
              geometry: {
                type: 'LineString',
                coordinates: coordinates
              },
              properties: {
                type: entity.type,
                ...entity.attributes
              }
            };
          }
          break;

        case 'TEXT':
        case 'MTEXT':
          if (typeof entity.data.x === 'number' && 
              typeof entity.data.y === 'number' &&
              typeof entity.data.text === 'string') {
            return {
              type: 'Feature',
              geometry: {
                type: 'Point',
                coordinates: [entity.data.x, entity.data.y]
              },
              properties: {
                type: entity.type,
                text: entity.data.text,
                height: entity.data.height,
                rotation: entity.data.rotation,
                width: entity.data.width,
                ...entity.attributes
              }
            };
          }
          break;
      }
    } catch (error) {
      console.warn('[DEBUG] Failed to convert entity to feature:', error);
    }
    return null;
  }

  /**
   * Convert multiple entities to features
   */
  static entitiesToFeatures(entities: DxfEntity[]): Feature[] {
    console.log('[DEBUG] Converting entities to features:', entities.length);
    
    const features = entities
      .map(entity => this.entityToFeature(entity))
      .filter((feature): feature is Feature => feature !== null);

    console.log('[DEBUG] Conversion complete:', {
      input: entities.length,
      output: features.length,
      types: Array.from(new Set(features.map(f => f.geometry.type)))
    });

    return features;
  }
}
