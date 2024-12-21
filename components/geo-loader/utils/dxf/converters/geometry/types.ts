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

// 3DFACE entity
export interface Face3DEntity extends DxfEntityBase {
  type: '3DFACE';
  vertices: [Point3D, Point3D, Point3D, Point3D?];
}

export function is3DFaceEntity(entity: DxfEntityBase): entity is Face3DEntity {
  return entity.type === '3DFACE' &&
    'vertices' in entity && Array.isArray(entity.vertices) &&
    entity.vertices.length >= 3 && entity.vertices.length <= 4 &&
    entity.vertices.every(isValidPoint3D);
}

// INSERT entity
export interface InsertEntity extends DxfEntityBase {
  type: 'INSERT';
  position: Point3D;
  name: string;  // Block name to insert
  xScale?: number;
  yScale?: number;
  zScale?: number;
  rotation?: number;
  columnCount?: number;
  rowCount?: number;
  columnSpacing?: number;
  rowSpacing?: number;
}

export function isInsertEntity(entity: DxfEntityBase): entity is InsertEntity {
  return entity.type === 'INSERT' &&
    'position' in entity && isValidPoint3D(entity.position) &&
    'name' in entity && typeof entity.name === 'string' &&
    (!('xScale' in entity) || (typeof entity.xScale === 'number' && isFinite(entity.xScale))) &&
    (!('yScale' in entity) || (typeof entity.yScale === 'number' && isFinite(entity.yScale))) &&
    (!('zScale' in entity) || (typeof entity.zScale === 'number' && isFinite(entity.zScale))) &&
    (!('rotation' in entity) || (typeof entity.rotation === 'number' && isFinite(entity.rotation))) &&
    (!('columnCount' in entity) || (typeof entity.columnCount === 'number' && Number.isInteger(entity.columnCount) && entity.columnCount > 0)) &&
    (!('rowCount' in entity) || (typeof entity.rowCount === 'number' && Number.isInteger(entity.rowCount) && entity.rowCount > 0)) &&
    (!('columnSpacing' in entity) || (typeof entity.columnSpacing === 'number' && isFinite(entity.columnSpacing))) &&
    (!('rowSpacing' in entity) || (typeof entity.rowSpacing === 'number' && isFinite(entity.rowSpacing)));
}

// HATCH entity and related types
export interface HatchBoundaryPath {
  edges: HatchEdge[];
  closed: boolean;
}

export type HatchEdge = 
  | HatchLineEdge 
  | HatchArcEdge 
  | HatchEllipseEdge 
  | HatchSplineEdge;

export interface HatchLineEdge {
  type: 'LINE';
  start: Point2D;
  end: Point2D;
}

export interface HatchArcEdge {
  type: 'ARC';
  center: Point2D;
  radius: number;
  startAngle: number;
  endAngle: number;
  counterclockwise?: boolean;
}

export interface HatchEllipseEdge {
  type: 'ELLIPSE';
  center: Point2D;
  majorAxis: Point2D;
  minorAxisRatio: number;
  startAngle: number;
  endAngle: number;
  counterclockwise?: boolean;
}

export interface HatchSplineEdge {
  type: 'SPLINE';
  degree: number;
  rational: boolean;
  periodic: boolean;
  controlPoints: Point2D[];
  knots?: number[];
  weights?: number[];
}

export interface HatchEntity extends DxfEntityBase {
  type: 'HATCH';
  elevation?: number;
  paths: HatchBoundaryPath[];
  pattern: {
    name: string;
    angle?: number;
    scale?: number;
    solid?: boolean;
  };
}

export function isHatchEntity(entity: DxfEntityBase): entity is HatchEntity {
  return entity.type === 'HATCH' &&
    'paths' in entity && Array.isArray(entity.paths) &&
    entity.paths.every((path: unknown): path is HatchBoundaryPath => {
      if (!path || typeof path !== 'object') return false;
      const p = path as any;
      
      if (!('edges' in p) || !Array.isArray(p.edges)) return false;
      if (!('closed' in p) || typeof p.closed !== 'boolean') return false;
      
      return p.edges.every((edge: unknown) => {
        if (!edge || typeof edge !== 'object') return false;
        const e = edge as any;
        
        if (!('type' in e) || typeof e.type !== 'string') return false;
        
        switch (e.type) {
          case 'LINE':
            return isValidPoint2D(e.start) && isValidPoint2D(e.end);
          case 'ARC':
            return isValidPoint2D(e.center) && 
              typeof e.radius === 'number' && isFinite(e.radius) &&
              typeof e.startAngle === 'number' && isFinite(e.startAngle) &&
              typeof e.endAngle === 'number' && isFinite(e.endAngle);
          case 'ELLIPSE':
            return isValidPoint2D(e.center) && isValidPoint2D(e.majorAxis) &&
              typeof e.minorAxisRatio === 'number' && isFinite(e.minorAxisRatio) &&
              typeof e.startAngle === 'number' && isFinite(e.startAngle) &&
              typeof e.endAngle === 'number' && isFinite(e.endAngle);
          case 'SPLINE':
            return typeof e.degree === 'number' && isFinite(e.degree) &&
              typeof e.rational === 'boolean' &&
              typeof e.periodic === 'boolean' &&
              Array.isArray(e.controlPoints) && e.controlPoints.every(isValidPoint2D);
          default:
            return false;
        }
      });
    }) &&
    'pattern' in entity && entity.pattern && typeof entity.pattern === 'object' &&
    'name' in entity.pattern && typeof entity.pattern.name === 'string' &&
    (!('angle' in entity.pattern) || typeof entity.pattern.angle === 'number') &&
    (!('scale' in entity.pattern) || typeof entity.pattern.scale === 'number') &&
    (!('solid' in entity.pattern) || typeof entity.pattern.solid === 'boolean');
}

