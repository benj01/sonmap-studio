import { Feature, Geometry } from 'geojson';
import { DxfStructure, DxfAnalyzeResult, DxfEntity, DxfBlock, DxfLayer, DxfEntityType, Vector3 } from '../types';
import { ValidationError } from '../../../../errors/types';
import { validateStructure, validateBlock, validateEntityData } from '../utils/validation/structure-validator';

/**
 * Convert point coordinates to [number, number, number] tuple
 */
function toPoint3d(point: { x: number; y: number; z?: number }): [number, number, number] {
  return [point.x, point.y, point.z || 0];
}

/**
 * Type guard for point coordinates
 */
function isValidPoint(point: any): point is { x: number; y: number; z?: number } {
  return typeof point === 'object' && 
         point !== null &&
         typeof point.x === 'number' &&
         typeof point.y === 'number' &&
         (point.z === undefined || typeof point.z === 'number');
}

/**
 * Wrapper for dxf-parser library to maintain compatibility with our system
 */
export class DxfParserWrapper {
  private parser: any | null = null;
  private static instance: DxfParserWrapper | null = null;

  private constructor() {
    // Private constructor for singleton pattern
  }

  /**
   * Get singleton instance of DxfParserWrapper
   */
  public static getInstance(): DxfParserWrapper {
    if (!DxfParserWrapper.instance) {
      DxfParserWrapper.instance = new DxfParserWrapper();
    }
    return DxfParserWrapper.instance;
  }

  /**
   * Initialize the parser
   */
  private async initializeParser(): Promise<void> {
    if (this.parser) return;

    try {
      // Check if we're in browser environment
      if (typeof window === 'undefined') {
        throw new Error('DXF parser can only be used in browser environment');
      }

      // Dynamic import for Next.js compatibility
      const DxfParser = await new Promise<any>((resolve, reject) => {
        // Use dynamic import with webpack magic comments
        import(/* webpackChunkName: "dxf-parser" */ 'dxf-parser')
          .then(module => resolve(module.default || module))
          .catch(error => {
            console.error('[DEBUG] Failed to load dxf-parser module:', error);
            reject(new Error('Failed to load DXF parser module'));
          });
      });
      
      if (typeof DxfParser !== 'function') {
        throw new Error('Invalid DXF parser module');
      }

      this.parser = new DxfParser();
      console.log('[DEBUG] DxfParserWrapper initialized with parser instance:', {
        parserType: typeof this.parser,
        hasParseSync: typeof this.parser.parseSync === 'function'
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[DEBUG] Failed to initialize DxfParser:', {
        error: message,
        environment: typeof window !== 'undefined' ? 'browser' : 'server',
        errorStack: error instanceof Error ? error.stack : undefined
      });
      throw new ValidationError(
        `Failed to initialize DXF parser: ${message}`,
        'DXF_PARSER_INIT_ERROR',
        undefined,
        { 
          error: message,
          environment: typeof window !== 'undefined' ? 'browser' : 'server'
        }
      );
    }
  }

  /**
   * Parse DXF content with enhanced error handling
   */
  async parse(content: string): Promise<DxfStructure> {
    // Ensure parser is initialized
    await this.initializeParser();
    try {
      console.log('[DEBUG] Parsing content length:', content.length);
      console.log('[DEBUG] Content preview:', content.substring(0, 200));
      
      if (!this.parser || typeof this.parser.parseSync !== 'function') {
        throw new Error('Parser not properly initialized');
      }

      const dxf = this.parser.parseSync(content);
      
      if (!dxf || typeof dxf !== 'object') {
        throw new Error('Parser returned invalid data');
      }
      console.log('[DEBUG] Raw DXF structure:', {
        header: dxf.header ? Object.keys(dxf.header).length : 0,
        tables: dxf.tables ? Object.keys(dxf.tables).length : 0,
        blocks: dxf.blocks ? Object.keys(dxf.blocks).length : 0,
        entities: dxf.entities ? dxf.entities.length : 0
      });

      // Extract and validate entities from blocks and main entities
      const allEntities = [
        ...(dxf.entities || []),
        ...Object.values(dxf.blocks || {}).flatMap((block: any) => block.entities || [])
      ];

      console.log('[DEBUG] All entities:', {
        total: allEntities.length,
        types: Array.from(new Set(allEntities.map((e: any) => e.type)))
      });

      // Convert to our structure format
      const structure: DxfStructure = {
        layers: this.convertLayers(dxf.tables?.layer || {}),
        blocks: this.convertBlocks(dxf.blocks || {}),
        entityTypes: this.getEntityTypes(allEntities),
        extents: this.getExtents(dxf.header),
        units: this.getUnits(dxf.header)
      };

      // Validate the converted structure
      const issues = validateStructure(structure);
      if (issues.length > 0) {
        console.warn('[DEBUG] Structure validation issues:', issues);
        throw new ValidationError(
          'DXF structure validation failed',
          'DXF_STRUCTURE_VALIDATION',
          undefined,
          { issues }
        );
      }

      return structure;
    } catch (error) {
      console.error('[DEBUG] Parse error:', error);
      throw new ValidationError(
        `Failed to parse DXF content: ${error instanceof Error ? error.message : String(error)}`,
        'DXF_PARSE_ERROR'
      );
    }
  }


