import { default as DxfParserLib } from 'dxf-parser';
import { GeoFeature } from '../../../types/geo';
import {
  createPointGeometry,
  createLineStringGeometry,
  createPolygonGeometry,
  createFeature
} from './geometry-utils';

// Matrix type for transformations
type Matrix4 = [
  [number, number, number, number],
  [number, number, number, number],
  [number, number, number, number],
  [number, number, number, number]
];

// Basic vector interfaces
interface Vector2 {
  x: number;
  y: number;
}

interface Vector3 extends Vector2 {
  z?: number;
}

// Base entity interface
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
  extrusionDirection?: Vector3;
  visible?: boolean;
}

// Specific entity interfaces
interface DxfPoint extends DxfEntityBase {
  type: 'POINT';
  position: Vector3;
}

interface DxfLine extends DxfEntityBase {
  type: 'LINE';
  start: Vector3;
  end: Vector3;
}

interface DxfPolyline extends DxfEntityBase {
  type: 'POLYLINE' | 'LWPOLYLINE';
  vertices: Vector3[];
  closed?: boolean;
}

interface DxfCircle extends DxfEntityBase {
  type: 'CIRCLE';
  center: Vector3;
  radius: number;
}

interface DxfArc extends DxfEntityBase {
  type: 'ARC';
  center: Vector3;
  radius: number;
  startAngle: number;
  endAngle: number;
}

interface DxfEllipse extends DxfEntityBase {
  type: 'ELLIPSE';
  center: Vector3;
  majorAxis: Vector3;
  minorAxisRatio: number;
  startAngle: number;
  endAngle: number;
}

type DxfEntity = DxfPoint | DxfLine | DxfPolyline | DxfCircle | DxfArc | DxfEllipse;

interface DxfBlock {
  name: string;
  position: Vector3;
  entities: DxfEntity[];
  layer: string;
}

interface LayerInfo {
  name: string;
  color?: number;
  colorRGB?: number;
  lineType?: string;
  lineWeight?: number;
  frozen?: boolean;
  locked?: boolean;
  visible?: boolean;
}

class CustomDxfParserLib extends DxfParserLib {
  constructor() {
    super();
    (this as any).parseBoolean = (str: string | number | boolean): boolean => {
      if (str === undefined || str === null) {
        return false;
      }
      if (typeof str === 'boolean') return str;
      if (typeof str === 'number') return str !== 0;
      if (typeof str === 'string') {
        const normalized = str.toLowerCase().trim();
        if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
        if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
        const num = parseFloat(normalized);
        return !isNaN(num) && num > 0;
      }
      return false;
    };
  }
}

export class DxfFileParser {
  private parser: CustomDxfParserLib;
  private blocks: Record<string, DxfBlock> = {};
  private layers: Map<string, LayerInfo> = new Map();

  constructor() {
    this.parser = new CustomDxfParserLib();
  }

  parse(content: string): any {
    try {
      const dxf = this.parser.parseSync(content);
      this.blocks = this.extractBlocks(dxf);
      this.layers = this.extractLayers(dxf);
      return dxf;
    } catch (error) {
      console.error('Error parsing DXF content:', error);
      throw new Error('Error parsing DXF content');
    }
  }

