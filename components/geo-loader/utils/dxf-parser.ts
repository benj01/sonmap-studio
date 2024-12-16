import { GeoFeature, Geometry } from '../../../types/geo';
import { createFeature, createLineStringGeometry, createPointGeometry, createPolygonGeometry } from './geometry-utils';
import DxfParser from 'dxf-parser';

// Type definitions
type Matrix4 = number[][];

interface Vector3 {
  x: number;
  y: number;
  z?: number;
}

interface LayerInfo {
  name: string;
  color?: number;
  colorRGB?: number;
  lineType?: string;
  lineWeight?: number;
  frozen?: boolean;
  locked?: boolean;
  visible: boolean;
}

interface DxfBlock {
  name: string;
  position: Vector3;
  entities: DxfEntity[];
  layer: string;
}

interface DxfEntityBase {
  type: string;
  layer?: string;
  handle?: string;
  color?: number;
  colorRGB?: number;
  lineType?: string;
  lineWeight?: number;
  elevation?: number;
  thickness?: number;
  visible?: boolean;
  extrusionDirection?: Vector3;
}

interface Dxf3DFaceEntity extends DxfEntityBase {
  type: '3DFACE';
  vertices: [Vector3, Vector3, Vector3, Vector3];
}

interface DxfPointEntity extends DxfEntityBase {
  type: 'POINT';
  position: Vector3;
}

interface DxfLineEntity extends DxfEntityBase {
  type: 'LINE';
  start: Vector3;
  end: Vector3;
}

interface DxfPolylineEntity extends DxfEntityBase {
  type: 'POLYLINE' | 'LWPOLYLINE';
  vertices: Vector3[];
  closed?: boolean;
}

interface DxfCircleEntity extends DxfEntityBase {
  type: 'CIRCLE';
  center: Vector3;
  radius: number;
}

interface DxfArcEntity extends DxfEntityBase {
  type: 'ARC';
  center: Vector3;
  radius: number;
  startAngle: number;
  endAngle: number;
}

interface DxfEllipseEntity extends DxfEntityBase {
  type: 'ELLIPSE';
  center: Vector3;
  majorAxis: Vector3;
  minorAxisRatio: number;
  startAngle: number;
  endAngle: number;
}

type DxfEntity = 
  | DxfPointEntity
  | DxfLineEntity
  | DxfPolylineEntity
  | DxfCircleEntity
  | DxfArcEntity
  | DxfEllipseEntity
  | Dxf3DFaceEntity;

interface DxfData {
  entities: DxfEntity[];
  blocks?: Record<string, DxfBlock>;
  tables?: {
    layer?: {
      layers: Record<string, any>;
    };
  };
}

interface CustomDxfParserLib {
  parseSync(content: string): DxfData;
}

class DxfParserLibImpl implements CustomDxfParserLib {
  private parser: DxfParser;

  constructor() {
    this.parser = new DxfParser();
  }