  /**
   * Convert dxf-parser layers to our format with validation
   */
  private convertLayers(layers: Record<string, any>): DxfLayer[] {
    const converted = Object.entries(layers).map(([name, layer]) => {
      const dxfLayer: DxfLayer = {
        name,
        color: typeof layer.color === 'number' ? layer.color : undefined,
        lineType: typeof layer.lineType === 'string' ? layer.lineType : undefined,
        lineWeight: typeof layer.lineWeight === 'number' ? layer.lineWeight : undefined,
        frozen: typeof layer.frozen === 'boolean' ? layer.frozen : false,
        locked: typeof layer.locked === 'boolean' ? layer.locked : false,
        off: typeof layer.off === 'boolean' ? layer.off : false
      };
      return dxfLayer;
    });
    console.log('[DEBUG] Converted layers:', converted.length);
    return converted;
  }

  /**
   * Convert dxf-parser blocks to our format with validation
   */
  private convertBlocks(blocks: Record<string, any>): DxfBlock[] {
    const converted = Object.entries(blocks).map(([name, block]) => {
      const basePoint: [number, number, number] = block.position && isValidPoint(block.position) ? 
        toPoint3d(block.position) : 
        [0, 0, 0];

      const origin: [number, number, number] | undefined = block.origin && isValidPoint(block.origin) ? 
        toPoint3d(block.origin) : 
        undefined;

      const dxfBlock: DxfBlock = {
        name,
        basePoint,
        entities: this.convertEntities(block.entities || []),
        layer: typeof block.layer === 'string' ? block.layer : undefined,
        description: typeof block.description === 'string' ? block.description : undefined,
        origin,
        units: typeof block.units === 'string' ? block.units : undefined
      };

      // Validate the converted block
      const issues = validateBlock(dxfBlock);
      if (issues.length > 0) {
        console.warn(`[DEBUG] Block validation issues for ${name}:`, issues);
      }

      return dxfBlock;
    });
    console.log('[DEBUG] Converted blocks:', converted.length);
    return converted;
  }

  /**
   * Convert dxf-parser entities to our format with validation
   */
  private convertEntities(entities: any[]): DxfEntity[] {
    const converted = entities.map(entity => {
      const dxfEntity: DxfEntity = {
        type: entity.type as DxfEntityType,
        attributes: {
          layer: typeof entity.layer === 'string' ? entity.layer : undefined,
          lineType: typeof entity.lineType === 'string' ? entity.lineType : undefined,
          color: typeof entity.color === 'number' ? entity.color : undefined,
          lineWeight: typeof entity.lineWeight === 'number' ? entity.lineWeight : undefined,
          handle: typeof entity.handle === 'string' ? entity.handle : undefined
        },
        data: this.convertEntityData(entity)
      };

      // Validate the converted entity
      const issues = validateEntityData(dxfEntity.type, dxfEntity.data);
      if (issues.length > 0) {
        console.warn(`[DEBUG] Entity validation issues for ${entity.type}:`, issues);
      }

      return dxfEntity;
    });
    console.log('[DEBUG] Converted entities:', converted.length);
    return converted;
  }

