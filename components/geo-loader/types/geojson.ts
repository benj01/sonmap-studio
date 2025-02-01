import { Position, BBox, Feature as GeoJSONFeatureBase, FeatureCollection as GeoJSONFeatureCollectionBase } from 'geojson';

/**
 * GeoJSON geometry types
 */
export type GeoJSONGeometryType = 
  | 'Point'
  | 'LineString'
  | 'Polygon'
  | 'MultiPoint'
  | 'MultiLineString'
  | 'MultiPolygon'
  | 'GeometryCollection';

/**
 * Base interface for all GeoJSON geometries
 */
export interface GeoJSONGeometryBase {
  type: GeoJSONGeometryType;
  bbox?: BBox;
}

/**
 * Point geometry
 */
export interface GeoJSONPoint extends GeoJSONGeometryBase {
  type: 'Point';
  coordinates: Position;
}

/**
 * LineString geometry
 */
export interface GeoJSONLineString extends GeoJSONGeometryBase {
  type: 'LineString';
  coordinates: Position[];
}

/**
 * Polygon geometry
 */
export interface GeoJSONPolygon extends GeoJSONGeometryBase {
  type: 'Polygon';
  coordinates: Position[][];
}

/**
 * MultiPoint geometry
 */
export interface GeoJSONMultiPoint extends GeoJSONGeometryBase {
  type: 'MultiPoint';
  coordinates: Position[];
}

/**
 * MultiLineString geometry
 */
export interface GeoJSONMultiLineString extends GeoJSONGeometryBase {
  type: 'MultiLineString';
  coordinates: Position[][];
}

/**
 * MultiPolygon geometry
 */
export interface GeoJSONMultiPolygon extends GeoJSONGeometryBase {
  type: 'MultiPolygon';
  coordinates: Position[][][];
}

/**
 * GeometryCollection
 */
export interface GeoJSONGeometryCollection extends GeoJSONGeometryBase {
  type: 'GeometryCollection';
  geometries: GeoJSONGeometry[];
}

/**
 * Union type for all GeoJSON geometries
 */
export type GeoJSONGeometry = 
  | GeoJSONPoint
  | GeoJSONLineString
  | GeoJSONPolygon
  | GeoJSONMultiPoint
  | GeoJSONMultiLineString
  | GeoJSONMultiPolygon
  | GeoJSONGeometryCollection;

/**
 * Type guards for GeoJSON geometries
 */
export function isPoint(geom: GeoJSONGeometry): geom is GeoJSONPoint {
  return geom.type === 'Point';
}

export function isLineString(geom: GeoJSONGeometry): geom is GeoJSONLineString {
  return geom.type === 'LineString';
}

export function isPolygon(geom: GeoJSONGeometry): geom is GeoJSONPolygon {
  return geom.type === 'Polygon';
}

export function isMultiPoint(geom: GeoJSONGeometry): geom is GeoJSONMultiPoint {
  return geom.type === 'MultiPoint';
}

export function isMultiLineString(geom: GeoJSONGeometry): geom is GeoJSONMultiLineString {
  return geom.type === 'MultiLineString';
}

export function isMultiPolygon(geom: GeoJSONGeometry): geom is GeoJSONMultiPolygon {
  return geom.type === 'MultiPolygon';
}

export function isGeometryCollection(geom: GeoJSONGeometry): geom is GeoJSONGeometryCollection {
  return geom.type === 'GeometryCollection';
}

/**
 * Type guard for geometries with coordinates
 */
export function isGeometryWithCoordinates(geom: GeoJSONGeometry): geom is Exclude<GeoJSONGeometry, GeoJSONGeometryCollection> {
  return !isGeometryCollection(geom);
}

/**
 * GeoJSON Feature
 */
export interface GeoJSONFeature<G extends GeoJSONGeometry = GeoJSONGeometry, P = any> extends GeoJSONFeatureBase<G, P> {
  type: 'Feature';
  geometry: G;
  properties: P;
  id?: string | number;
  bbox?: BBox;
}

/**
 * GeoJSON FeatureCollection
 */
export interface GeoJSONFeatureCollection<G extends GeoJSONGeometry = GeoJSONGeometry, P = any> extends GeoJSONFeatureCollectionBase<G, P> {
  type: 'FeatureCollection';
  features: Array<GeoJSONFeature<G, P>>;
  bbox?: BBox;
} 