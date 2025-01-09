/**
 * PostGIS geometry types supported by the DXF processor
 */
export type PostGISGeometryType = 
  | 'POINT'
  | 'LINESTRING'
  | 'POLYGON'
  | 'MULTIPOINT'
  | 'MULTILINESTRING'
  | 'MULTIPOLYGON'
  | 'GEOMETRYCOLLECTION';

/**
 * Type guard to check if a string is a valid PostGIS geometry type
 */
export function isPostGISGeometryType(type: string): type is PostGISGeometryType {
  return [
    'POINT',
    'LINESTRING',
    'POLYGON',
    'MULTIPOINT',
    'MULTILINESTRING',
    'MULTIPOLYGON',
    'GEOMETRYCOLLECTION'
  ].includes(type);
}

/**
 * Coordinate types for different geometry types
 */
export type Point = [number, number];
export type LineString = Point[];
export type Polygon = LineString[];
export type MultiPoint = Point[];
export type MultiLineString = LineString[];
export type MultiPolygon = Polygon[];

/**
 * Base geometry interface with strict coordinate typing
 */
export interface BaseGeometry {
  type: PostGISGeometryType;
  coordinates: Point | LineString | Polygon | MultiPoint | MultiLineString | MultiPolygon;
}

/**
 * PostGIS geometry representation with type-specific coordinates
 */
export type PostGISGeometry = 
  | PostGISPoint 
  | PostGISLineString 
  | PostGISPolygon 
  | PostGISMultiPoint 
  | PostGISMultiLineString 
  | PostGISMultiPolygon 
  | PostGISGeometryCollection;

export interface PostGISGeometryBase {
  /** Spatial reference identifier */
  srid: number;
  /** Well-Known Text (WKT) representation of geometry */
  wkt: string;
  /** Original DXF entity attributes */
  attributes?: {
    /** Layer name */
    layer?: string;
    /** Line type */
    lineType?: string;
    /** Color number */
    color?: number;
    /** Line weight */
    lineWeight?: number;
    /** Additional properties */
    [key: string]: unknown;
  };
}

export interface PostGISPoint extends PostGISGeometryBase {
  type: 'POINT';
  coordinates: Point;
}

export interface PostGISLineString extends PostGISGeometryBase {
  type: 'LINESTRING';
  coordinates: LineString;
}

export interface PostGISPolygon extends PostGISGeometryBase {
  type: 'POLYGON';
  coordinates: Polygon;
}

export interface PostGISMultiPoint extends PostGISGeometryBase {
  type: 'MULTIPOINT';
  coordinates: MultiPoint;
}

export interface PostGISMultiLineString extends PostGISGeometryBase {
  type: 'MULTILINESTRING';
  coordinates: MultiLineString;
}

export interface PostGISMultiPolygon extends PostGISGeometryBase {
  type: 'MULTIPOLYGON';
  coordinates: MultiPolygon;
}

export interface PostGISGeometryCollection extends PostGISGeometryBase {
  type: 'GEOMETRYCOLLECTION';
  geometries: PostGISGeometry[];
}

/**
 * Type guards for PostGIS geometries
 */
export function isPostGISPoint(geom: PostGISGeometry): geom is PostGISPoint {
  return geom.type === 'POINT';
}

export function isPostGISLineString(geom: PostGISGeometry): geom is PostGISLineString {
  return geom.type === 'LINESTRING';
}

export function isPostGISPolygon(geom: PostGISGeometry): geom is PostGISPolygon {
  return geom.type === 'POLYGON';
}

export function isPostGISMultiPoint(geom: PostGISGeometry): geom is PostGISMultiPoint {
  return geom.type === 'MULTIPOINT';
}

export function isPostGISMultiLineString(geom: PostGISGeometry): geom is PostGISMultiLineString {
  return geom.type === 'MULTILINESTRING';
}

export function isPostGISMultiPolygon(geom: PostGISGeometry): geom is PostGISMultiPolygon {
  return geom.type === 'MULTIPOLYGON';
}

export function isPostGISGeometryCollection(geom: PostGISGeometry): geom is PostGISGeometryCollection {
  return geom.type === 'GEOMETRYCOLLECTION';
}

/**
 * PostGIS feature collection
 */
export interface PostGISFeatureCollection {
  /** Collection identifier */
  id: string;
  /** Collection name */
  name: string;
  /** Collection description */
  description?: string;
  /** Spatial reference identifier */
  srid: number;
  /** Collection properties */
  properties?: Record<string, unknown>;
}

/**
 * PostGIS preview collection
 */
export interface PostGISPreview {
  /** Preview type identifier */
  type: 'PostGISFeatureCollection';
  /** Feature collection */
  collection: PostGISFeatureCollection;
  /** Preview features */
  features: PostGISFeature[];
}

/**
 * PostGIS layer
 */
export interface PostGISLayer {
  /** Layer identifier */
  id: string;
  /** Collection identifier */
  collectionId: string;
  /** Layer name */
  name: string;
  /** Layer type */
  type: string;
  /** Layer properties */
  properties?: Record<string, unknown>;
}

/**
 * PostGIS feature compatible with GeoJSON Feature
 */
export interface PostGISFeature {
  /** Feature type identifier (GeoJSON compatibility) */
  type: 'Feature';
  /** Feature identifier */
  id: string;
  /** Layer identifier */
  layerId: string;
  /** Feature geometry */
  geometry: PostGISGeometry;
  /** Feature properties */
  properties?: Record<string, unknown>;
  /** GeoJSON compatibility */
  bbox?: number[];
}

/**
 * PostGIS feature collection compatible with GeoJSON
 */
export interface PostGISFeatureCollection {
  /** Collection type identifier */
  type: 'FeatureCollection';
  /** Collection identifier */
  id: string;
  /** Collection name */
  name: string;
  /** Collection description */
  description?: string;
  /** Spatial reference identifier */
  srid: number;
  /** Collection properties */
  properties?: Record<string, unknown>;
  /** Collection features */
  features: PostGISFeature[];
  /** GeoJSON compatibility */
  bbox?: number[];
}


/**
 * PostGIS import options
 */
export interface PostGISImportOptions {
  /** Whether to validate geometries before import */
  validateGeometry?: boolean;
  /** Whether to transform coordinates to target SRID */
  transformCoordinates?: boolean;
  /** Source SRID of the input geometries */
  sourceSrid?: number;
  /** Target SRID for coordinate transformation */
  targetSrid?: number;
  /** Whether to preserve original entity attributes */
  preserveAttributes?: boolean;
  /** Batch size for bulk imports */
  batchSize?: number;
}

/**
 * PostGIS import result
 */
export interface PostGISImportResult {
  /** Collection identifier */
  collectionId: string;
  /** Number of layers imported */
  layerCount: number;
  /** Number of features imported */
  featureCount: number;
  /** Any issues encountered during import */
  issues?: Array<{
    type: string;
    message: string;
    details?: Record<string, unknown>;
  }>;
}
