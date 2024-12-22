import { Feature, Point, LineString, Polygon, Position } from 'geojson';
import { DxfEntity, DxfEntityType } from '../types';
import { ValidationError } from '../../../../errors/types';
import { LayerManager } from './layer-manager';
import { BlockManager } from './block-manager';

interface EntityParserOptions {
  validateGeometry?: boolean;
  preserveColors?: boolean;
  preserveLineWeights?: boolean;
  coordinateSystem?: string;
}

/**
 * Handles parsing and conversion of DXF entities to GeoJSON features
 */
export class EntityParser {
  private layerManager: LayerManager;
  private blockManager: BlockManager;
  private options: EntityParserOptions;

  constructor(
    layerManager: LayerManager,
    blockManager: BlockManager,
    options: EntityParserOptions = {}
  ) {
    this.layerManager = layerManager;
    this.blockManager = blockManager;
    this.options = options;
  }

  /**
   * Parse DXF entities from content
   */
  async parseEntities(content: string): Promise<DxfEntity[]> {
    const entities: DxfEntity[] = [];
    
    try {
      // Find ENTITIES section
      const entitiesMatch = content.match(/^0[\s\r\n]+SECTION[\s\r\n]+2[\s\r\n]+ENTITIES([\s\S]*?)^0[\s\r\n]+ENDSEC/m);
      if (!entitiesMatch) {
        console.warn('[DEBUG] No ENTITIES section found');
        return entities;
      }
      
      // Parse entities within ENTITIES section
      const entityRegex = /^0[\s\r\n]+(\w+)([\s\S]*?)(?=^0[\s\r\n]+(?:\w+|ENDSEC)|\Z)/gm;
      const entitiesContent = entitiesMatch[1];
      
      console.log('[DEBUG] Found ENTITIES section, content:', {
        length: entitiesContent.length,
        sample: entitiesContent.substring(0, 100) + '...'
      });
      
      let match: RegExpExecArray | null;
      while ((match = entityRegex.exec(entitiesContent)) !== null) {
        try {
          const [, type, entityContent] = match;
          if (this.isValidEntityType(type)) {
            console.log('[DEBUG] Parsing entity:', type);
            const entity = await this.parseEntity(type, entityContent);
            if (entity) {
              console.log('[DEBUG] Successfully parsed entity:', type);
              entities.push(entity);
            }
          }
        } catch (error) {
          console.warn('Failed to parse entity:', error instanceof Error ? error.message : String(error));
        }
      }

      console.log('[DEBUG] Total entities parsed:', entities.length);
      return entities;
    } catch (error) {
      console.error('[DEBUG] Error parsing entities:', error instanceof Error ? error.message : String(error));
      return entities;
    }
  }

