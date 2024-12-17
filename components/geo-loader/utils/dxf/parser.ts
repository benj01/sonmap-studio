import DxfParser from 'dxf-parser';
import { 
  DxfBlock, 
  DxfData, 
  DxfEntity, 
  LayerInfo, 
  Vector3,
  RawLayerData,
  isDxfEntity
} from './types';
import { MatrixTransformer, Matrix4 } from './matrix';
import { DxfValidator } from './validator';
import { DxfConverter } from './converter';

interface CustomDxfParserLib {
  parseSync(content: string): DxfData;
}

interface ParsedBlock {
  entities: unknown[];
  position?: Vector3;
  layer?: string;
}

interface ParsedData {
  entities: unknown[];
  blocks?: Record<string, ParsedBlock>;
  tables?: {
    layer?: {
      layers: Record<string, RawLayerData>;
    };
  };
}

class DxfParserLibImpl implements CustomDxfParserLib {
  private parser: DxfParser;

  constructor() {
    this.parser = new DxfParser();
  }

  parseSync(content: string): DxfData {
    try {
      const parsed = this.parser.parseSync(content) as ParsedData;
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Parsed DXF data is not an object');
      }
      if (!Array.isArray(parsed.entities)) {
        throw new Error('DXF data has no valid entities array');
      }
      return this.convertParsedData(parsed);
    } catch (error: any) {
      console.error('DXF parsing error:', error?.message || error);
      throw new Error('Failed to parse DXF content');
    }
  }

  private convertParsedData(parsed: ParsedData): DxfData {
    const result: DxfData = {
      entities: [],
      blocks: {},
      tables: {
        layer: {
          layers: {}
        }
      }
    };

    // Convert entities
    if (Array.isArray(parsed.entities)) {
      result.entities = parsed.entities
        .map((entity: unknown) => this.convertEntity(entity))
        .filter((entity): entity is DxfEntity => entity !== null);
    }

    // Convert blocks
    if (parsed.blocks && typeof parsed.blocks === 'object') {
      Object.entries(parsed.blocks).forEach(([name, block]: [string, ParsedBlock]) => {
        if (block.entities) {
          result.blocks![name] = {
            name,
            position: block.position || { x: 0, y: 0, z: 0 },
            entities: block.entities
              .map((entity: unknown) => this.convertEntity(entity))
              .filter((entity): entity is DxfEntity => entity !== null),
            layer: block.layer || '0'
          };
        }
      });
    }

    // Convert layers
    if (parsed.tables?.layer?.layers) {
      result.tables!.layer!.layers = parsed.tables.layer.layers;
    }

    return result;
  }

  private convertEntity(entity: unknown): DxfEntity | null {
    if (!entity || typeof entity !== 'object') {
      console.warn('Invalid entity structure:', entity);
      return null;
    }

    const e = entity as any;
    
    // Add default values for missing required properties
    switch (e.type) {
      case '3DFACE':
        if (!e.vertices || !Array.isArray(e.vertices) || e.vertices.length !== 4) {
          e.vertices = Array(4).fill({ x: 0, y: 0, z: 0 });
        }
        e.vertices = e.vertices.map((v: any) => this.ensureVector3(v));
        break;

      case 'LINE':
        if (!e.start) e.start = { x: 0, y: 0, z: 0 };
        if (!e.end) e.end = { x: 0, y: 0, z: 0 };
        e.start = this.ensureVector3(e.start);
        e.end = this.ensureVector3(e.end);
        break;

      case 'TEXT':
      case 'MTEXT':
        if (!e.position) e.position = { x: 0, y: 0, z: 0 };
        if (!e.text) e.text = '';
        e.position = this.ensureVector3(e.position);
        break;

      case 'ELLIPSE':
        if (!e.center) e.center = { x: 0, y: 0, z: 0 };
        if (!e.majorAxis) e.majorAxis = { x: 1, y: 0, z: 0 };
        if (typeof e.minorAxisRatio !== 'number') e.minorAxisRatio = 1;
        if (typeof e.startAngle !== 'number') e.startAngle = 0;
        if (typeof e.endAngle !== 'number') e.endAngle = 2 * Math.PI;
        e.center = this.ensureVector3(e.center);
        e.majorAxis = this.ensureVector3(e.majorAxis);
        break;

      case 'POINT':
        if (!e.position) e.position = { x: 0, y: 0, z: 0 };
        e.position = this.ensureVector3(e.position);
        break;

      case 'POLYLINE':
      case 'LWPOLYLINE':
        if (!e.vertices || !Array.isArray(e.vertices)) {
          e.vertices = [];
        }
        e.vertices = e.vertices.map((v: any) => this.ensureVector3(v));
        break;
    }

    // Validate after adding defaults
    const validationError = DxfValidator.getEntityValidationError(entity);
    if (validationError) {
      console.warn(`Entity validation error after defaults: ${validationError}`);
      return null;
    }

    if (isDxfEntity(entity)) {
      return entity;
    }

    return null;
  }

  private ensureVector3(point: any): Vector3 {
    if (!point || typeof point !== 'object') {
      return { x: 0, y: 0, z: 0 };
    }
    return {
      x: typeof point.x === 'number' && isFinite(point.x) ? point.x : 0,
      y: typeof point.y === 'number' && isFinite(point.y) ? point.y : 0,
      z: typeof point.z === 'number' && isFinite(point.z) ? point.z : 0
    };
  }
}