// SOLID entity
export interface SolidEntity extends DxfEntityBase {
  type: 'SOLID';
  points: [Point3D, Point3D, Point3D, Point3D];
}

export function isSolidEntity(entity: DxfEntityBase): entity is SolidEntity {
  return entity.type === 'SOLID' &&
    'points' in entity && Array.isArray(entity.points) &&
    entity.points.length === 4 &&
    entity.points.every(isValidPoint3D);
}

// 3DSOLID entity
export interface Solid3DEntity extends DxfEntityBase {
  type: '3DSOLID';
  acisData: string[];  // ACIS data in SAT/SAB format
  version?: number;    // ACIS version number
}

export function isSolid3DEntity(entity: DxfEntityBase): entity is Solid3DEntity {
  return entity.type === '3DSOLID' &&
    'acisData' in entity && Array.isArray(entity.acisData) &&
    entity.acisData.every(line => typeof line === 'string') &&
    (!('version' in entity) || typeof entity.version === 'number');
}

// DIMENSION entity and related types
export type DimensionType = 
  | 'LINEAR'      // Linear dimension
  | 'ALIGNED'     // Aligned dimension
  | 'ANGULAR'     // Angular dimension
  | 'DIAMETER'    // Diameter dimension
  | 'RADIUS'      // Radius dimension
  | 'ORDINATE';   // Ordinate dimension

export interface DimensionStyleOverrides {
  textHeight?: number;
  arrowSize?: number;
  extensionLineOffset?: number;
  extensionLineExtend?: number;
  textGap?: number;
  dimensionLineGap?: number;
}

export interface DimensionEntity extends DxfEntityBase {
  type: 'DIMENSION';
  dimensionType: DimensionType;
  definitionPoint: Point3D;      // Location of dimension line
  textMidPoint?: Point3D;        // Middle point of dimension text
  insertionPoint?: Point3D;      // Insertion point for dimension text
  text?: string;                 // Dimension text (if overridden)
  measurement?: number;          // Actual measurement value
  rotation?: number;             // Rotation angle in degrees
  horizontalDirection?: number;   // Direction of dimension line
  styleOverrides?: DimensionStyleOverrides;
  // Points specific to dimension type
  firstPoint?: Point3D;          // First point of dimension (for linear/aligned/angular)
  secondPoint?: Point3D;         // Second point of dimension (for linear/aligned/angular)
  centerPoint?: Point3D;         // Center point (for radius/diameter)
  angleVertex?: Point3D;         // Vertex point (for angular)
  leaderPoint?: Point3D;         // Leader endpoint (for radius/diameter)
}

export function isDimensionEntity(entity: DxfEntityBase): entity is DimensionEntity {
  return entity.type === 'DIMENSION' &&
    'dimensionType' in entity &&
    ['LINEAR', 'ALIGNED', 'ANGULAR', 'DIAMETER', 'RADIUS', 'ORDINATE'].includes(entity.dimensionType) &&
    'definitionPoint' in entity && isValidPoint3D(entity.definitionPoint) &&
    (!('textMidPoint' in entity) || isValidPoint3D(entity.textMidPoint)) &&
    (!('insertionPoint' in entity) || isValidPoint3D(entity.insertionPoint)) &&
    (!('text' in entity) || typeof entity.text === 'string') &&
    (!('measurement' in entity) || (typeof entity.measurement === 'number' && isFinite(entity.measurement))) &&
    (!('rotation' in entity) || (typeof entity.rotation === 'number' && isFinite(entity.rotation))) &&
    (!('horizontalDirection' in entity) || (typeof entity.horizontalDirection === 'number' && isFinite(entity.horizontalDirection))) &&
    (!('firstPoint' in entity) || isValidPoint3D(entity.firstPoint)) &&
    (!('secondPoint' in entity) || isValidPoint3D(entity.secondPoint)) &&
    (!('centerPoint' in entity) || isValidPoint3D(entity.centerPoint)) &&
    (!('angleVertex' in entity) || isValidPoint3D(entity.angleVertex)) &&
    (!('leaderPoint' in entity) || isValidPoint3D(entity.leaderPoint));
}