  /**
   * Convert DXF entities to GeoJSON features
   */
  async convertToFeatures(entities: DxfEntity[]): Promise<Feature[]> {
    const features: Feature[] = [];
    console.log('[DEBUG] Converting entities to features:', entities.length);

    try {
      for (const entity of entities) {
        try {
          // Skip entities on frozen or invisible layers
          if (!this.layerManager.shouldProcessEntity(entity)) {
            continue;
          }

          const feature = await this.entityToFeature(entity);
          if (feature) {
            features.push(feature);
          }
        } catch (error) {
          console.warn('[DEBUG] Failed to convert entity:', {
            type: entity.type,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      console.log('[DEBUG] Successfully converted features:', features.length);
      return features;
    } catch (error) {
      console.error('[DEBUG] Error converting entities to features:', error instanceof Error ? error.message : String(error));
      return features;
    }
  }

  /**
   * Parse a single DXF entity
   */
  private async parseEntity(type: DxfEntityType, content: string): Promise<DxfEntity | null> {
    try {
      // Clean up content - remove comments and normalize whitespace
      content = content
        .replace(/#.*$/gm, '') // Remove comments
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();
      
      // Split into lines, handling both \r\n and \n
      const lines = content.split(/\r?\n/).map(line => line.trim()).filter(line => {
        // Filter out empty lines and comment lines
        return line && !line.startsWith('#');
      });
      console.log('[DEBUG] Parsing entity:', {
        type,
        lineCount: lines.length,
        firstLine: lines[0],
        content: content.substring(0, 100)
      });

      const entity: Partial<DxfEntity> = {
        type,
        attributes: {},
        data: {}
      };

      // For LWPOLYLINE, we need to collect vertices
      const vertices: Array<{x: number, y: number, z?: number, bulge?: number}> = [];
      let currentVertex: {x?: number, y?: number, z?: number, bulge?: number} = {};
      let vertexCount = 0;
      let expectedVertexCount = 0;

      // First pass: find vertex count and closed flag
      if (type === 'LWPOLYLINE') {
        for (const line of lines) {
          const code = parseInt(line);
          if (code === 90) { // Vertex count
            expectedVertexCount = parseInt(lines[lines.indexOf(line) + 1]);
            break;
          }
        }
        console.log('[DEBUG] LWPOLYLINE expected vertices:', expectedVertexCount);
      }

      // Second pass: collect vertices
      for (let i = 0; i < lines.length - 1; i++) {
        console.log('[DEBUG] Processing line:', {
          index: i,
          line: lines[i],
          nextLine: lines[i + 1]
        });
        const code = parseInt(lines[i].trim());
        const value = lines[i + 1].trim();
        
        if (isNaN(code)) {
          console.warn('[DEBUG] Invalid group code:', {
            line: lines[i],
            index: i,
            content: lines[i]
          });
          continue;
        }
        
        if (!value) {
          console.warn('[DEBUG] Missing value for code:', {
            code,
            index: i + 1,
            nextLine: lines[i + 1]
          });
          continue;
        }

      switch (code) {
        // Common group codes
        case 8: // Layer name
          entity.attributes = {
            ...entity.attributes,
            layer: value
          };
          break;
        case 6: // Line type name
          entity.attributes = {
            ...entity.attributes,
            lineType: value
          };
          break;
        case 62: // Color number
          entity.attributes = {
            ...entity.attributes,
            color: parseInt(value)
          };
          break;
        case 370: // Line weight
          entity.attributes = {
            ...entity.attributes,
            lineWeight: parseInt(value)
          };
          break;

        // Entity-specific group codes
        case 70: // Flags for LWPOLYLINE
          if (type === 'LWPOLYLINE') {
            entity.data = {
              ...entity.data,
              closed: (parseInt(value) & 1) === 1
            };
          }
          break;
        case 90: // Vertex count for LWPOLYLINE
          if (type === 'LWPOLYLINE') {
            entity.data = {
              ...entity.data,
              vertexCount: parseInt(value)
            };
          }
          break;
        case 10: // X coordinate
          if (type === 'LWPOLYLINE') {
            const x = parseFloat(value);
            if (!isNaN(x)) {
              // Complete previous vertex if exists
              if (currentVertex.x !== undefined && currentVertex.y !== undefined) {
                vertices.push({ ...currentVertex } as {x: number, y: number});
                vertexCount++;
                console.log('[DEBUG] Added vertex:', vertices[vertices.length - 1]);
              }
              currentVertex = { x };
            } else {
              console.warn('[DEBUG] Invalid X coordinate:', value);
            }
          } else {
            entity.data = {
              ...entity.data,
              x: parseFloat(value)
            };
          }
          break;
        case 20: // Y coordinate
          if (type === 'LWPOLYLINE') {
            const y = parseFloat(value);
            if (!isNaN(y) && currentVertex.x !== undefined) {
              currentVertex.y = y;
              console.log('[DEBUG] Added Y to current vertex:', currentVertex);
            } else {
              console.warn('[DEBUG] Invalid Y coordinate or missing X:', {
                y: value,
                currentVertex
              });
            }
          } else {
            entity.data = {
              ...entity.data,
              y: parseFloat(value)
            };
          }
          break;
        case 30: // Z coordinate
          if (type === 'LWPOLYLINE') {
            const z = parseFloat(value);
            if (!isNaN(z) && currentVertex.x !== undefined && currentVertex.y !== undefined) {
              currentVertex.z = z;
              console.log('[DEBUG] Added Z to current vertex:', currentVertex);
            } else {
              console.warn('[DEBUG] Invalid Z coordinate or incomplete vertex:', {
                z: value,
                currentVertex
              });
            }
          } else {
            entity.data = {
              ...entity.data,
              z: parseFloat(value)
            };
          }
          break;

        case 42: // Bulge (for LWPOLYLINE arcs)
          if (type === 'LWPOLYLINE') {
            const bulge = parseFloat(value);
            if (!isNaN(bulge)) {
              currentVertex.bulge = bulge;
              console.log('[DEBUG] Added bulge to current vertex:', currentVertex);
            }
          }
          break;
        case 40: // Radius, size, or scale
          entity.data = {
            ...entity.data,
            radius: parseFloat(value)
          };
          break;
        case 50: // Angle or rotation
          entity.data = {
            ...entity.data,
            angle: parseFloat(value)
          };
          break;
        case 2: // Block name (for INSERT)
          if (type === 'INSERT') {
            entity.blockName = value;
          }
          break;
      }
      i++; // Skip value line
    }

      // Add the last vertex if complete
      if (type === 'LWPOLYLINE' && currentVertex.x !== undefined && currentVertex.y !== undefined) {
        vertices.push({ ...currentVertex } as {x: number, y: number});
        vertexCount++;
      }

      // Add collected vertices for LWPOLYLINE
      if (type === 'LWPOLYLINE' && vertices.length > 0) {
        entity.data = {
          ...entity.data,
          vertices
        };
      }

      console.log('[DEBUG] Parsed entity:', {
        type,
        attributes: entity.attributes,
        dataKeys: Object.keys(entity.data || {}),
        vertexCount: type === 'LWPOLYLINE' ? vertices.length : undefined
      });

      return entity as DxfEntity;
    } catch (error) {
      console.error('[DEBUG] Error parsing entity:', {
        type,
        error,
        content: content.substring(0, 100) + '...'
      });
      return null;
    }
  }

  /**
   * Convert a DXF entity to a GeoJSON feature
   */
  private async entityToFeature(entity: DxfEntity): Promise<Feature | null> {
    try {
      console.log('[DEBUG] Converting entity to feature:', {
        type: entity.type,
        layer: entity.attributes.layer,
        hasData: !!entity.data
      });

      let geometry;
      let properties = this.getEntityProperties(entity);

      switch (entity.type) {
        case 'POINT':
          geometry = this.pointToGeometry(entity);
          break;
        case 'LINE':
          geometry = this.lineToGeometry(entity);
          break;
        case 'POLYLINE':
        case 'LWPOLYLINE':
          geometry = this.polylineToGeometry(entity);
          break;
        case 'CIRCLE':
          geometry = this.circleToGeometry(entity);
          break;
        case 'ARC':
          geometry = this.arcToGeometry(entity);
          break;
        case 'INSERT':
          return this.handleBlockReference(entity);
        default:
          console.warn('[DEBUG] Unsupported entity type:', entity.type);
          return null;
      }

      if (!geometry) {
        console.warn('[DEBUG] No geometry generated for entity:', {
          type: entity.type,
          data: entity.data
        });
        return null;
      }

      // Ensure geometry type is properly set in properties
      properties = {
        ...properties,
        geometryType: geometry.type,
        entityType: entity.type
      };

      console.log('[DEBUG] Created feature:', {
        type: entity.type,
        geometryType: geometry.type,
        coordinates: geometry.coordinates.length
      });

      // Validate geometry if required
      if (this.options.validateGeometry && !this.validateGeometry(geometry)) {
        throw new ValidationError(
          'Invalid geometry',
          'INVALID_GEOMETRY',
          undefined,
          { entity }
        );
      }

      const feature = {
        type: 'Feature' as const,
        geometry,
        properties
      };

      console.log('[DEBUG] Final feature:', {
        type: feature.type,
        geometryType: feature.geometry.type,
        properties: feature.properties
      });

      return feature;
    } catch (error) {
      console.warn('Failed to convert entity to feature:', error);
      return null;
    }
  }

  /**
   * Get entity properties including layer properties
   */
  private getEntityProperties(entity: DxfEntity): Record<string, unknown> {
    const layerProps = this.layerManager.getLayerProperties(entity);
    const properties: Record<string, unknown> = {
      entityType: entity.type,
      layer: entity.attributes.layer || '0'
    };

    // Add color if preserving colors
    if (this.options.preserveColors) {
      properties.color = entity.attributes.color || layerProps.color;
    }

    // Add line weight if preserving line weights
    if (this.options.preserveLineWeights) {
      properties.lineWeight = entity.attributes.lineWeight || layerProps.lineWeight;
    }

    // Add line type
    properties.lineType = entity.attributes.lineType || layerProps.lineType;

    return properties;
  }

  /**
   * Convert point entity to GeoJSON geometry
   */
  private pointToGeometry(entity: DxfEntity): Point | null {
    const x = entity.data.x ?? 0;
    const y = entity.data.y ?? 0;
    const z = entity.data.z ?? 0;

    if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') {
      return null;
    }

    return {
      type: 'Point',
      coordinates: [x, y, z]
    };
  }

  /**
   * Convert line entity to GeoJSON geometry
   */
  private lineToGeometry(entity: DxfEntity): LineString | null {
    const x1 = entity.data.x ?? 0;
    const y1 = entity.data.y ?? 0;
    const z1 = entity.data.z ?? 0;
    const x2 = entity.data.x2 ?? 0;
    const y2 = entity.data.y2 ?? 0;
    const z2 = entity.data.z2 ?? 0;

    if (
      typeof x1 !== 'number' || typeof y1 !== 'number' || typeof z1 !== 'number' ||
      typeof x2 !== 'number' || typeof y2 !== 'number' || typeof z2 !== 'number'
    ) {
      return null;
    }
    
    return {
      type: 'LineString',
      coordinates: [
        [x1, y1, z1],
        [x2, y2, z2]
      ]
    };
  }

  /**
   * Convert polyline entity to GeoJSON geometry
   */
  private polylineToGeometry(entity: DxfEntity): LineString | Polygon | null {
    console.log('[DEBUG] Converting polyline to geometry:', {
      type: entity.type,
      hasVertices: entity.data.vertices?.length || 0,
      isClosed: entity.data.closed,
      data: entity.data
    });

    const vertices = entity.data.vertices as Array<{ x: number; y: number; z?: number }>;
    if (!vertices?.length) {
      console.warn('[DEBUG] No vertices found for polyline');
      return null;
    }

    const coordinates: Position[] = vertices.map(v => {
      const coord = [v.x || 0, v.y || 0, v.z || 0];
      console.log('[DEBUG] Vertex coordinate:', coord);
      return coord;
    });

    // Check if polyline is closed
    if (entity.data.closed) {
      console.log('[DEBUG] Creating closed polygon');
      // Add first point to close the polygon
      coordinates.push(coordinates[0]);
      const polygon = {
        type: 'Polygon' as const,
        coordinates: [coordinates]
      };
      console.log('[DEBUG] Created polygon:', polygon);
      return polygon;
    }

    console.log('[DEBUG] Creating line string');
    const lineString = {
      type: 'LineString' as const,
      coordinates
    };
    console.log('[DEBUG] Created line string:', lineString);
    return lineString;
  }

  /**
   * Convert circle entity to GeoJSON geometry
   */
  private circleToGeometry(entity: DxfEntity): Polygon | null {
    const x = entity.data.x ?? 0;
    const y = entity.data.y ?? 0;
    const z = entity.data.z ?? 0;
    const radius = entity.data.radius ?? 0;

    if (
      typeof x !== 'number' || typeof y !== 'number' || 
      typeof z !== 'number' || typeof radius !== 'number'
    ) {
      return null;
    }

    const segments = 32; // Number of segments to approximate circle
    const coordinates: Position[] = [];
    
    for (let i = 0; i <= segments; i++) {
      const angle = (i * 2 * Math.PI) / segments;
      coordinates.push([
        x + radius * Math.cos(angle),
        y + radius * Math.sin(angle),
        z
      ]);
    }

    return {
      type: 'Polygon',
      coordinates: [coordinates]
    };
  }

  /**
   * Convert arc entity to GeoJSON geometry
   */
  private arcToGeometry(entity: DxfEntity): LineString | null {
    const x = entity.data.x ?? 0;
    const y = entity.data.y ?? 0;
    const z = entity.data.z ?? 0;
    const radius = entity.data.radius ?? 0;
    const startAngle = (entity.data.startAngle ?? 0) * (Math.PI / 180);
    const endAngle = (entity.data.endAngle ?? 0) * (Math.PI / 180);

    if (
      typeof x !== 'number' || typeof y !== 'number' || 
      typeof z !== 'number' || typeof radius !== 'number' ||
      typeof startAngle !== 'number' || typeof endAngle !== 'number'
    ) {
      return null;
    }

    const segments = 32; // Number of segments to approximate arc
    const coordinates: Position[] = [];
    const angleRange = endAngle - startAngle;
    
    for (let i = 0; i <= segments; i++) {
      const angle = startAngle + (i * angleRange) / segments;
      coordinates.push([
        x + radius * Math.cos(angle),
        y + radius * Math.sin(angle),
        z
      ]);
    }

    return {
      type: 'LineString',
      coordinates
    };
  }

  /**
   * Handle block reference (INSERT entity)
   */
  private async handleBlockReference(entity: DxfEntity): Promise<Feature | null> {
    try {
      const features = await this.blockManager.processBlockReference(entity);
      if (features.length === 0) return null;

      // If only one feature, return it with INSERT properties
      if (features.length === 1) {
        const feature = features[0];
        feature.properties = {
          ...feature.properties,
          ...this.getEntityProperties(entity)
        };
        return feature;
      }

      // If multiple features, return the first one and add count to properties
      const feature = features[0];
      feature.properties = {
        ...feature.properties,
        ...this.getEntityProperties(entity),
        blockFeatureCount: features.length
      };
      return feature;
    } catch (error) {
      console.warn('Failed to process block reference:', error);
      return null;
    }
  }

  /**
   * Validate geometry coordinates
   */
  private validateGeometry(geometry: Point | LineString | Polygon): boolean {
    if (!geometry || !geometry.coordinates) return false;

    const validateCoordinate = (coord: number[]): boolean => {
      return (
        Array.isArray(coord) &&
        coord.length >= 2 &&
        coord.every(n => typeof n === 'number' && !isNaN(n))
      );
    };

    switch (geometry.type) {
      case 'Point':
        return validateCoordinate(geometry.coordinates);
      case 'LineString':
        return (
          Array.isArray(geometry.coordinates) &&
          geometry.coordinates.length >= 2 &&
          geometry.coordinates.every(validateCoordinate)
        );
      case 'Polygon':
        return (
          Array.isArray(geometry.coordinates) &&
          geometry.coordinates.length > 0 &&
          geometry.coordinates.every((ring: Position[]) =>
            Array.isArray(ring) &&
            ring.length >= 4 &&
            ring.every(validateCoordinate) &&
            JSON.stringify(ring[0]) === JSON.stringify(ring[ring.length - 1])
          )
        );
      default:
        return false;
    }
  }

  /**
   * Check if entity type is valid
   */
  private isValidEntityType(type: string): type is DxfEntityType {
    return [
      'POINT',
      'LINE',
      'POLYLINE',
      'LWPOLYLINE',
      'CIRCLE',
      'ARC',
      'ELLIPSE',
      'INSERT',
      'TEXT',
      'MTEXT',
      'DIMENSION'
    ].includes(type);
  }
}
