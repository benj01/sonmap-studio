// Base types for geometry
export interface Point2D {
  x: number;
  y: number;
}

export interface Point3D {
  x: number;
  y: number;
  z?: number;
}

// Style properties interface
export interface DxfStyleProperties {
  color?: number;
  colorRGB?: number;
  lineType?: string;
  lineWeight?: number;
  visible?: boolean;
}

// Base interface for all DXF entities
export interface DxfEntityBase extends DxfStyleProperties {
  type: string;
  handle?: string;
  layer?: string;
}

// Base interface for circular entities
export interface CircularEntityBase extends DxfEntityBase {
  center: Point3D;
  radius: number;
}

export interface CircleEntity extends CircularEntityBase {
  type: 'CIRCLE';
}

export interface ArcEntity extends CircularEntityBase {
  type: 'ARC';
  startAngle: number;
  endAngle: number;
}

export interface EllipseEntity extends DxfEntityBase {
  type: 'ELLIPSE';
  center: Point3D;
  majorAxis: Point3D;
  minorAxisRatio: number;
  startAngle: number;
  endAngle: number;
}

// Polyline entities
export interface PolylineVertex extends Point3D {
  bulge?: number;
}

export interface PolylineEntityBase extends DxfEntityBase {
  vertices: PolylineVertex[];
  closed?: boolean;
}

export interface PolylineEntity extends PolylineEntityBase {
  type: 'POLYLINE';
}

export interface LWPolylineEntity extends PolylineEntityBase {
  type: 'LWPOLYLINE';
}

// Text entities
export interface TextStyleBase {
  height: number;
  rotation?: number;
  width?: number;
  style?: string;
  horizontalAlignment?: string;
  verticalAlignment?: string;
}

export interface TextEntityBase extends DxfEntityBase, TextStyleBase {
  position: Point3D;
  text: string;
}

export interface TextEntity extends TextEntityBase {
  type: 'TEXT';
}

export interface MTextEntity extends TextEntityBase {
  type: 'MTEXT';
  // Additional MText-specific properties
  attachmentPoint?: number;
  drawingDirection?: number;
  lineSpacingStyle?: number;
  lineSpacingFactor?: number;
}

// Spline entities
export interface SplineEntity extends DxfEntityBase {
  type: 'SPLINE';
  degree: number;
  closed: boolean;
  controlPoints: Point3D[];
  knots?: number[];
  weights?: number[];
  fitPoints?: Point3D[];
}

// Helper functions for coordinate validation
export function isValidPoint2D(point: unknown): point is Point2D {
  if (!point || typeof point !== 'object') return false;
  const p = point as any;
  return typeof p.x === 'number' && isFinite(p.x) &&
         typeof p.y === 'number' && isFinite(p.y);
}

export function isValidPoint3D(point: unknown): point is Point3D {
  if (!isValidPoint2D(point)) return false;
  const p = point as any;
  return typeof p.z === 'undefined' || (typeof p.z === 'number' && isFinite(p.z));
}

export function isValidPoints3D(points: unknown): points is Point3D[] {
  return Array.isArray(points) && points.every(isValidPoint3D);
}

// Type guards with enhanced validation
export function isCircleEntity(entity: DxfEntityBase): entity is CircleEntity {
  return entity.type === 'CIRCLE' &&
    'center' in entity && isValidPoint3D(entity.center) &&
    'radius' in entity && typeof entity.radius === 'number' && isFinite(entity.radius) && entity.radius > 0;
}

export function isArcEntity(entity: DxfEntityBase): entity is ArcEntity {
  return entity.type === 'ARC' &&
    'center' in entity && isValidPoint3D(entity.center) &&
    'radius' in entity && typeof entity.radius === 'number' && isFinite(entity.radius) && entity.radius > 0 &&
    'startAngle' in entity && typeof entity.startAngle === 'number' && isFinite(entity.startAngle) &&
    'endAngle' in entity && typeof entity.endAngle === 'number' && isFinite(entity.endAngle);
}

export function isEllipseEntity(entity: DxfEntityBase): entity is EllipseEntity {
  return entity.type === 'ELLIPSE' &&
    'center' in entity && isValidPoint3D(entity.center) &&
    'majorAxis' in entity && isValidPoint3D(entity.majorAxis) &&
    'minorAxisRatio' in entity && typeof entity.minorAxisRatio === 'number' &&
    isFinite(entity.minorAxisRatio) && entity.minorAxisRatio > 0 &&
    'startAngle' in entity && typeof entity.startAngle === 'number' && isFinite(entity.startAngle) &&
    'endAngle' in entity && typeof entity.endAngle === 'number' && isFinite(entity.endAngle);
}

export function isPolylineEntity(entity: DxfEntityBase): entity is PolylineEntity | LWPolylineEntity {
  return (entity.type === 'POLYLINE' || entity.type === 'LWPOLYLINE') &&
    'vertices' in entity && Array.isArray(entity.vertices) &&
    entity.vertices.length > 0 && entity.vertices.every(isValidPoint3D);
}

export function isTextEntity(entity: DxfEntityBase): entity is TextEntity | MTextEntity {
  return (entity.type === 'TEXT' || entity.type === 'MTEXT') &&
    'position' in entity && isValidPoint3D(entity.position) &&
    'text' in entity && typeof entity.text === 'string' &&
    (!('height' in entity) || (typeof entity.height === 'number' && isFinite(entity.height)));
}

export function isSplineEntity(entity: DxfEntityBase): entity is SplineEntity {
  return entity.type === 'SPLINE' &&
    'controlPoints' in entity && isValidPoints3D(entity.controlPoints) &&
    'degree' in entity && typeof entity.degree === 'number' && entity.degree >= 1 &&
    (!('knots' in entity) || (Array.isArray(entity.knots) && entity.knots.every(k => typeof k === 'number' && isFinite(k)))) &&
    (!('weights' in entity) || (Array.isArray(entity.weights) && entity.weights.every(w => typeof w === 'number' && isFinite(w)))) &&
    (!('fitPoints' in entity) || isValidPoints3D(entity.fitPoints));
}

// Common types
export type CircularEntity = CircleEntity | ArcEntity;
export type LinearEntity = PolylineEntity | LWPolylineEntity;
export type TextualEntity = TextEntity | MTextEntity;
