// components/geo-loader/utils/coordinate-utils.ts

import proj4 from 'proj4';
import { COORDINATE_SYSTEMS, CoordinateSystem } from '../types/coordinates';

// Basic Point interface for transformations
interface Point {
  x: number;
  y: number;
  z?: number;
}

/**
 * CoordinateTransformer:
 * Handles coordinate transformations between defined coordinate systems
 * using proj4. It also includes methods to transform points and bounds.
 */
export class CoordinateTransformer {
  private fromSystem: string;
  private toSystem: string;
  private transformer: proj4.Converter;
  private transformationAttempts: Map<string, number> = new Map();
  private readonly MAX_ATTEMPTS = 3;

  constructor(fromSystem: string, toSystem: string) {
    this.fromSystem = fromSystem;
    this.toSystem = toSystem;

    // Validate that the coordinate systems are defined in proj4
    if (!proj4.defs(this.fromSystem)) {
      throw new Error(`Unsupported coordinate system: ${this.fromSystem}`);
    }
    if (!proj4.defs(this.toSystem)) {
      throw new Error(`Unsupported coordinate system: ${this.toSystem}`);
    }

    // Create and store the transformer for reuse
    this.transformer = proj4(this.fromSystem, this.toSystem);
  }

  private validatePoint(point: Point): boolean {
    return typeof point.x === 'number' && 
           typeof point.y === 'number' && 
           isFinite(point.x) && 
           isFinite(point.y) &&
           (point.z === undefined || (typeof point.z === 'number' && isFinite(point.z)));
  }

  private getPointKey(point: Point): string {
    return `${point.x},${point.y}${point.z !== undefined ? `,${point.z}` : ''}`;
  }

  private checkTransformationAttempts(point: Point): boolean {
    const key = this.getPointKey(point);
    const attempts = this.transformationAttempts.get(key) || 0;
    if (attempts >= this.MAX_ATTEMPTS) {
      console.warn(`Skipping point after ${attempts} failed transformation attempts:`, point);
      return false;
    }
    this.transformationAttempts.set(key, attempts + 1);
    return true;
  }

  // Transform a single point from the source CRS to the target CRS
  transform(point: Point): Point | null {
    if (this.fromSystem === this.toSystem) {
      return this.validatePoint(point) ? point : null;
    }

    try {
      if (!this.validatePoint(point)) {
        console.warn('Invalid point coordinates:', point);
        return null;
      }

      if (!this.checkTransformationAttempts(point)) {
        return null;
      }

      const [x, y] = this.transformer.forward([point.x, point.y]);
      
      if (!isFinite(x) || !isFinite(y)) {
        console.warn('Transformation resulted in invalid coordinates:', { x, y });
        return null;
      }

      // Clear transformation attempts for successful transformation
      this.transformationAttempts.delete(this.getPointKey(point));

      return { x, y, z: point.z };
    } catch (error) {
      console.error('Transformation error:', error);
      return null;
    }
  }

  // Transform bounding box coordinates from source CRS to target CRS
  transformBounds(bounds: { minX: number; minY: number; maxX: number; maxY: number }): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } | null {
    try {
      if (!isFinite(bounds.minX) || !isFinite(bounds.minY) ||
          !isFinite(bounds.maxX) || !isFinite(bounds.maxY)) {
        console.warn('Invalid bounds coordinates:', bounds);
        return null;
      }

      if (bounds.minX > bounds.maxX || bounds.minY > bounds.maxY) {
        console.warn('Invalid bounds: min values greater than max values:', bounds);
        return null;
      }

      const transformedMin = this.transform({ x: bounds.minX, y: bounds.minY });
      const transformedMax = this.transform({ x: bounds.maxX, y: bounds.maxY });

      if (!transformedMin || !transformedMax) {
        console.warn('Failed to transform bounds');
        return null;
      }

      // Handle coordinate system specific bounds adjustments
      if (this.toSystem === COORDINATE_SYSTEMS.WGS84) {
        return {
          minX: Math.max(transformedMin.x, -180),
          minY: Math.max(transformedMin.y, -90),
          maxX: Math.min(transformedMax.x, 180),
          maxY: Math.min(transformedMax.y, 90)
        };
      }

      return {
        minX: transformedMin.x,
        minY: transformedMin.y,
        maxX: transformedMax.x,
        maxY: transformedMax.y,
      };
    } catch (error) {
      console.error('Bounds transformation error:', error);
      return null;
    }
  }

  static convertLV03ToLV95(point: Point): Point | null {
    try {
      if (!this.prototype.validatePoint(point)) {
        return null;
      }
      return {
        x: point.x + 2000000,
        y: point.y + 1000000,
        z: point.z
      };
    } catch (error) {
      console.error('LV03 to LV95 conversion error:', error);
      return null;
    }
  }

  static convertLV95ToLV03(point: Point): Point | null {
    try {
      if (!this.prototype.validatePoint(point)) {
        return null;
      }
      return {
        x: point.x - 2000000,
        y: point.y - 1000000,
        z: point.z
      };
    } catch (error) {
      console.error('LV95 to LV03 conversion error:', error);
      return null;
    }
  }

  // Factory function to create a transformer more easily
  static createTransformer(fromSystem: string, toSystem: string): CoordinateTransformer {
    return new CoordinateTransformer(fromSystem, toSystem);
  }
}