export class DxfFileParser {
  private parser: CustomDxfParserLib;
  private blocks: Record<string, DxfBlock> = {};
  private layers: Map<string, LayerInfo> = new Map();

  constructor() {
    this.parser = new DxfParserLibImpl();
  }

  parse(content: string): DxfData {
    try {
      const dxf = this.parser.parseSync(content);
      if (!dxf || !Array.isArray(dxf.entities)) {
        throw new Error('Invalid DXF data structure after parsing.');
      }
      this.blocks = this.extractBlocks(dxf);
      this.layers = this.extractLayers(dxf);
      return dxf;
    } catch (error: any) {
      console.error('Error parsing DXF content:', error?.message || error);
      throw new Error('Error parsing DXF content');
    }
  }

  private extractBlocks(dxf: DxfData): Record<string, DxfBlock> {
    const blocks: Record<string, DxfBlock> = {};
    try {
      if (dxf.blocks) {
        Object.entries(dxf.blocks).forEach(([name, block]) => {
          if (block.entities) {
            blocks[name] = {
              name,
              position: block.position || { x: 0, y: 0, z: 0 },
              entities: block.entities,
              layer: block.layer || '0'
            };
          }
        });
      }
    } catch (error: any) {
      console.warn('Error extracting blocks:', error?.message || error);
    }
    return blocks;
  }

  private extractLayers(dxf: DxfData): Map<string, LayerInfo> {
    const layers = new Map<string, LayerInfo>();
    try {
      if (dxf.tables?.layer?.layers) {
        Object.entries(dxf.tables.layer.layers).forEach(([name, rawLayer]: [string, RawLayerData]) => {
          const flags = rawLayer.flags ?? 0;
          layers.set(name, {
            name,
            color: rawLayer.color,
            colorRGB: rawLayer.colorRGB,
            lineType: rawLayer.lineType,
            lineWeight: rawLayer.lineWeight,
            frozen: Boolean(flags & 1),
            locked: Boolean(flags & 4),
            visible: !(flags & 1)
          });
        });
      }

      // Add layers from entities if not already present
      dxf.entities.forEach(entity => {
        if (entity.layer && !layers.has(entity.layer)) {
          layers.set(entity.layer, {
            name: entity.layer,
            visible: true
          });
        }
      });

      // Ensure default layer exists
      if (!layers.has('0')) {
        layers.set('0', {
          name: '0',
          color: 7,
          visible: true
        });
      }
    } catch (error: any) {
      console.warn('Error extracting layers:', error?.message || error);
      if (!layers.has('0')) {
        layers.set('0', { name: '0', visible: true });
      }
    }

    return layers;
  }

