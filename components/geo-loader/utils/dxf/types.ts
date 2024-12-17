import { Feature } from 'geojson';
import { GeoFeature } from '../../../../types/geo';

export type Matrix4 = number[][];

export interface Vector3 {
  x: number;
  y: number;
  z?: number;
}

export interface LayerInfo {
  name: string;
  color?: number;
  colorRGB?: number;
  lineType?: string;
  lineWeight?: number;
  frozen?: boolean;
  locked?: boolean;
  visible: boolean;
}

export interface DxfBlock {
  name: string;
  position: Vector3;
  entities: DxfEntity[];
  layer: string;
}

export interface DxfEntityBase {
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

export interface Dxf3DFaceEntity extends DxfEntityBase {
  type: '3DFACE';
  vertices: [Vector3, Vector3, Vector3, Vector3];
}

export interface DxfPointEntity extends DxfEntityBase {
  type: 'POINT';
  position: Vector3;
}

export interface DxfLineEntity extends DxfEntityBase {
  type: 'LINE';
  start: Vector3;
  end: Vector3;
}

export interface DxfPolylineEntity extends DxfEntityBase {
  type: 'POLYLINE' | 'LWPOLYLINE';
  vertices: Vector3[];
  closed?: boolean;
}

export interface DxfCircleEntity extends DxfEntityBase {
  type: 'CIRCLE';
  center: Vector3;
  radius: number;
}

export interface DxfArcEntity extends DxfEntityBase {
  type: 'ARC';
  center: Vector3;
  radius: number;
  startAngle: number;
  endAngle: number;
}

export interface DxfEllipseEntity extends DxfEntityBase {
  type: 'ELLIPSE';
  center: Vector3;
  majorAxis: Vector3;
  minorAxisRatio: number;
  startAngle: number;
  endAngle: number;
}

export interface DxfInsertEntity extends DxfEntityBase {
  type: 'INSERT';
  position: Vector3;
  block: string;
  scale?: Vector3;
  rotation?: number;
}

export type DxfEntity = 
  | DxfPointEntity
  | DxfLineEntity
  | DxfPolylineEntity
  | DxfCircleEntity
  | DxfArcEntity
  | DxfEllipseEntity
  | Dxf3DFaceEntity
  | DxfInsertEntity;

export interface DxfData {
  entities: DxfEntity[];
  blocks?: Record<string, DxfBlock>;
  tables?: {
    layer?: {
      layers: Record<string, any>;
    };
  };
}

export interface ParserResult<T> {
  data: T;
  errors: string[];
  warnings: string[];
}

export interface ParserContext {
  coordinateSystem?: string;
  validate: boolean;
  onProgress?: (progress: number) => void;
}

export interface BaseParser<T> {
  parse(content: string, context: ParserContext): Promise<ParserResult<T>>;
  validate(data: T): string[];
}

export interface CustomDxfParserLib {
  parseSync(content: string): DxfData;
}