  parseSync(content: string): DxfData {
    try {
      const parsed = this.parser.parseSync(content);
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

  private convertParsedData(parsed: any): DxfData {
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
      result.entities = parsed.entities.map((entity: any) => {
        const converted = this.convertEntity(entity);
        if (!converted && entity?.type) {
          console.warn(`Failed to convert entity of type "${entity.type}" with handle "${entity.handle || 'unknown'}"`);
        }
        return converted;
      }).filter(Boolean) as DxfEntity[];
    }

    // Convert blocks
    if (parsed.blocks && typeof parsed.blocks === 'object') {
      Object.entries(parsed.blocks).forEach(([name, block]: [string, any]) => {
        if (block.entities) {
          result.blocks![name] = {
            name,
            position: block.position || { x: 0, y: 0, z: 0 },
            entities: block.entities.map((bEnt: any) => this.convertEntity(bEnt)).filter(Boolean) as DxfEntity[],
            layer: block.layer || '0'
          };
        }
      });
    }

    // Convert layers
    if (parsed.tables && parsed.tables.layer) {
      result.tables!.layer!.layers = parsed.tables.layer.layers || {};
    }

    return result;
  }

  private convertEntity(entity: any): DxfEntity | null {
    // Validate that entity has a type
    if (!entity || typeof entity !== 'object' || typeof entity.type !== 'string') {
      console.warn('Invalid entity structure:', entity);
      return null;
    }

    try {
      switch (entity.type) {
        case '3DFACE':
          if (!Array.isArray(entity.vertices) || entity.vertices.length < 3) {
            console.warn(`3DFACE entity with handle "${entity.handle || 'unknown'}" has invalid vertices.`);
            return null;
          }
          return {
            type: '3DFACE',
            vertices: [
              entity.vertices[0] || { x: 0, y: 0, z: 0 },
              entity.vertices[1] || { x: 0, y: 0, z: 0 },
              entity.vertices[2] || { x: 0, y: 0, z: 0 },
              entity.vertices[3] || entity.vertices[2] || { x: 0, y: 0, z: 0 }
            ],
            ...this.extractCommonProperties(entity)
          };

        case 'POINT':
          if (!entity.position || typeof entity.position.x !== 'number' || typeof entity.position.y !== 'number') {
            console.warn(`POINT entity with handle "${entity.handle || 'unknown'}" has invalid position.`);
            return null;
          }
          return {
            type: 'POINT',
            position: entity.position,
            ...this.extractCommonProperties(entity)
          };

        case 'LINE':
          if (!entity.start || !entity.end || typeof entity.start.x !== 'number' || typeof entity.end.x !== 'number') {
            console.warn(`LINE entity with handle "${entity.handle || 'unknown'}" has invalid start/end points.`);
            return null;
          }
          return {
            type: 'LINE',
            start: entity.start,
            end: entity.end,
            ...this.extractCommonProperties(entity)
          };

        case 'LWPOLYLINE':
        case 'POLYLINE':
          if (!Array.isArray(entity.vertices)) {
            console.warn(`POLYLINE entity with handle "${entity.handle || 'unknown'}" is missing vertices array.`);
            return null;
          }
          return {
            type: entity.type,
            vertices: entity.vertices.map((v: any) => ({
              x: v.x ?? 0,
              y: v.y ?? 0,
              z: v.z ?? 0
            })),
            closed: entity.closed,
            ...this.extractCommonProperties(entity)
          };

        case 'CIRCLE':
          if (!entity.center || typeof entity.radius !== 'number') {
            console.warn(`CIRCLE entity with handle "${entity.handle || 'unknown'}" missing center or radius.`);
            return null;
          }
          return {
            type: 'CIRCLE',
            center: entity.center,
            radius: entity.radius,
            ...this.extractCommonProperties(entity)
          };

        case 'ARC':
          if (!entity.center || typeof entity.radius !== 'number' ||
              typeof entity.startAngle !== 'number' || typeof entity.endAngle !== 'number') {
            console.warn(`ARC entity with handle "${entity.handle || 'unknown'}" missing parameters.`);
            return null;
          }
          return {
            type: 'ARC',
            center: entity.center,
            radius: entity.radius,
            startAngle: entity.startAngle,
            endAngle: entity.endAngle,
            ...this.extractCommonProperties(entity)
          };

        case 'ELLIPSE':
          if (!entity.center || !entity.majorAxis ||
              typeof entity.minorAxisRatio !== 'number' ||
              typeof entity.startAngle !== 'number' ||
              typeof entity.endAngle !== 'number') {
            console.warn(`ELLIPSE entity with handle "${entity.handle || 'unknown'}" missing parameters.`);
            return null;
          }
          return {
            type: 'ELLIPSE',
            center: entity.center,
            majorAxis: entity.majorAxis,
            minorAxisRatio: entity.minorAxisRatio,
            startAngle: entity.startAngle,
            endAngle: entity.endAngle,
            ...this.extractCommonProperties(entity)
          };

        default:
          // Unsupported entity type
          console.warn(`Unsupported entity type "${entity.type}" with handle "${entity.handle || 'unknown'}".`);
          return null;
      }
    } catch (error: any) {
      console.warn(`Error converting entity type "${entity.type}" handle "${entity.handle || 'unknown'}":`, error?.message || error);
      return null;
    }
  }

  private extractCommonProperties(entity: any) {
    return {
      layer: entity.layer,
      handle: entity.handle,
      color: entity.color,
      colorRGB: entity.colorRGB,
      lineType: entity.lineType,
      lineWeight: entity.lineWeight,
      elevation: entity.elevation,
      thickness: entity.thickness,
      visible: entity.visible,
      extrusionDirection: entity.extrusionDirection
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
        Object.entries(dxf.blocks).forEach(([name, block]: [string, DxfBlock]) => {
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
        Object.entries(dxf.tables.layer.layers).forEach(([name, layer]: [string, any]) => {
          layers.set(name, {
            name,
            color: layer.color,
            colorRGB: layer.colorRGB,
            lineType: layer.lineType,
            lineWeight: layer.lineWeight,
            frozen: Boolean(layer.flags & 1),
            locked: Boolean(layer.flags & 4),
            visible: !(layer.flags & 1)
          });
        });
      }

      if (Array.isArray(dxf.entities)) {
        dxf.entities.forEach((entity: DxfEntity) => {
          if (entity.layer && !layers.has(entity.layer)) {
            layers.set(entity.layer, {
              name: entity.layer,
              visible: true
            });
          }
        });
      }

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

  private isValidVector(vector: Vector3 | undefined): boolean {
    return vector !== undefined && 
           typeof vector.x === 'number' && 
           typeof vector.y === 'number' && 
           isFinite(vector.x) && 
           isFinite(vector.y) &&
           (vector.z === undefined || (typeof vector.z === 'number' && isFinite(vector.z)));
  }

  private transformPoint(point: Vector3, matrix: Matrix4): Vector3 | null {
    if (!this.isValidVector(point)) {
      console.warn('Invalid point coordinates:', point);
      return null;
    }
    const [px, py, pz] = this.applyMatrix(matrix, [point.x, point.y, point.z ?? 0, 1]);
    if (!isFinite(px) || !isFinite(py) || !isFinite(pz)) {
      console.warn('Invalid transformation result:', { px, py, pz });
      return null;
    }
    return { x: px, y: py, z: pz };
  }

  private transformEntity(entity: DxfEntity, matrix: Matrix4): DxfEntity | null {
    try {
      switch (entity.type) {
        case '3DFACE': {
          const transformedVertices = entity.vertices.map(v => this.transformPoint(v, matrix));
          if (transformedVertices.some(v => v === null)) {
            console.warn(`Failed to transform 3DFACE entity handle "${entity.handle || 'unknown'}" due to invalid vertices.`);
            return null;
          }
          return {
            ...entity,
            vertices: transformedVertices as [Vector3, Vector3, Vector3, Vector3]
          };
        }
        case 'POINT': {
          const position = this.transformPoint(entity.position, matrix);
          if (!position) {
            console.warn(`Failed to transform POINT entity handle "${entity.handle || 'unknown'}".`);
            return null;
          }
          return { ...entity, position };
        }
        case 'LINE': {
          const start = this.transformPoint(entity.start, matrix);
          const end = this.transformPoint(entity.end, matrix);
          if (!start || !end) {
            console.warn(`Failed to transform LINE entity handle "${entity.handle || 'unknown'}".`);
            return null;
          }
          return { ...entity, start, end };
        }
        case 'POLYLINE':
        case 'LWPOLYLINE': {
          const vertices = entity.vertices
            .map(v => this.transformPoint(v, matrix))
            .filter((v): v is Vector3 => v !== null);
          if (vertices.length < 2) {
            console.warn(`Failed to transform POLYLINE entity handle "${entity.handle || 'unknown'}" - insufficient valid vertices.`);
            return null;
          }
          return { ...entity, vertices };
        }
        case 'CIRCLE': {
          const center = this.transformPoint(entity.center, matrix);
          if (!center) {
            console.warn(`Failed to transform CIRCLE center handle "${entity.handle || 'unknown'}".`);
            return null;
          }
          const radius = entity.radius * this.getScaleFactor(matrix);
          if (!isFinite(radius) || radius <= 0) {
            console.warn(`Invalid transformed radius for CIRCLE entity handle "${entity.handle || 'unknown'}".`);
            return null;
          }
          return { ...entity, center, radius };
        }
        case 'ARC': {
          const center = this.transformPoint(entity.center, matrix);
          if (!center) {
            console.warn(`Failed to transform ARC center handle "${entity.handle || 'unknown'}".`);
            return null;
          }
          const radius = entity.radius * this.getScaleFactor(matrix);
          if (!isFinite(radius) || radius <= 0) {
            console.warn(`Invalid transformed radius for ARC entity handle "${entity.handle || 'unknown'}".`);
            return null;
          }
          const startAngle = this.transformAngle(entity.startAngle, matrix);
          const endAngle = this.transformAngle(entity.endAngle, matrix);
          if (!isFinite(startAngle) || !isFinite(endAngle)) {
            console.warn(`Invalid transformed angles for ARC entity handle "${entity.handle || 'unknown'}".`);
            return null;
          }
          return { ...entity, center, radius, startAngle, endAngle };
        }
        case 'ELLIPSE': {
          const center = this.transformPoint(entity.center, matrix);
          const majorAxis = this.transformVector(entity.majorAxis, matrix);
          if (!center || !majorAxis) {
            console.warn(`Failed to transform ELLIPSE handle "${entity.handle || 'unknown'}" - invalid center or majorAxis.`);
            return null;
          }
          const startAngle = this.transformAngle(entity.startAngle, matrix);
          const endAngle = this.transformAngle(entity.endAngle, matrix);
          if (!isFinite(startAngle) || !isFinite(endAngle)) {
            console.warn(`Invalid transformed angles for ELLIPSE entity handle "${entity.handle || 'unknown'}".`);
            return null;
          }
          return {
            ...entity,
            center,
            majorAxis,
            minorAxisRatio: entity.minorAxisRatio,
            startAngle,
            endAngle
          };
        }
        default:
          console.warn(`Transform not supported for entity type "${entity.type}" handle "${entity.handle || 'unknown'}".`);
          return null;
      }
    } catch (error: any) {
      console.warn(`Error transforming entity type "${entity.type}" handle "${entity.handle || 'unknown'}":`, error?.message || error);
      return null;
    }
  }

  private entityToGeometry(entity: DxfEntity): Geometry | null {
    try {
      switch (entity.type) {
        case '3DFACE': {
          if (!entity.vertices.every(this.isValidVector.bind(this))) {
            console.warn(`Invalid 3DFACE vertices for entity handle "${entity.handle || 'unknown'}".`);
            return null;
          }
          const coordinates = entity.vertices.map(v => [v.x, v.y] as [number, number]);
          if (
            coordinates[0][0] !== coordinates[coordinates.length - 1][0] ||
            coordinates[0][1] !== coordinates[coordinates.length - 1][1]
          ) {
            coordinates.push([coordinates[0][0], coordinates[0][1]]);
          }
          return createPolygonGeometry([coordinates]);
        }

        case 'POINT': {
          if (!this.isValidVector(entity.position)) {
            console.warn(`Invalid POINT position for entity handle "${entity.handle || 'unknown'}".`);
            return null;
          }
          return createPointGeometry(entity.position.x, entity.position.y, entity.position.z);
        }

        case 'LINE': {
          if (!this.isValidVector(entity.start) || !this.isValidVector(entity.end)) {
            console.warn(`Invalid LINE coordinates for entity handle "${entity.handle || 'unknown'}".`);
            return null;
          }
          const coordinates: [number, number][] = [
            [entity.start.x, entity.start.y],
            [entity.end.x, entity.end.y]
          ];
          return createLineStringGeometry(coordinates);
        }

        case 'POLYLINE':
        case 'LWPOLYLINE': {
          if (!Array.isArray(entity.vertices)) {
            console.warn(`No vertices in POLYLINE for entity handle "${entity.handle || 'unknown'}".`);
            return null;
          }
          const validVertices = entity.vertices.filter(this.isValidVector.bind(this));
          if (validVertices.length < 2) {
            console.warn(`Not enough valid vertices for POLYLINE handle "${entity.handle || 'unknown'}".`);
            return null;
          }
          const coordinates = validVertices.map(v => [v.x, v.y] as [number, number]);
          if (entity.closed && coordinates.length >= 3) {
            const first = coordinates[0];
            const last = coordinates[coordinates.length - 1];
            if (first[0] !== last[0] || first[1] !== last[1]) {
              coordinates.push([first[0], first[1]]);
            }
            return createPolygonGeometry([coordinates]);
          } else {
            return createLineStringGeometry(coordinates);
          }
        }

        case 'CIRCLE': {
          if (!this.isValidVector(entity.center) || !isFinite(entity.radius) || entity.radius <= 0) {
            console.warn(`Invalid CIRCLE parameters for entity handle "${entity.handle || 'unknown'}".`);
            return null;
          }
          const circleCoords: [number, number][] = [];
          const circleSegments = 64;
          for (let i = 0; i <= circleSegments; i++) {
            const angle = (i * 2 * Math.PI) / circleSegments;
            const x = entity.center.x + entity.radius * Math.cos(angle);
            const y = entity.center.y + entity.radius * Math.sin(angle);
            if (!isFinite(x) || !isFinite(y)) {
              console.warn('Invalid circle point calculation.');
              return null;
            }
            circleCoords.push([x, y]);
          }
          return createPolygonGeometry([circleCoords]);
        }

        case 'ARC': {
          if (!this.isValidVector(entity.center) ||
              !isFinite(entity.radius) || entity.radius <= 0 ||
              !isFinite(entity.startAngle) || !isFinite(entity.endAngle)) {
            console.warn(`Invalid ARC parameters for entity handle "${entity.handle || 'unknown'}".`);
            return null;
          }
          const arcCoords: [number, number][] = [];
          const arcSegments = 32;
          let startAngle = (entity.startAngle * Math.PI) / 180;
          let endAngle = (entity.endAngle * Math.PI) / 180;
          if (endAngle <= startAngle) {
            endAngle += 2 * Math.PI;
          }
          const angleIncrement = (endAngle - startAngle) / arcSegments;

          for (let i = 0; i <= arcSegments; i++) {
            const angle = startAngle + i * angleIncrement;
            const x = entity.center.x + entity.radius * Math.cos(angle);
            const y = entity.center.y + entity.radius * Math.sin(angle);
            if (!isFinite(x) || !isFinite(y)) {
              console.warn('Invalid arc point calculation.');
              return null;
            }
            arcCoords.push([x, y]);
          }
          return createLineStringGeometry(arcCoords);
        }

        case 'ELLIPSE': {
          if (!this.isValidVector(entity.center) ||
              !this.isValidVector(entity.majorAxis) ||
              !isFinite(entity.minorAxisRatio) ||
              !isFinite(entity.startAngle) ||
              !isFinite(entity.endAngle)) {
            console.warn(`Invalid ELLIPSE parameters for entity handle "${entity.handle || 'unknown'}".`);
            return null;
          }

          const ellipseCoords: [number, number][] = [];
          const ellipseSegments = 64;
          const majorLength = Math.sqrt(
            entity.majorAxis.x * entity.majorAxis.x +
            entity.majorAxis.y * entity.majorAxis.y
          );

          if (!isFinite(majorLength) || majorLength === 0) {
            console.warn(`Invalid major axis length for ELLIPSE handle "${entity.handle || 'unknown'}".`);
            return null;
          }

          const rotation = Math.atan2(entity.majorAxis.y, entity.majorAxis.x);
          let startA = entity.startAngle;
          let endA = entity.endAngle;
          if (endA <= startA) {
            endA += 2 * Math.PI;
          }
          const ellipseAngleIncrement = (endA - startA) / ellipseSegments;

          for (let i = 0; i <= ellipseSegments; i++) {
            const angle = startA + (i * ellipseAngleIncrement);
            const cosAngle = Math.cos(angle);
            const sinAngle = Math.sin(angle);
            const x = majorLength * cosAngle;
            const y = majorLength * entity.minorAxisRatio * sinAngle;
            const rotatedX = x * Math.cos(rotation) - y * Math.sin(rotation);
            const rotatedY = x * Math.sin(rotation) + y * Math.cos(rotation);
            const finalX = entity.center.x + rotatedX;
            const finalY = entity.center.y + rotatedY;

            if (!isFinite(finalX) || !isFinite(finalY)) {
              console.warn('Invalid ellipse point calculation.');
              return null;
            }
            ellipseCoords.push([finalX, finalY]);
          }
          return createLineStringGeometry(ellipseCoords);
        }

        default:
          console.warn(`Unsupported entity type during geometry conversion: "${entity.type}" handle "${entity.handle || 'unknown'}".`);
          return null;
      }
    } catch (error: any) {
      console.error('Error converting entity to geometry:', error?.message || error);
      return null;
    }
  }

  entityToGeoFeature(entity: DxfEntity): GeoFeature | null {
    try {
      const geometry = this.entityToGeometry(entity);
      if (!geometry) return null;

      return createFeature(geometry, this.extractEntityProperties(entity));
    } catch (error: any) {
      console.warn(`Error converting entity to feature (type: "${entity.type}", handle: "${entity.handle || 'unknown'}"):`, error?.message || error);
      return null;
    }
  }

  private extractEntityProperties(entity: DxfEntity): Record<string, any> {
    const layer = this.layers.get(entity.layer || '0');
    return {
      id: entity.handle,
      type: entity.type,
      layer: entity.layer || '0',
      color: entity.color ?? layer?.color,
      colorRGB: entity.colorRGB ?? layer?.colorRGB,
      lineType: entity.lineType ?? layer?.lineType,
      lineWeight: entity.lineWeight ?? layer?.lineWeight,
      elevation: entity.elevation,
      thickness: entity.thickness,
      visible: entity.visible ?? layer?.visible,
      extrusionDirection: entity.extrusionDirection
    };
  }

  expandBlockReferences(dxf: DxfData): DxfEntity[] {
    const expandedEntities: DxfEntity[] = [];

    const processEntity = (entity: any, transformMatrix?: Matrix4): void => {
      // INSERT is not explicitly handled in the original code, but we keep logic here.
      if (entity.type === 'INSERT') {
        const block = this.blocks[entity.name];
        if (block) {
          const blockTransform = this.calculateBlockTransform(entity);
          const finalTransform = transformMatrix 
            ? this.combineMatrices(transformMatrix, blockTransform)
            : blockTransform;

          const rowCount = entity.rows || 1;
          const colCount = entity.columns || 1;
          const rowSpacing = entity.rowSpacing || 0;
          const colSpacing = entity.colSpacing || 0;

          for (let row = 0; row < rowCount; row++) {
            for (let col = 0; col < colCount; col++) {
              const offsetTransform = this.createTranslationMatrix(
                col * colSpacing,
                row * rowSpacing,
                0
              );
              const instanceTransform = this.combineMatrices(finalTransform, offsetTransform);

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

    if (Array.isArray(dxf.entities)) {
      dxf.entities.forEach((entity: any) => processEntity(entity));
    } else {
      console.warn('DXF data has no valid entities array during block expansion.');
    }

    return expandedEntities;
  }

  private calculateBlockTransform(insert: any): Matrix4 {
    let matrix = this.createIdentityMatrix();
    const position = insert.position || { x: 0, y: 0, z: 0 };
    matrix = this.combineMatrices(matrix, 
      this.createTranslationMatrix(position.x, position.y, position.z));
    
    if (insert.rotation) {
      matrix = this.combineMatrices(matrix, 
        this.createRotationMatrix(insert.rotation));
    }
    
    if (insert.scale) {
      const scale = insert.scale;
      matrix = this.combineMatrices(matrix, 
        this.createScaleMatrix(
          scale.x || 1,
          scale.y || 1,
          scale.z || 1
        ));
    }
    
    return matrix;
  }

  private createIdentityMatrix(): Matrix4 {
    return [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1]
    ];
  }

  private createTranslationMatrix(x: number, y: number, z: number): Matrix4 {
    return [
      [1, 0, 0, x],
      [0, 1, 0, y],
      [0, 0, 1, z],
      [0, 0, 0, 1]
    ];
  }

  private createRotationMatrix(angleInDegrees: number): Matrix4 {
    const angle = (angleInDegrees * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return [
      [cos, -sin, 0, 0],
      [sin, cos, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1]
    ];
  }

  private createScaleMatrix(x: number, y: number, z: number): Matrix4 {
    return [
      [x, 0, 0, 0],
      [0, y, 0, 0],
      [0, 0, z, 0],
      [0, 0, 0, 1]
    ];
  }

  private combineMatrices(a: Matrix4, b: Matrix4): Matrix4 {
    const result: Matrix4 = [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,1]];
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        result[i][j] = a[i][0]*b[0][j] + a[i][1]*b[1][j] + a[i][2]*b[2][j] + a[i][3]*b[3][j];
      }
    }
    return result;
  }

  private applyMatrix(matrix: Matrix4, point: [number, number, number, number]): [number, number, number] {
    const result: [number, number, number, number] = [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) {
      result[i] = matrix[i][0] * point[0] +
                  matrix[i][1] * point[1] +
                  matrix[i][2] * point[2] +
                  matrix[i][3] * point[3];
    }
    if (result[3] === 0) {
      // Avoid division by zero
      return [result[0], result[1], result[2]];
    }
    return [
      result[0] / result[3],
      result[1] / result[3],
      result[2] / result[3]
    ];
  }

  private getScaleFactor(matrix: Matrix4): number {
    const scaleX = Math.sqrt(matrix[0][0] * matrix[0][0] + matrix[0][1] * matrix[0][1] + matrix[0][2] * matrix[0][2]);
    const scaleY = Math.sqrt(matrix[1][0] * matrix[1][0] + matrix[1][1] * matrix[1][1] + matrix[1][2] * matrix[1][2]);
    return (scaleX + scaleY) / 2;
  }

  private transformAngle(angle: number, matrix: Matrix4): number {
    const rotationRad = Math.atan2(matrix[1][0], matrix[0][0]);
    const rotationDeg = (rotationRad * 180) / Math.PI;
    return (angle + rotationDeg) % 360;
  }

  private transformVector(vector: Vector3, matrix: Matrix4): Vector3 | null {
    return this.transformPoint(vector, matrix);
  }

  getLayers(): string[] {
    return Array.from(this.layers.keys());
  }
}

export const createDxfParser = () => new DxfFileParser();