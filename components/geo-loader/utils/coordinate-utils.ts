// components/geo-loader/utils/coordinate-utils.ts

import proj4 from 'proj4';
import { COORDINATE_SYSTEMS, CoordinateSystem } from './coordinate-systems';

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

  const sampleSize = Math.min(validPoints.length, 10);
  const sample = validPoints.slice(0, sampleSize);

  return sample.every(point => {
    const isXInRange = point.x >= 2485000 && point.x <= 2835000;
    const isYInRange = point.y >= 1075000 && point.y <= 1295000;
    return isXInRange && isYInRange;
  });
}

function detectLV03Coordinates(points: Point[]): boolean {
  if (!Array.isArray(points) || points.length === 0) {
    return false;
  }

  const validPoints = points.filter(isValidPoint);
  if (validPoints.length === 0) {
    return false;
  }

  const sampleSize = Math.min(validPoints.length, 10);
  const sample = validPoints.slice(0, sampleSize);

  return sample.every(point => {
    const isXInRange = point.x >= 485000 && point.x <= 835000;
    const isYInRange = point.y >= 75000 && point.y <= 295000;
    return isXInRange && isYInRange;
  });
}

/**
 * suggestCoordinateSystem:
 * Given a set of points, suggest the most likely CRS.
 */
function suggestCoordinateSystem(points: Point[]): CoordinateSystem {
  try {
    if (!Array.isArray(points) || points.length === 0) {
      console.warn('No points provided for coordinate system detection');
      return COORDINATE_SYSTEMS.WGS84;
    }

    const validPoints = points.filter(isValidPoint);
    if (validPoints.length === 0) {
      console.warn('No valid points found for coordinate system detection');
      return COORDINATE_SYSTEMS.WGS84;
    }

    if (detectLV95Coordinates(validPoints)) {
      return COORDINATE_SYSTEMS.SWISS_LV95;
    }
    if (detectLV03Coordinates(validPoints)) {
      return COORDINATE_SYSTEMS.SWISS_LV03;
    }

    // Check if coordinates might be in WGS84 range
    const isWGS84Range = validPoints.every(point => 
      point.x >= -180 && point.x <= 180 &&
      point.y >= -90 && point.y <= 90
    );

    if (isWGS84Range) {
      console.debug('Coordinates appear to be in WGS84 range');
    } else {
      console.warn('Coordinates outside expected ranges, defaulting to WGS84');
    }

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