  /**
   * Convert entity specific data with validation
   */
  private convertEntityData(entity: any): Record<string, unknown> {
    const data: Record<string, unknown> = {};

    if (!entity || typeof entity.type !== 'string') {
      console.warn('[DEBUG] Invalid entity:', entity);
      return data;
    }

    try {
      switch (entity.type.toUpperCase()) {
        case 'LINE':
          if (isValidPoint(entity.start) && isValidPoint(entity.end)) {
            data.x = entity.start.x;
            data.y = entity.start.y;
            data.z = entity.start.z;
            data.x2 = entity.end.x;
            data.y2 = entity.end.y;
            data.z2 = entity.end.z;
          } else {
            console.warn('[DEBUG] Invalid LINE points:', { start: entity.start, end: entity.end });
          }
          break;

        case 'POINT':
          if (isValidPoint(entity.position)) {
            data.x = entity.position.x;
            data.y = entity.position.y;
            data.z = entity.position.z;
          } else {
            console.warn('[DEBUG] Invalid POINT position:', entity.position);
          }
          break;

        case 'CIRCLE':
          if (isValidPoint(entity.center) && typeof entity.radius === 'number') {
            data.x = entity.center.x;
            data.y = entity.center.y;
            data.z = entity.center.z;
            data.radius = entity.radius;
          } else {
            console.warn('[DEBUG] Invalid CIRCLE data:', { center: entity.center, radius: entity.radius });
          }
          break;

        case 'ARC':
          if (isValidPoint(entity.center) && 
              typeof entity.radius === 'number' &&
              typeof entity.startAngle === 'number' &&
              typeof entity.endAngle === 'number') {
            data.x = entity.center.x;
            data.y = entity.center.y;
            data.z = entity.center.z;
            data.radius = entity.radius;
            data.startAngle = entity.startAngle;
            data.endAngle = entity.endAngle;
          } else {
            console.warn('[DEBUG] Invalid ARC data:', { 
              center: entity.center, 
              radius: entity.radius,
              angles: { start: entity.startAngle, end: entity.endAngle }
            });
          }
          break;

        case 'POLYLINE':
        case 'LWPOLYLINE':
          if (Array.isArray(entity.vertices)) {
            const validVertices = entity.vertices
              .filter((v: any) => isValidPoint(v))
              .map((v: any) => ({
                x: v.x,
                y: v.y,
                z: v.z
              }));

            if (validVertices.length >= 2) {
              data.vertices = validVertices;
              data.closed = !!entity.closed;
            } else {
              console.warn('[DEBUG] Invalid POLYLINE vertices:', {
                total: entity.vertices.length,
                valid: validVertices.length
              });
            }
          } else {
            console.warn('[DEBUG] Missing POLYLINE vertices');
          }
          break;

        case 'ELLIPSE':
          if (isValidPoint(entity.center) && 
              isValidPoint(entity.majorAxis) &&
              typeof entity.ratio === 'number') {
            data.x = entity.center.x;
            data.y = entity.center.y;
            data.z = entity.center.z;
            data.majorAxis = {
              x: entity.majorAxis.x,
              y: entity.majorAxis.y,
              z: entity.majorAxis.z
            };
            data.ratio = entity.ratio;
            data.startAngle = typeof entity.startAngle === 'number' ? entity.startAngle : 0;
            data.endAngle = typeof entity.endAngle === 'number' ? entity.endAngle : Math.PI * 2;
          } else {
            console.warn('[DEBUG] Invalid ELLIPSE data:', {
              center: entity.center,
              majorAxis: entity.majorAxis,
              ratio: entity.ratio
            });
          }
          break;

        case 'SPLINE':
          if (Array.isArray(entity.controlPoints) && entity.controlPoints.length >= 2) {
            const validPoints = entity.controlPoints
              .filter((p: any) => isValidPoint(p))
              .map((p: any) => ({
                x: p.x,
                y: p.y,
                z: p.z
              }));

            if (validPoints.length >= 2) {
              data.controlPoints = validPoints;
              data.degree = typeof entity.degree === 'number' ? entity.degree : 3;
              data.knots = Array.isArray(entity.knots) ? entity.knots : undefined;
              data.weights = Array.isArray(entity.weights) ? entity.weights : undefined;
              data.closed = !!entity.closed;
            } else {
              console.warn('[DEBUG] Invalid SPLINE control points:', {
                total: entity.controlPoints.length,
                valid: validPoints.length
              });
            }
          } else {
            console.warn('[DEBUG] Missing SPLINE control points');
          }
          break;

        case 'TEXT':
        case 'MTEXT':
          if (isValidPoint(entity.position) && typeof entity.text === 'string') {
            data.x = entity.position.x;
            data.y = entity.position.y;
            data.z = entity.position.z;
            data.text = entity.text;
            data.height = typeof entity.height === 'number' ? entity.height : 1;
            data.rotation = typeof entity.rotation === 'number' ? entity.rotation : 0;
            if (typeof entity.width === 'number') data.width = entity.width;
          } else {
            console.warn('[DEBUG] Invalid TEXT data:', {
              position: entity.position,
              text: entity.text
            });
          }
          break;
      }
    } catch (error) {
      console.warn('[DEBUG] Failed to convert entity data:', error);
    }
    return data;
  }