  expandBlockReferences(dxf: DxfData): DxfEntity[] {
    const expandedEntities: DxfEntity[] = [];

    const processEntity = (entity: unknown, transformMatrix?: Matrix4): void => {
      if (!isDxfEntity(entity)) return;

      if (entity.type === 'INSERT') {
        const block = this.blocks[entity.name];
        if (block) {
          const blockTransform = MatrixTransformer.calculateBlockTransform(
            entity.position,
            entity.rotation,
            entity.scale
          );
          
          const finalTransform = transformMatrix 
            ? MatrixTransformer.combineMatrices(transformMatrix, blockTransform)
            : blockTransform;

          const rowCount = entity.rows || 1;
          const colCount = entity.columns || 1;
          const rowSpacing = entity.rowSpacing || 0;
          const colSpacing = entity.colSpacing || 0;

          for (let row = 0; row < rowCount; row++) {
            for (let col = 0; col < colCount; col++) {
              const offsetTransform = MatrixTransformer.createTranslationMatrix(
                col * colSpacing,
                row * rowSpacing,
                0
              );
              const instanceTransform = MatrixTransformer.combineMatrices(
                finalTransform,
                offsetTransform
              );

              block.entities.forEach(blockEntity => {
                processEntity(blockEntity, instanceTransform);
              });
            }
          }
        } else {
          console.warn(`INSERT references unknown block "${entity.name}"`);
        }
      } else {
        const transformedEntity = transformMatrix 
          ? this.transformEntity(entity, transformMatrix)
          : entity;
        if (transformedEntity) {
          expandedEntities.push(transformedEntity);
        }
      }
    };

    dxf.entities.forEach(entity => processEntity(entity));
    return expandedEntities;
  }

  private transformEntity(entity: DxfEntity, matrix: Matrix4): DxfEntity | null {
    try {
      switch (entity.type) {
        case '3DFACE': {
          const transformedVertices = entity.vertices.map(v => 
            MatrixTransformer.transformPoint(v, matrix)
          );
          if (transformedVertices.some(v => v === null)) {
            return null;
          }
          return {
            ...entity,
            vertices: transformedVertices as [Vector3, Vector3, Vector3, Vector3]
          };
        }

        case 'POINT': {
          const position = MatrixTransformer.transformPoint(entity.position, matrix);
          if (!position) return null;
          return { ...entity, position };
        }

        case 'LINE': {
          const start = MatrixTransformer.transformPoint(entity.start, matrix);
          const end = MatrixTransformer.transformPoint(entity.end, matrix);
          if (!start || !end) return null;
          return { ...entity, start, end };
        }

        case 'POLYLINE':
        case 'LWPOLYLINE': {
          const vertices = entity.vertices
            .map(v => MatrixTransformer.transformPoint(v, matrix))
            .filter((v): v is Vector3 => v !== null);
          if (vertices.length < 2) return null;
          return { ...entity, vertices };
        }

        case 'CIRCLE': {
          const center = MatrixTransformer.transformPoint(entity.center, matrix);
          if (!center) return null;
          const radius = entity.radius * MatrixTransformer.getScaleFactor(matrix);
          if (!isFinite(radius) || radius <= 0) return null;
          return { ...entity, center, radius };
        }

        case 'ARC': {
          const center = MatrixTransformer.transformPoint(entity.center, matrix);
          if (!center) return null;
          const radius = entity.radius * MatrixTransformer.getScaleFactor(matrix);
          if (!isFinite(radius) || radius <= 0) return null;
          const startAngle = MatrixTransformer.transformAngle(entity.startAngle, matrix);
          const endAngle = MatrixTransformer.transformAngle(entity.endAngle, matrix);
          if (!isFinite(startAngle) || !isFinite(endAngle)) return null;
          return { ...entity, center, radius, startAngle, endAngle };
        }

        case 'ELLIPSE': {
          const center = MatrixTransformer.transformPoint(entity.center, matrix);
          const majorAxis = MatrixTransformer.transformPoint(entity.majorAxis, matrix);
          if (!center || !majorAxis) return null;
          const startAngle = MatrixTransformer.transformAngle(entity.startAngle, matrix);
          const endAngle = MatrixTransformer.transformAngle(entity.endAngle, matrix);
          if (!isFinite(startAngle) || !isFinite(endAngle)) return null;
          return {
            ...entity,
            center,
            majorAxis,
            minorAxisRatio: entity.minorAxisRatio,
            startAngle,
            endAngle
          };
        }

        case 'INSERT':
          return null; // INSERT entities are handled separately in expandBlockReferences

        default:
          return null;
      }
    } catch (error: any) {
      console.warn(
        `Error transforming entity type "${entity.type}" handle "${entity.handle || 'unknown'}":`,
        error?.message || error
      );
      return null;
    }
  }

  entityToGeoFeature(entity: DxfEntity) {
    return DxfConverter.entityToGeoFeature(entity, 
      Object.fromEntries(this.layers.entries())
    );
  }

  getLayers(): string[] {
    return Array.from(this.layers.keys());
  }
}

export const createDxfParser = () => new DxfFileParser();
