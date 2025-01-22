import { Position } from 'geojson';

/**
 * Available coordinate systems
 */
export const COORDINATE_SYSTEMS = {
  /** No specific coordinate system (treated as WGS84) */
  NONE: 'none',
  /** WGS84 (EPSG:4326) - Global latitude/longitude */
  WGS84: 'EPSG:4326',
  /** Swiss LV95 (EPSG:2056) - Swiss coordinates, newer system */
  SWISS_LV95: 'EPSG:2056',
  /** Swiss LV03 (EPSG:21781) - Swiss coordinates, older system */
  SWISS_LV03: 'EPSG:21781',
  /** Web Mercator (EPSG:3857) - Web mapping projection */
  WEB_MERCATOR: 'EPSG:3857'
} as const;

/** Type for coordinate system identifiers */
export type CoordinateSystem = typeof COORDINATE_SYSTEMS[keyof typeof COORDINATE_SYSTEMS];

/**
 * Represents a point with x and y coordinates
 */
export interface CoordinatePoint {
  /** x coordinate (longitude for WGS84, easting for projected systems) */
  x: number;
  /** y coordinate (latitude for WGS84, northing for projected systems) */
  y: number;
}

/**
 * Represents a bounding box with min/max coordinates
 */
export interface Bounds {
  /** Minimum x coordinate */
  minX: number;
  /** Minimum y coordinate */
  minY: number;
  /** Maximum x coordinate */
  maxX: number;
  /** Maximum y coordinate */
  maxY: number;
  /** Flag indicating if coordinates are transformed */
  _transformedCoordinates?: boolean;
}

/**
 * Represents a bounding box with transformed coordinates
 */
export interface TransformedBounds extends Bounds {
  /** Flag indicating coordinates are transformed (always true) */
  _transformedCoordinates: true;
}

/** GeoJSON coordinate type alias */
export type Coordinate = Position;

/** GeoJSON ring (polygon boundary) type alias */
export type Ring = Coordinate[];

/**
 * Default map view settings centered on Switzerland (Aarau)
 */
export const DEFAULT_CENTER = {
  /** Aarau longitude */
  longitude: 8.0472,
  /** Aarau latitude */
  latitude: 47.3925,
  /** Default zoom level */
  zoom: 13
} as const;

/**
 * Check if a coordinate system is Swiss (LV95 or LV03)
 * @param system The coordinate system to check
 * @returns true if the system is Swiss, false otherwise
 */
export function isSwissSystem(system: CoordinateSystem): boolean {
  return system === COORDINATE_SYSTEMS.SWISS_LV95 || system === COORDINATE_SYSTEMS.SWISS_LV03;
}

/**
 * Check if a coordinate system is WGS84 or none
 * @param system The coordinate system to check
 * @returns true if the system is WGS84 or none, false otherwise
 */
export function isWGS84System(system: CoordinateSystem): boolean {
  return system === COORDINATE_SYSTEMS.WGS84 || system === COORDINATE_SYSTEMS.NONE;
}

/**
 * Check if a coordinate system is Web Mercator
 * @param system The coordinate system to check
 * @returns true if the system is Web Mercator, false otherwise
 */
export function isWebMercatorSystem(system: CoordinateSystem): boolean {
  return system === COORDINATE_SYSTEMS.WEB_MERCATOR;
}

/**
 * Validate a coordinate point
 * @param point The point to validate
 * @returns true if the point is valid, false otherwise
 */
export function isValidPoint(point: unknown): point is CoordinatePoint {
  return typeof point === 'object' &&
         point !== null &&
         'x' in point &&
         'y' in point &&
         typeof (point as CoordinatePoint).x === 'number' &&
         typeof (point as CoordinatePoint).y === 'number' &&
         isFinite((point as CoordinatePoint).x) &&
         isFinite((point as CoordinatePoint).y);
}

/**
 * Validate bounds
 * @param bounds The bounds to validate
 * @returns true if the bounds are valid, false otherwise
 */
export function isValidBounds(bounds: unknown): bounds is Bounds {
  return typeof bounds === 'object' &&
         bounds !== null &&
         'minX' in bounds &&
         'minY' in bounds &&
         'maxX' in bounds &&
         'maxY' in bounds &&
         typeof (bounds as Bounds).minX === 'number' &&
         typeof (bounds as Bounds).minY === 'number' &&
         typeof (bounds as Bounds).maxX === 'number' &&
         typeof (bounds as Bounds).maxY === 'number' &&
         isFinite((bounds as Bounds).minX) &&
         isFinite((bounds as Bounds).minY) &&
         isFinite((bounds as Bounds).maxX) &&
         isFinite((bounds as Bounds).maxY) &&
         (bounds as Bounds).minX <= (bounds as Bounds).maxX &&
         (bounds as Bounds).minY <= (bounds as Bounds).maxY;
}

/**
 * Check if coordinates are within WGS84 range
 * @param point The point to check
 * @returns true if coordinates are in WGS84 range, false otherwise
 */
export function isWGS84Range(point: CoordinatePoint): boolean {
  return point.x >= -180 && point.x <= 180 &&
         point.y >= -90 && point.y <= 90;
}

/**
 * Convert a GeoJSON Position to a CoordinatePoint
 * @param position GeoJSON Position array [longitude, latitude]
 * @returns CoordinatePoint object
 */
export function positionToPoint(position: Position): CoordinatePoint {
  return {
    x: position[0],  // longitude
    y: position[1]   // latitude
  };
}

/**
 * Convert a CoordinatePoint to a GeoJSON Position
 * @param point CoordinatePoint object
 * @returns GeoJSON Position array [longitude, latitude]
 */
export function pointToPosition(point: CoordinatePoint): Position {
  return [point.x, point.y];
}

/**
 * Check if bounds have been transformed
 * @param bounds The bounds to check
 * @returns true if the bounds are transformed, false otherwise
 */
export function isTransformedBounds(bounds: Bounds): bounds is TransformedBounds {
  return bounds._transformedCoordinates === true;
}