// LEADER/MLEADER entities
export interface LeaderVertex extends Point3D {
  type?: 'LINE' | 'SPLINE';  // Vertex type, defaults to LINE
}

export interface LeaderEntity extends DxfEntityBase {
  type: 'LEADER';
  vertices: LeaderVertex[];   // Leader line vertices
  annotation?: {             // Optional text annotation
    position: Point3D;
    text: string;
    height?: number;
    rotation?: number;
    style?: string;
  };
  arrowhead?: {             // Optional arrowhead properties
    size?: number;
    type?: string;
  };
}

export interface MLeaderEntity extends DxfEntityBase {
  type: 'MLEADER';
  leaders: {                // Multiple leader lines
    vertices: LeaderVertex[];
    annotation?: {
      position: Point3D;
      text: string;
      height?: number;
      rotation?: number;
      style?: string;
    };
    arrowhead?: {
      size?: number;
      type?: string;
    };
  }[];
  style?: {                // Optional style overrides
    textHeight?: number;
    arrowSize?: number;
    landingGap?: number;   // Gap between leader and text
    doglegLength?: number; // Length of final leader segment
  };
}

export function isLeaderEntity(entity: DxfEntityBase): entity is LeaderEntity {
  return entity.type === 'LEADER' &&
    'vertices' in entity && Array.isArray(entity.vertices) &&
    entity.vertices.length >= 2 &&
    entity.vertices.every(vertex => 
      isValidPoint3D(vertex) &&
      (!('type' in vertex) || ['LINE', 'SPLINE'].includes(vertex.type))
    ) &&
    (!('annotation' in entity) || (
      typeof entity.annotation === 'object' &&
      entity.annotation !== null &&
      'position' in entity.annotation && isValidPoint3D(entity.annotation.position) &&
      'text' in entity.annotation && typeof entity.annotation.text === 'string' &&
      (!('height' in entity.annotation) || typeof entity.annotation.height === 'number') &&
      (!('rotation' in entity.annotation) || typeof entity.annotation.rotation === 'number') &&
      (!('style' in entity.annotation) || typeof entity.annotation.style === 'string')
    ));
}

export function isMLeaderEntity(entity: DxfEntityBase): entity is MLeaderEntity {
  return entity.type === 'MLEADER' &&
    'leaders' in entity && Array.isArray(entity.leaders) &&
    entity.leaders.length > 0 &&
    entity.leaders.every(leader => 
      'vertices' in leader && Array.isArray(leader.vertices) &&
      leader.vertices.length >= 2 &&
      leader.vertices.every(vertex => 
        isValidPoint3D(vertex) &&
        (!('type' in vertex) || ['LINE', 'SPLINE'].includes(vertex.type))
      ) &&
      (!('annotation' in leader) || (
        typeof leader.annotation === 'object' &&
        leader.annotation !== null &&
        'position' in leader.annotation && isValidPoint3D(leader.annotation.position) &&
        'text' in leader.annotation && typeof leader.annotation.text === 'string' &&
        (!('height' in leader.annotation) || typeof leader.annotation.height === 'number') &&
        (!('rotation' in leader.annotation) || typeof leader.annotation.rotation === 'number') &&
        (!('style' in leader.annotation) || typeof leader.annotation.style === 'string')
      ))
    );
}

// RAY/XLINE entities
export interface RayEntity extends DxfEntityBase {
  type: 'RAY';
  basePoint: Point3D;     // Starting point
  direction: Point3D;     // Direction vector
}

export interface XLineEntity extends DxfEntityBase {
  type: 'XLINE';
  basePoint: Point3D;     // Base point
  direction: Point3D;     // Direction vector
}

export function isRayEntity(entity: DxfEntityBase): entity is RayEntity {
  return entity.type === 'RAY' &&
    'basePoint' in entity && isValidPoint3D(entity.basePoint) &&
    'direction' in entity && isValidPoint3D(entity.direction) &&
    // Direction vector cannot be zero
    (entity.direction.x !== 0 || entity.direction.y !== 0 || (entity.direction.z || 0) !== 0);
}

export function isXLineEntity(entity: DxfEntityBase): entity is XLineEntity {
  return entity.type === 'XLINE' &&
    'basePoint' in entity && isValidPoint3D(entity.basePoint) &&
    'direction' in entity && isValidPoint3D(entity.direction) &&
    // Direction vector cannot be zero
    (entity.direction.x !== 0 || entity.direction.y !== 0 || (entity.direction.z || 0) !== 0);
}

// Common types
export type CircularEntity = CircleEntity | ArcEntity;
export type LinearEntity = PolylineEntity | LWPolylineEntity;
export type TextualEntity = TextEntity | MTextEntity;
