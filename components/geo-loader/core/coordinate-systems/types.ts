/**
 * Coordinate system definition
 */
export interface CoordinateSystemDefinition {
  code: string;
  name: string;
  proj4def: string;
}

/**
 * Point in a coordinate system
 */
export interface CoordinatePoint {
  x: number;
  y: number;
}

/**
 * Test point for coordinate system validation
 */
export interface TestPoint {
  point: [number, number];
  expectedWGS84: [number, number];
  tolerance: number;
}

/**
 * Cache key for coordinate transformations
 */
export interface TransformationCacheKey {
  fromSystem: string;
  toSystem: string;
  x: number;
  y: number;
}