  private extractBlocks(dxf: any): Record<string, DxfBlock> {
    const blocks: Record<string, DxfBlock> = {};
    try {
      if (dxf.blocks) {
        Object.entries(dxf.blocks).forEach(([name, block]: [string, any]) => {
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
    } catch (error) {
      console.warn('Error extracting blocks:', error);
    }
    return blocks;
  }

  private extractLayers(dxf: any): Map<string, LayerInfo> {
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
        dxf.entities.forEach((entity: any) => {
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
    } catch (error) {
      console.warn('Error extracting layers:', error);
      if (!layers.has('0')) {
        layers.set('0', { name: '0', visible: true });
      }
    }

    return layers;
  }

  private transformPoint(point: Vector3, matrix: Matrix4): Vector3 | null {
    if (!point || typeof point.x !== 'number' || typeof point.y !== 'number') {
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
        case 'POINT': {
          const position = this.transformPoint(entity.position, matrix);
          if (!position) return null;
          return { ...entity, position };
        }
        case 'LINE': {
          const start = this.transformPoint(entity.start, matrix);
          const end = this.transformPoint(entity.end, matrix);
          if (!start || !end) return null;
          return { ...entity, start, end };
        }
        case 'POLYLINE':
        case 'LWPOLYLINE': {
          const vertices = entity.vertices
            .map(v => this.transformPoint(v, matrix))
            .filter((v): v is Vector3 => v !== null);
          if (vertices.length < 2) return null;
          return { ...entity, vertices };
        }
        case 'CIRCLE': {
          const center = this.transformPoint(entity.center, matrix);
          if (!center) return null;
          const radius = entity.radius * this.getScaleFactor(matrix);
          if (!isFinite(radius) || radius <= 0) return null;
          return { ...entity, center, radius };
        }
        case 'ARC': {
          const center = this.transformPoint(entity.center, matrix);
          if (!center) return null;
          const radius = entity.radius * this.getScaleFactor(matrix);
          if (!isFinite(radius) || radius <= 0) return null;
          const startAngle = this.transformAngle(entity.startAngle, matrix);
          const endAngle = this.transformAngle(entity.endAngle, matrix);
          if (!isFinite(startAngle) || !isFinite(endAngle)) return null;
          return { ...entity, center, radius, startAngle, endAngle };
        }
        case 'ELLIPSE': {
          const center = this.transformPoint(entity.center, matrix);
          const majorAxis = this.transformVector(entity.majorAxis, matrix);
          if (!center || !majorAxis) return null;
          const startAngle = this.transformAngle(entity.startAngle, matrix);
          const endAngle = this.transformAngle(entity.endAngle, matrix);
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
        default:
          return null;
      }
    } catch (error) {
      console.warn('Error transforming entity:', error);
      return null;
    }
  }

  expandBlockReferences(dxf: any): DxfEntity[] {
    const expandedEntities: DxfEntity[] = [];

    const processEntity = (entity: any, transformMatrix?: Matrix4): void => {
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

    dxf.entities.forEach((entity: any) => processEntity(entity));
    return expandedEntities;
  }

  // Rest of the class implementation remains unchanged...
  private calculateBlockTransform(insert: any): Matrix4 {
    let matrix = this.createIdentityMatrix();
    matrix = this.combineMatrices(matrix, 
      this.createTranslationMatrix(insert.position.x, insert.position.y, insert.position.z));
    
    if (insert.rotation) {
      matrix = this.combineMatrices(matrix, 
        this.createRotationMatrix(insert.rotation));
    }
    
    if (insert.scale) {
      matrix = this.combineMatrices(matrix, 
        this.createScaleMatrix(insert.scale.x, insert.scale.y, insert.scale.z));
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

  entityToGeoFeature(entity: DxfEntity): GeoFeature | null {
    try {
      const geometry = this.entityToGeometry(entity);
      if (!geometry) return null;

      return createFeature(geometry, this.extractEntityProperties(entity));
    } catch (error) {
      console.warn(`Error converting entity to feature: ${error}`);
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

  private entityToGeometry(entity: DxfEntity): GeoFeature['geometry'] | null {
    switch (entity.type) {
      case 'POINT':
        return createPointGeometry(entity.position.x, entity.position.y, entity.position.z);
      case 'LINE':
        return createLineStringGeometry([
          [entity.start.x, entity.start.y],
          [entity.end.x, entity.end.y]
        ]);
      case 'POLYLINE':
      case 'LWPOLYLINE':
        const coordinates = entity.vertices.map(v => [v.x, v.y] as [number, number]);
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
      case 'CIRCLE':
        const circleCoords: [number, number][] = [];
        const circleSegments = 64;
        for (let i = 0; i <= circleSegments; i++) {
          const angle = (i * 2 * Math.PI) / circleSegments;
          circleCoords.push([
            entity.center.x + entity.radius * Math.cos(angle),
            entity.center.y + entity.radius * Math.sin(angle)
          ]);
        }
        return createPolygonGeometry([circleCoords]);
      case 'ARC':
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
          arcCoords.push([
            entity.center.x + entity.radius * Math.cos(angle),
            entity.center.y + entity.radius * Math.sin(angle)
          ]);
        }
        return createLineStringGeometry(arcCoords);
      case 'ELLIPSE':
        const ellipseCoords: [number, number][] = [];
        const ellipseSegments = 64;
        const majorLength = Math.sqrt(entity.majorAxis.x * entity.majorAxis.x + entity.majorAxis.y * entity.majorAxis.y);
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
          ellipseCoords.push([
            entity.center.x + rotatedX,
            entity.center.y + rotatedY
          ]);
        }
        return createLineStringGeometry(ellipseCoords);
      default:
        return null;
    }
  }

  getLayers(): string[] {
    return Array.from(this.layers.keys());
  }
}

export const createDxfParser = () => new DxfFileParser();
