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
    const entityRegex = /^0\s+(\w+)\s+([\s\S]*?)(?=^0\s+\w+|\Z)/gm;
    
    let match;
    while ((match = entityRegex.exec(content)) !== null) {
      try {
        const [, type, entityContent] = match;
        if (this.isValidEntityType(type)) {
          const entity = await this.parseEntity(type as DxfEntityType, entityContent);
          if (entity) {
            entities.push(entity);
          }
        }
      } catch (error) {
        console.warn('Failed to parse entity:', error);
      }
    }

    return entities;
  }

  /**
   * Convert DXF entities to GeoJSON features
   */
  async convertToFeatures(entities: DxfEntity[]): Promise<Feature[]> {
    const features: Feature[] = [];

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
        console.warn('Failed to convert entity:', error);
      }
    }

    return features;
  }

  /**
   * Parse a single DXF entity
   */
  private async parseEntity(type: DxfEntityType, content: string): Promise<DxfEntity | null> {
    const lines = content.split('\n').map(line => line.trim());
    const entity: Partial<DxfEntity> = {
      type,
      attributes: {},
      data: {}
    };

    for (let i = 0; i < lines.length; i++) {
      const code = parseInt(lines[i]);
      const value = lines[i + 1];
      
      if (isNaN(code)) continue;

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
        case 10: // X coordinate
          entity.data = {
            ...entity.data,
            x: parseFloat(value)
          };
          break;
        case 20: // Y coordinate
          entity.data = {
            ...entity.data,
            y: parseFloat(value)
          };
          break;
        case 30: // Z coordinate
          entity.data = {
            ...entity.data,
            z: parseFloat(value)
          };
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

    return entity as DxfEntity;
  }

  /**
   * Convert a DXF entity to a GeoJSON feature
   */
  private async entityToFeature(entity: DxfEntity): Promise<Feature | null> {
    try {
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
          return null;
      }

      if (!geometry) return null;

      // Validate geometry if required
      if (this.options.validateGeometry && !this.validateGeometry(geometry)) {
        throw new ValidationError(
          'Invalid geometry',
          'INVALID_GEOMETRY',
          undefined,
          { entity }
        );
      }

      return {
        type: 'Feature',
        geometry,
        properties
      };
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
    const vertices = entity.data.vertices as Array<{ x: number; y: number; z?: number }>;
    if (!vertices?.length) return null;

    const coordinates: Position[] = vertices.map(v => [
      v.x || 0,
      v.y || 0,
      v.z || 0
    ]);

    // Check if polyline is closed
    if (entity.data.closed) {
      // Add first point to close the polygon
      coordinates.push(coordinates[0]);
      return {
        type: 'Polygon',
        coordinates: [coordinates]
      };
    }

    return {
      type: 'LineString',
      coordinates
    };
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
