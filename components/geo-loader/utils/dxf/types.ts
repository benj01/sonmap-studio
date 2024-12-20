import { Feature } from 'geojson';
import { GeoFeature } from '../../../../types/geo';

export type Matrix4 = number[][];

export interface Vector2 {
  x: number;
  y: number;
}

export interface Vector3 {
  x: number;
  y: number;
  z?: number;
}

export interface DxfHeader {
  $ACADVER?: string;
  $INSBASE?: Vector3;
  $EXTMIN?: Vector3;
  $EXTMAX?: Vector3;
  $INSUNITS?: number;
  $MEASUREMENT?: number;
  [key: string]: any;
}

export interface RawLayerData {
  name: string;
  color?: number;
  colorRGB?: number;
  lineType?: string;
  lineWeight?: number;
  flags?: number;
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
  block: string;  // Name of the block to insert
  scale?: Vector3;
  rotation?: number;
  rows?: number;
  columns?: number;
  rowSpacing?: number;
  colSpacing?: number;
}

export interface DxfTextEntity extends DxfEntityBase {
  type: 'TEXT' | 'MTEXT';
  position: Vector3;
  text: string;
  height?: number;
  rotation?: number;
  width?: number;
  style?: string;
  horizontalAlignment?: 'left' | 'center' | 'right';
  verticalAlignment?: 'baseline' | 'bottom' | 'middle' | 'top';
}

export interface DxfSplineEntity extends DxfEntityBase {
  type: 'SPLINE';
  controlPoints: Vector3[];
  degree: number;
  knots?: number[];
  weights?: number[];
  closed?: boolean;
}

export interface DxfHatchEntity extends DxfEntityBase {
  type: 'HATCH';
  boundaries: Vector3[][];
  pattern: string;
  solid: boolean;
  scale?: number;
  angle?: number;
}

export interface DxfSolidEntity extends DxfEntityBase {
  type: 'SOLID' | '3DSOLID';
  vertices: Vector3[];
}

export interface DxfDimensionEntity extends DxfEntityBase {
  type: 'DIMENSION';
  definitionPoint: Vector3;
  textMidPoint: Vector3;
  insertionPoint: Vector3;
  dimensionType: number;
  text?: string;
  rotation?: number;
}

export interface DxfLeaderEntity extends DxfEntityBase {
  type: 'LEADER' | 'MLEADER';
  vertices: Vector3[];
  annotation?: DxfTextEntity;
  arrowhead?: boolean;
}

export interface DxfRayEntity extends DxfEntityBase {
  type: 'RAY' | 'XLINE';
  basePoint: Vector3;
  direction: Vector3;
}

export type DxfEntity = 
  | DxfPointEntity
  | DxfLineEntity
  | DxfPolylineEntity
  | DxfCircleEntity
  | DxfArcEntity
  | DxfEllipseEntity
  | Dxf3DFaceEntity
  | DxfInsertEntity
  | DxfTextEntity
  | DxfSplineEntity
  | DxfHatchEntity
  | DxfSolidEntity
  | DxfDimensionEntity
  | DxfLeaderEntity
  | DxfRayEntity;

