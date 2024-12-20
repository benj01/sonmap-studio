// Base types for geometry
export interface Point2D {
  x: number;
  y: number;
}

export interface Point3D extends Point2D {
  z: number;
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

// Type guards
export function isCircleEntity(entity: DxfEntityBase): entity is CircleEntity {
  return entity.type === 'CIRCLE' && 'center' in entity && 'radius' in entity;
}

export function isArcEntity(entity: DxfEntityBase): entity is ArcEntity {
  return entity.type === 'ARC' && 'center' in entity && 'radius' in entity &&
    'startAngle' in entity && 'endAngle' in entity;
}

export function isEllipseEntity(entity: DxfEntityBase): entity is EllipseEntity {
  return entity.type === 'ELLIPSE' && 'center' in entity && 
    'majorAxis' in entity && 'minorAxisRatio' in entity &&
    'startAngle' in entity && 'endAngle' in entity;
}

export function isPolylineEntity(entity: DxfEntityBase): entity is PolylineEntity | LWPolylineEntity {
  return (entity.type === 'POLYLINE' || entity.type === 'LWPOLYLINE') &&
    'vertices' in entity && Array.isArray(entity.vertices);
}

export function isTextEntity(entity: DxfEntityBase): entity is TextEntity | MTextEntity {
  return (entity.type === 'TEXT' || entity.type === 'MTEXT') &&
    'position' in entity && 'text' in entity;
}

export function isSplineEntity(entity: DxfEntityBase): entity is SplineEntity {
  return entity.type === 'SPLINE' && 
    'controlPoints' in entity && Array.isArray(entity.controlPoints) &&
    'degree' in entity;
}

// Common types
export type CircularEntity = CircleEntity | ArcEntity;
export type LinearEntity = PolylineEntity | LWPolylineEntity;
export type TextualEntity = TextEntity | MTextEntity;
