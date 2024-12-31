import { Feature, Point, LineString, Polygon, GeoJsonProperties } from 'geojson';
import { DxfEntity, DxfEntityType, DxfStructure } from '../types';
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
    } else if (!entity.attributes.layer) {
      console.log('[DEBUG] Adding default layer to entity attributes');
      entity.attributes.layer = '0';
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
      layer: entity.attributes.layer,
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
        layer: entity.attributes.layer,
        attributes: entity.attributes,
        dataKeys: Object.keys(entity.data)
      });

      switch (entity.type) {
        case 'POINT':
          if (typeof entity.data.x === 'number' && typeof entity.data.y === 'number') {
            const feature: Feature<Point, GeoJsonProperties> = {
              type: 'Feature' as const,
              geometry: {
                type: 'Point' as const,
                coordinates: [entity.data.x, entity.data.y]
              },
              properties: {
                type: entity.type,
                layer: entity.attributes.layer || '0',
                entityType: entity.type,
                ...entity.attributes
              }
            };
            return feature;
          }
          break;

        case 'LINE':
          if (typeof entity.data.x === 'number' && typeof entity.data.y === 'number' &&
              typeof entity.data.x2 === 'number' && typeof entity.data.y2 === 'number') {
            const feature: Feature<LineString, GeoJsonProperties> = {
              type: 'Feature' as const,
              geometry: {
                type: 'LineString' as const,
                coordinates: [
                  [entity.data.x, entity.data.y],
                  [entity.data.x2, entity.data.y2]
                ]
              },
              properties: {
                type: entity.type,
                layer: entity.attributes.layer || '0',
                entityType: entity.type,
                ...entity.attributes
              }
            };
            return feature;
          }
          break;

        case 'POLYLINE':
        case 'LWPOLYLINE':
          if (Array.isArray(entity.data.vertices)) {
            console.debug('[DEBUG] Processing LWPOLYLINE vertices:', {
              vertexCount: entity.data.vertices.length,
              transformed: entity.data.transformed,
              layer: entity.attributes?.layer
            });

            // Filter out invalid vertices and create coordinates
            const coordinates = entity.data.vertices
              .filter((v: any) => 
                typeof v.x === 'number' && 
                typeof v.y === 'number' && 
                isFinite(v.x) && 
                isFinite(v.y)
              )
              .map((v: any) => [v.x, v.y]);

            console.debug('[DEBUG] Valid coordinates extracted:', {
              inputVertices: entity.data.vertices.length,
              validCoordinates: coordinates.length,
              layer: entity.attributes?.layer
            });

            // Only proceed if we have enough valid coordinates
            if (coordinates.length >= 2) {
              // Check if the polyline forms a closed shape
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

                const feature: Feature<Polygon, GeoJsonProperties> = {
                  type: 'Feature' as const,
                  geometry: {
                    type: 'Polygon' as const,
                    coordinates: [coordinates]
                  },
                  properties: {
                    type: entity.type,
                    layer: entity.attributes.layer || '0',
                    entityType: entity.type,
                    transformed: entity.data.transformed || false,
                    ...entity.attributes
                  }
                };

                console.debug('[DEBUG] Created Polygon feature:', {
                  coordinates: coordinates.length,
                  layer: entity.attributes?.layer,
                  transformed: entity.data.transformed
                });

                return feature;
              } else {
                const feature: Feature<LineString, GeoJsonProperties> = {
                  type: 'Feature' as const,
                  geometry: {
                    type: 'LineString' as const,
                    coordinates: coordinates
                  },
                  properties: {
                    type: entity.type,
                    layer: entity.attributes.layer || '0',
                    entityType: entity.type,
                    transformed: entity.data.transformed || false,
                    ...entity.attributes
                  }
                };

                console.debug('[DEBUG] Created LineString feature:', {
                  coordinates: coordinates.length,
                  layer: entity.attributes?.layer,
                  transformed: entity.data.transformed
                });

                return feature;
              }
            } else {
              console.warn('[DEBUG] Insufficient valid coordinates for feature:', {
                type: entity.type,
                validCoordinates: coordinates.length,
                layer: entity.attributes?.layer
              });
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
            const feature: Feature<Polygon, GeoJsonProperties> = {
              type: 'Feature' as const,
              geometry: {
                type: 'Polygon' as const,
                coordinates: [coordinates]
              },
              properties: {
                type: entity.type,
                layer: entity.attributes.layer || '0',
                entityType: entity.type,
                ...entity.attributes
              }
            };
            return feature;
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
            const feature: Feature<LineString, GeoJsonProperties> = {
              type: 'Feature' as const,
              geometry: {
                type: 'LineString' as const,
                coordinates: coordinates
              },
              properties: {
                type: entity.type,
                layer: entity.attributes.layer || '0',
                entityType: entity.type,
                ...entity.attributes
              }
            };
            return feature;
          }
          break;

        case 'TEXT':
        case 'MTEXT':
          if (typeof entity.data.x === 'number' && 
              typeof entity.data.y === 'number' &&
              typeof entity.data.text === 'string') {
            const feature: Feature<Point, GeoJsonProperties> = {
              type: 'Feature' as const,
              geometry: {
                type: 'Point' as const,
                coordinates: [entity.data.x, entity.data.y]
              },
              properties: {
                type: entity.type,
                layer: entity.attributes.layer || '0',
                entityType: entity.type,
                text: entity.data.text,
                height: entity.data.height,
                rotation: entity.data.rotation,
                width: entity.data.width,
                ...entity.attributes
              }
            };
            return feature;
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

    // Log unique layers for debugging
    const layers = new Set(features.map(f => f.properties?.layer));
    console.log('[DEBUG] Conversion complete:', {
      input: entities.length,
      output: features.length,
      types: Array.from(new Set(features.map(f => f.geometry.type))),
      layers: Array.from(layers)
    });

    return features;
  }

  /**
   * Extract all entities from DXF structure
   */
  static async extractEntities(structure: DxfStructure): Promise<DxfEntity[]> {
    const entities: DxfEntity[] = [];
    
    console.debug('[DEBUG] Extracting entities from structure');

    // Extract main entities
    if (structure.entities) {
      console.debug('[DEBUG] Processing main entities:', structure.entities.length);
      entities.push(...structure.entities.filter(e => this.validateEntity(e)));
    }

    // Extract block entities
    if (structure.blocks) {
      console.debug('[DEBUG] Processing blocks:', structure.blocks.length);
      for (const block of structure.blocks) {
        if (block.entities) {
          const validEntities = block.entities.filter(e => this.validateEntity(e));
          console.debug(`[DEBUG] Block ${block.name}: ${validEntities.length} valid entities`);
          entities.push(...validEntities);
        }
      }
    }

    console.debug('[DEBUG] Total entities extracted:', {
      total: entities.length,
      types: entities.reduce((acc, e) => {
        acc[e.type] = (acc[e.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    });

    return entities;
  }
}