  /**
   * Get unique entity types from entities
   */
  private getEntityTypes(entities: any[]): DxfEntityType[] {
    const types = Array.from(new Set(entities.map(e => e.type)));
    const validTypes = types.filter((type): type is DxfEntityType => 
      ['POINT', 'LINE', 'POLYLINE', 'LWPOLYLINE', 'CIRCLE', 'ARC', 'ELLIPSE', 
       'INSERT', 'TEXT', 'MTEXT', 'DIMENSION', 'SPLINE', 'HATCH', 'SOLID', 'FACE3D'].includes(type)
    );
    console.log('[DEBUG] Entity types:', validTypes);
    return validTypes;
  }

  /**
   * Get extents from header if available
   */
  private getExtents(header: any): { min: [number, number, number], max: [number, number, number] } | undefined {
    if (header?.$EXTMIN && header?.$EXTMAX && 
        isValidPoint(header.$EXTMIN) && isValidPoint(header.$EXTMAX)) {
      return {
        min: toPoint3d(header.$EXTMIN),
        max: toPoint3d(header.$EXTMAX)
      };
    }
    return undefined;
  }

  /**
   * Get units from header if available
   */
  private getUnits(header: any): 'metric' | 'imperial' | undefined {
    return header?.$MEASUREMENT === 1 ? 'metric' : 'imperial';
  }

  /**
   * Convert entities to GeoJSON features
   */
  async convertToFeatures(entities: DxfEntity[]): Promise<Feature[]> {
    console.log('[DEBUG] Converting entities to features:', entities.length);
    const features: Feature[] = [];

    for (const entity of entities) {
      try {
        const feature = await this.entityToFeature(entity);
        if (feature) {
          features.push(feature);
        }
      } catch (error) {
        console.warn('[DEBUG] Failed to convert entity to feature:', error);
      }
    }

    console.log('[DEBUG] Converted features:', features.length);
    return features;
  }

  /**
   * Convert single entity to GeoJSON feature
   */
  private async entityToFeature(entity: DxfEntity): Promise<Feature | null> {
    try {
      switch (entity.type.toUpperCase()) {
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
              if (entity.data.closed && coordinates.length >= 3) {
                coordinates.push(coordinates[0]); // Close polygon
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
            const startAngle = (entity.data.startAngle * Math.PI) / 180;
            const endAngle = (entity.data.endAngle * Math.PI) / 180;
            const points = 32;
            const coordinates = [];
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

        case 'ELLIPSE':
          if (typeof entity.data.x === 'number' && 
              typeof entity.data.y === 'number' &&
              typeof entity.data.majorAxis === 'object' &&
              typeof entity.data.ratio === 'number') {
            const points = 32;
            const coordinates = [];
            const startAngle = typeof entity.data.startAngle === 'number' ? entity.data.startAngle : 0;
            const endAngle = typeof entity.data.endAngle === 'number' ? entity.data.endAngle : Math.PI * 2;
            const majorAxis = entity.data.majorAxis as Vector3;
            const majorRadius = Math.sqrt(majorAxis.x * majorAxis.x + majorAxis.y * majorAxis.y);
            const minorRadius = majorRadius * entity.data.ratio;
            const rotation = Math.atan2(majorAxis.y, majorAxis.x);

            for (let i = 0; i <= points; i++) {
              const angle = startAngle + (i / points) * (endAngle - startAngle);
              const x = entity.data.x + 
                       Math.cos(angle) * majorRadius * Math.cos(rotation) - 
                       Math.sin(angle) * minorRadius * Math.sin(rotation);
              const y = entity.data.y + 
                       Math.cos(angle) * majorRadius * Math.sin(rotation) + 
                       Math.sin(angle) * minorRadius * Math.cos(rotation);
              coordinates.push([x, y]);
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

        case 'SPLINE':
          if (Array.isArray(entity.data.controlPoints) && entity.data.controlPoints.length >= 2) {
            // For now, we'll create a simple LineString through the control points
            // In the future, we could implement proper spline interpolation
            const coordinates = entity.data.controlPoints.map(p => [p.x, p.y]);
            if (entity.data.closed) {
              coordinates.push(coordinates[0]); // Close the spline
            }
            return {
              type: 'Feature',
              geometry: entity.data.closed && coordinates.length >= 4 ? 
                {
                  type: 'Polygon',
                  coordinates: [coordinates]
                } :
                {
                  type: 'LineString',
                  coordinates
                },
              properties: {
                type: entity.type,
                degree: entity.data.degree,
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
}