/**
 * Detection Functions:
 * These functions help detect if a given set of points is likely in LV95 or LV03.
 */

function isValidPoint(point: any): point is Point {
  return point && 
         typeof point.x === 'number' && 
         typeof point.y === 'number' && 
         isFinite(point.x) && 
         isFinite(point.y);
}

function detectLV95Coordinates(points: Point[]): boolean {
  if (!Array.isArray(points) || points.length === 0) {
    return false;
  }

  const validPoints = points.filter(isValidPoint);
  if (validPoints.length === 0) {
    return false;
  }

  // For Aarau region in LV95:
  // X: ~2640000-2650000
  // Y: ~1245000-1255000
  const sampleSize = Math.min(validPoints.length, 10);
  const sample = validPoints.slice(0, sampleSize);

  // Count points that fall within the Swiss bounds
  let swissPointCount = 0;
  for (const point of sample) {
    const isXInRange = point.x >= 2485000 && point.x <= 2835000;
    const isYInRange = point.y >= 1075000 && point.y <= 1295000;
    if (isXInRange && isYInRange) {
      swissPointCount++;
    }
  }

  // If more than 80% of points are within Swiss bounds, consider it LV95
  return (swissPointCount / sample.length) >= 0.8;
}

function detectLV03Coordinates(points: Point[]): boolean {
  if (!Array.isArray(points) || points.length === 0) {
    return false;
  }

  const validPoints = points.filter(isValidPoint);
  if (validPoints.length === 0) {
    return false;
  }

  // For Aarau region in LV03:
  // X: ~640000-650000
  // Y: ~245000-255000
  const sampleSize = Math.min(validPoints.length, 10);
  const sample = validPoints.slice(0, sampleSize);

  // Count points that fall within the Swiss bounds
  let swissPointCount = 0;
  for (const point of sample) {
    const isXInRange = point.x >= 485000 && point.x <= 835000;
    const isYInRange = point.y >= 75000 && point.y <= 295000;
    if (isXInRange && isYInRange) {
      swissPointCount++;
    }
  }

  // If more than 80% of points are within Swiss bounds, consider it LV03
  return (swissPointCount / sample.length) >= 0.8;
}

/**
 * suggestCoordinateSystem:
 * Given a set of points, suggest the most likely CRS.
 */
function suggestCoordinateSystem(points: Point[]): CoordinateSystem {
  try {
    if (!Array.isArray(points) || points.length === 0) {
      console.warn('No points provided for coordinate system detection');
      return COORDINATE_SYSTEMS.WGS84; // Default to WGS84 if no points
    }

    const validPoints = points.filter(isValidPoint);
    if (validPoints.length === 0) {
      console.warn('No valid points found for coordinate system detection');
      return COORDINATE_SYSTEMS.WGS84; // Default to WGS84 if no valid points
    }

    // First check for Swiss coordinate systems
    if (detectLV95Coordinates(validPoints)) {
      console.debug('Detected LV95 coordinates');
      return COORDINATE_SYSTEMS.SWISS_LV95;
    }
    if (detectLV03Coordinates(validPoints)) {
      console.debug('Detected LV03 coordinates');
      return COORDINATE_SYSTEMS.SWISS_LV03;
    }

    // Check if coordinates are definitely in WGS84 range
    const isDefinitelyWGS84 = validPoints.every(point => {
      const isInWGS84Range = point.x >= -180 && point.x <= 180 && point.y >= -90 && point.y <= 90;
      const hasDecimals = point.x % 1 !== 0 || point.y % 1 !== 0;
      const isReasonableRange = Math.abs(point.x) < 180 && Math.abs(point.y) < 90;
      
      return isInWGS84Range && hasDecimals && isReasonableRange;
    });

    if (isDefinitelyWGS84) {
      console.debug('Coordinates confirmed to be in WGS84');
      return COORDINATE_SYSTEMS.WGS84;
    }

    // If coordinates are large numbers but not in Swiss ranges,
    // they're likely in a different local system, default to WGS84
    // and let the user select the correct system
    console.warn('Could not definitively determine coordinate system, defaulting to WGS84');
    return COORDINATE_SYSTEMS.WGS84;
  } catch (error) {
    console.error('Error detecting coordinate system:', error);
    return COORDINATE_SYSTEMS.WGS84;
  }
}

// Export the helper functions and types
export type { Point };
export {
  detectLV95Coordinates,
  detectLV03Coordinates,
  suggestCoordinateSystem
};
