// Basic vector types
export interface Vector2 {
  x: number;
  y: number;
}

export interface Vector3 extends Vector2 {
  z?: number;
}

// Raw layer data from DXF file
export interface RawLayerData {
  name: string;
  color?: number;
  colorRGB?: number;
  lineType?: string;
  lineWeight?: number;
  flags?: number;  // Added flags property for raw layer data
}

// Processed layer information
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

// Base entity interface
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

// Entity type definitions
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
  name: string;
  position: Vector3;
  rotation?: number;
  scale?: Vector3;
  rows?: number;
  columns?: number;
  rowSpacing?: number;
  colSpacing?: number;
}

// Union type for all DXF entities
export type DxfEntity = 
  | Dxf3DFaceEntity
  | DxfPointEntity
  | DxfLineEntity
  | DxfPolylineEntity
  | DxfCircleEntity
  | DxfArcEntity
  | DxfEllipseEntity
  | DxfInsertEntity;

// Block definitions
export interface DxfBlock {
  name: string;
  position: Vector3;
  entities: DxfEntity[];
  layer: string;
}

// Tables structure
export interface DxfTables {
  layer?: {
    layers: Record<string, RawLayerData>;
  };
}

// Main DXF data structure
export interface DxfData {
  entities: DxfEntity[];
  blocks?: Record<string, DxfBlock>;
  tables?: DxfTables;
}

// Type guards
export const isVector2 = (value: unknown): value is Vector2 => {
  if (!value || typeof value !== 'object') return false;
  const point = value as any;
  return typeof point.x === 'number' && 
         typeof point.y === 'number' &&
         isFinite(point.x) && 
         isFinite(point.y);
};

export const isVector3 = (value: unknown): value is Vector3 => {
  if (!isVector2(value)) return false;
  const point = value as any;
  return point.z === undefined || 
         (typeof point.z === 'number' && isFinite(point.z));
};

// Entity type guards
export const isDxf3DFaceEntity = (entity: unknown): entity is Dxf3DFaceEntity => {
  if (!entity || typeof entity !== 'object') return false;
  const e = entity as any;
  return e.type === '3DFACE' && 
         Array.isArray(e.vertices) && 
         e.vertices.length === 4 &&
         e.vertices.every((v: unknown) => isVector3(v));
};

export const isDxfPointEntity = (entity: unknown): entity is DxfPointEntity => {
  if (!entity || typeof entity !== 'object') return false;
  const e = entity as any;
  return e.type === 'POINT' && e.position && isVector3(e.position);
};

export const isDxfLineEntity = (entity: unknown): entity is DxfLineEntity => {
  if (!entity || typeof entity !== 'object') return false;
  const e = entity as any;
  return e.type === 'LINE' && 
         e.start && isVector3(e.start) && 
         e.end && isVector3(e.end);
};

export const isDxfPolylineEntity = (entity: unknown): entity is DxfPolylineEntity => {
  if (!entity || typeof entity !== 'object') return false;
  const e = entity as any;
  return (e.type === 'POLYLINE' || e.type === 'LWPOLYLINE') && 
         Array.isArray(e.vertices) && 
         e.vertices.every((v: unknown) => isVector3(v));
};

export const isDxfCircleEntity = (entity: unknown): entity is DxfCircleEntity => {
  if (!entity || typeof entity !== 'object') return false;
  const e = entity as any;
  return e.type === 'CIRCLE' && 
         e.center && isVector3(e.center) && 
         typeof e.radius === 'number' &&
         isFinite(e.radius);
};

export const isDxfArcEntity = (entity: unknown): entity is DxfArcEntity => {
  if (!isDxfCircleEntity(entity)) return false;
  const e = entity as any;
  return e.type === 'ARC' && 
         typeof e.startAngle === 'number' && 
         typeof e.endAngle === 'number' &&
         isFinite(e.startAngle) && 
         isFinite(e.endAngle);
};

export const isDxfEllipseEntity = (entity: unknown): entity is DxfEllipseEntity => {
  if (!entity || typeof entity !== 'object') return false;
  const e = entity as any;
  return e.type === 'ELLIPSE' && 
         e.center && isVector3(e.center) && 
         e.majorAxis && isVector3(e.majorAxis) &&
         typeof e.minorAxisRatio === 'number' &&
         typeof e.startAngle === 'number' &&
         typeof e.endAngle === 'number' &&
         isFinite(e.minorAxisRatio) &&
         isFinite(e.startAngle) &&
         isFinite(e.endAngle);
};

export const isDxfInsertEntity = (entity: unknown): entity is DxfInsertEntity => {
  if (!entity || typeof entity !== 'object') return false;
  const e = entity as any;
  return e.type === 'INSERT' && 
         typeof e.name === 'string' &&
         e.position && isVector3(e.position);
};

export const isDxfEntity = (entity: unknown): entity is DxfEntity => {
  if (!entity || typeof entity !== 'object') return false;
  const e = entity as any;
  
  switch (e.type) {
    case '3DFACE':
      return isDxf3DFaceEntity(e);
    case 'POINT':
      return isDxfPointEntity(e);
    case 'LINE':
      return isDxfLineEntity(e);
    case 'POLYLINE':
    case 'LWPOLYLINE':
      return isDxfPolylineEntity(e);
    case 'CIRCLE':
      return isDxfCircleEntity(e);
    case 'ARC':
      return isDxfArcEntity(e);
    case 'ELLIPSE':
      return isDxfEllipseEntity(e);
    case 'INSERT':
      return isDxfInsertEntity(e);
    default:
      return false;
  }
};
