/**
 * Coordinate system constants
 */
export const COORDINATE_SYSTEMS = {
  NONE: 'none',
  WGS84: 'EPSG:4326',
  SWISS_LV95: 'EPSG:2056',
  SWISS_LV03: 'EPSG:21781'
} as const;

/**
 * Type for valid coordinate systems
 */
export type CoordinateSystem = typeof COORDINATE_SYSTEMS[keyof typeof COORDINATE_SYSTEMS];

/**
 * Base interface for coordinates
 */
export interface BaseCoordinate {
  readonly x: number;
  readonly y: number;
  readonly z?: number;
}

/**
 * WGS84 coordinates (longitude, latitude)
 */
export interface WGS84Coordinate extends BaseCoordinate {
  readonly x: number; // longitude (-180 to 180)
  readonly y: number; // latitude (-90 to 90)
}

/**
 * Swiss LV95 coordinates
 */
export interface SwissLV95Coordinate extends BaseCoordinate {
  readonly x: number; // easting (2000000 to 3000000)
  readonly y: number; // northing (1000000 to 2000000)
}

/**
 * Swiss LV03 coordinates
 */
export interface SwissLV03Coordinate extends BaseCoordinate {
  readonly x: number; // easting (480000 to 850000)
  readonly y: number; // northing (70000 to 310000)
}

/**
 * Union type for all coordinate types
 */
export type Coordinate = WGS84Coordinate | SwissLV95Coordinate | SwissLV03Coordinate;

/**
 * Bounds interface
 */
export interface Bounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/**
 * Default center coordinates (Aarau, Switzerland)
 */
export const DEFAULT_CENTER = {
  longitude: 8.0472,
  latitude: 47.3892,
  zoom: 12
} as const;

/**
 * Type guard for WGS84 coordinates
 */
export function isWGS84Coordinate(coord: BaseCoordinate): coord is WGS84Coordinate {
  return (
    isFinite(coord.x) &&
    isFinite(coord.y) &&
    coord.x >= -180 &&
    coord.x <= 180 &&
    coord.y >= -90 &&
    coord.y <= 90
  );
}

/**
 * Type guard for Swiss LV95 coordinates
 */
export function isSwissLV95Coordinate(coord: BaseCoordinate): coord is SwissLV95Coordinate {
  return (
    isFinite(coord.x) &&
    isFinite(coord.y) &&
    coord.x >= 2000000 &&
    coord.x <= 3000000 &&
    coord.y >= 1000000 &&
    coord.y <= 2000000
  );
}

/**
 * Type guard for Swiss LV03 coordinates
 */
export function isSwissLV03Coordinate(coord: BaseCoordinate): coord is SwissLV03Coordinate {
  return (
    isFinite(coord.x) &&
    isFinite(coord.y) &&
    coord.x >= 480000 &&
    coord.x <= 850000 &&
    coord.y >= 70000 &&
    coord.y <= 310000
  );
}

/**
 * Check if a coordinate system is a Swiss system
 */
export function isSwissSystem(system: CoordinateSystem): boolean {
  return system === COORDINATE_SYSTEMS.SWISS_LV95 || system === COORDINATE_SYSTEMS.SWISS_LV03;
}

/**
 * Validate coordinates for a given coordinate system
 */
export function validateCoordinates(coord: BaseCoordinate, system: CoordinateSystem): boolean {
  if (!isFinite(coord.x) || !isFinite(coord.y)) {
    return false;
  }

  if (coord.z !== undefined && !isFinite(coord.z)) {
    return false;
  }

  switch (system) {
    case COORDINATE_SYSTEMS.WGS84:
      return isWGS84Coordinate(coord);
    case COORDINATE_SYSTEMS.SWISS_LV95:
      return isSwissLV95Coordinate(coord);
    case COORDINATE_SYSTEMS.SWISS_LV03:
      return isSwissLV03Coordinate(coord);
    case COORDINATE_SYSTEMS.NONE:
      return true; // No specific validation for local coordinates
    default:
      return false;
  }
}

/**
 * Create a coordinate object for a given coordinate system
 */
export function createCoordinate(x: number, y: number, system: CoordinateSystem, z?: number): Coordinate | null {
  const coord = { x, y, z };
  
  if (!validateCoordinates(coord, system)) {
    return null;
  }

  return coord as Coordinate;
}

/**
 * Create bounds from coordinates
 */
export function createBounds(coords: BaseCoordinate[]): Bounds | null {
  if (!coords.length) {
    return null;
  }

  const bounds = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity
  };

  for (const coord of coords) {
    if (!isFinite(coord.x) || !isFinite(coord.y)) {
      continue;
    }
    bounds.minX = Math.min(bounds.minX, coord.x);
    bounds.minY = Math.min(bounds.minY, coord.y);
    bounds.maxX = Math.max(bounds.maxX, coord.x);
    bounds.maxY = Math.max(bounds.maxY, coord.y);
  }

  if (!isFinite(bounds.minX) || !isFinite(bounds.minY) || 
      !isFinite(bounds.maxX) || !isFinite(bounds.maxY)) {
    return null;
  }

  return bounds;
}

/**
 * Add padding to bounds
 */
export function addBoundsPadding(bounds: Bounds, padding: number): Bounds {
  const dx = (bounds.maxX - bounds.minX) * padding;
  const dy = (bounds.maxY - bounds.minY) * padding;

  return {
    minX: bounds.minX - dx,
    minY: bounds.minY - dy,
    maxX: bounds.maxX + dx,
    maxY: bounds.maxY + dy
  };
}

/**
 * Check if bounds are valid
 */
export function isValidBounds(bounds: Bounds): boolean {
  return (
    isFinite(bounds.minX) &&
    isFinite(bounds.minY) &&
    isFinite(bounds.maxX) &&
    isFinite(bounds.maxY) &&
    bounds.minX <= bounds.maxX &&
    bounds.minY <= bounds.maxY
  );
}