export interface DxfData {
  header?: DxfHeader;
  entities: DxfEntity[];
  blocks?: Record<string, DxfBlock>;
  tables?: {
    layer?: {
      layers: Record<string, RawLayerData>;
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
  validate?: boolean;
  onProgress?: (progress: number) => void;
}

export interface BaseParser<T> {
  parse(content: string, context?: ParserContext): Promise<ParserResult<T>>;
  validate(data: T): string[];
}

export interface CustomDxfParserLib {
  parseSync(content: string): DxfData;
}

// Type guards
export function isVector2(v: unknown): v is Vector2 {
  if (!v || typeof v !== 'object') return false;
  const vec = v as any;
  return typeof vec.x === 'number' && 
         typeof vec.y === 'number' && 
         isFinite(vec.x) && 
         isFinite(vec.y);
}

export function isVector3(v: unknown): v is Vector3 {
  if (!isVector2(v)) return false;
  const vec = v as any;
  return vec.z === undefined || (typeof vec.z === 'number' && isFinite(vec.z));
}

export function isDxfEntity(e: unknown): e is DxfEntity {
  if (!e || typeof e !== 'object') return false;
  const entity = e as any;
  
  // Check common properties
  if (typeof entity.type !== 'string') return false;
  if (entity.layer !== undefined && typeof entity.layer !== 'string') return false;
  if (entity.handle !== undefined && typeof entity.handle !== 'string') return false;
  if (entity.color !== undefined && typeof entity.color !== 'number') return false;
  if (entity.colorRGB !== undefined && typeof entity.colorRGB !== 'number') return false;
  if (entity.lineType !== undefined && typeof entity.lineType !== 'string') return false;
  if (entity.lineWeight !== undefined && typeof entity.lineWeight !== 'number') return false;
  if (entity.elevation !== undefined && typeof entity.elevation !== 'number') return false;
  if (entity.thickness !== undefined && typeof entity.thickness !== 'number') return false;
  if (entity.visible !== undefined && typeof entity.visible !== 'boolean') return false;
  if (entity.extrusionDirection !== undefined && !isVector3(entity.extrusionDirection)) return false;

  // Check specific entity types
  switch (entity.type) {
    case 'POINT': return isDxfPointEntity(entity);
    case 'LINE': return isDxfLineEntity(entity);
    case 'POLYLINE':
    case 'LWPOLYLINE': return isDxfPolylineEntity(entity);
    case 'CIRCLE': return isDxfCircleEntity(entity);
    case 'ARC': return isDxfArcEntity(entity);
    case 'ELLIPSE': return isDxfEllipseEntity(entity);
    case '3DFACE': return isDxf3DFaceEntity(entity);
    case 'INSERT': return isDxfInsertEntity(entity);
    case 'TEXT':
    case 'MTEXT': return isDxfTextEntity(entity);
    case 'SPLINE': return isDxfSplineEntity(entity);
    default: return false;
  }
}

export function isDxfTextEntity(e: unknown): e is DxfTextEntity {
  if (!e || typeof e !== 'object') return false;
  const entity = e as any;
  return (entity.type === 'TEXT' || entity.type === 'MTEXT') && 
         isVector3(entity.position) && 
         typeof entity.text === 'string';
}

export function isDxfSplineEntity(e: unknown): e is DxfSplineEntity {
  if (!e || typeof e !== 'object') return false;
  const entity = e as any;
  return entity.type === 'SPLINE' && 
         Array.isArray(entity.controlPoints) && 
         entity.controlPoints.every((p: unknown) => isVector3(p)) && 
         typeof entity.degree === 'number';
}

export function isDxfPointEntity(e: unknown): e is DxfPointEntity {
  if (!e || typeof e !== 'object') return false;
  const entity = e as any;
  return entity.type === 'POINT' && isVector3(entity.position);
}

export function isDxfLineEntity(e: unknown): e is DxfLineEntity {
  if (!e || typeof e !== 'object') return false;
  const entity = e as any;
  return entity.type === 'LINE' && 
         isVector3(entity.start) && 
         isVector3(entity.end);
}

export function isDxfPolylineEntity(e: unknown): e is DxfPolylineEntity {
  if (!e || typeof e !== 'object') return false;
  const entity = e as any;
  return (entity.type === 'POLYLINE' || entity.type === 'LWPOLYLINE') && 
         Array.isArray(entity.vertices) && 
         entity.vertices.every((v: unknown) => isVector3(v));
}

export function isDxfCircleEntity(e: unknown): e is DxfCircleEntity {
  if (!e || typeof e !== 'object') return false;
  const entity = e as any;
  return entity.type === 'CIRCLE' && 
         isVector3(entity.center) && 
         typeof entity.radius === 'number' &&
         isFinite(entity.radius);
}

export function isDxfArcEntity(e: unknown): e is DxfArcEntity {
  if (!e || typeof e !== 'object') return false;
  const entity = e as any;
  return entity.type === 'ARC' && 
         isVector3(entity.center) && 
         typeof entity.radius === 'number' &&
         isFinite(entity.radius) &&
         typeof entity.startAngle === 'number' &&
         typeof entity.endAngle === 'number' &&
         isFinite(entity.startAngle) &&
         isFinite(entity.endAngle);
}

export function isDxfEllipseEntity(e: unknown): e is DxfEllipseEntity {
  if (!e || typeof e !== 'object') return false;
  const entity = e as any;
  return entity.type === 'ELLIPSE' && 
         isVector3(entity.center) && 
         isVector3(entity.majorAxis) &&
         typeof entity.minorAxisRatio === 'number' &&
         typeof entity.startAngle === 'number' && 
         typeof entity.endAngle === 'number' &&
         isFinite(entity.minorAxisRatio) &&
         isFinite(entity.startAngle) &&
         isFinite(entity.endAngle);
}

export function isDxfInsertEntity(e: unknown): e is DxfInsertEntity {
  if (!e || typeof e !== 'object') return false;
  const entity = e as any;
  return entity.type === 'INSERT' && 
         isVector3(entity.position) && 
         typeof entity.block === 'string';
}

export function isDxf3DFaceEntity(e: unknown): e is Dxf3DFaceEntity {
  if (!e || typeof e !== 'object') return false;
  const entity = e as any;
  return entity.type === '3DFACE' && 
         Array.isArray(entity.vertices) && 
         entity.vertices.length === 4 &&
         entity.vertices.every((v: unknown) => isVector3(v));
}
