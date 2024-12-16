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

  private validatePoint(point: Point): void {
    if (typeof point.x !== 'number' || !isFinite(point.x)) {
      throw new Error(`Invalid x coordinate: ${point.x}`);
    }
    if (typeof point.y !== 'number' || !isFinite(point.y)) {
      throw new Error(`Invalid y coordinate: ${point.y}`);
    }
    if (point.z !== undefined && (typeof point.z !== 'number' || !isFinite(point.z))) {
      throw new Error(`Invalid z coordinate: ${point.z}`);
    }
  }

  // Transform a single point from the source CRS to the target CRS
  transform(point: Point): Point {
    if (this.fromSystem === this.toSystem) {
      return point; // No transformation needed
    }

    try {
      this.validatePoint(point);

      const [x, y] = this.transformer.forward([point.x, point.y]);
      
      // Validate transformed coordinates
      if (!isFinite(x) || !isFinite(y)) {
        throw new Error('Transformation resulted in invalid coordinates');
      }

      return { x, y, z: point.z }; // Z-coordinate remains unchanged
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('Transformation error:', error);
      throw new Error(`Failed to transform point from ${this.fromSystem} to ${this.toSystem}: ${message}`);
    }
  }

  // Transform bounding box coordinates from source CRS to target CRS
  transformBounds(bounds: { minX: number; minY: number; maxX: number; maxY: number }): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } {
    try {
      // Validate bounds
      if (!isFinite(bounds.minX) || !isFinite(bounds.minY) ||
          !isFinite(bounds.maxX) || !isFinite(bounds.maxY)) {
        throw new Error('Invalid bounds coordinates');
      }

      if (bounds.minX > bounds.maxX || bounds.minY > bounds.maxY) {
        throw new Error('Invalid bounds: min values greater than max values');
      }

      const transformedMin = this.transform({ x: bounds.minX, y: bounds.minY });
      const transformedMax = this.transform({ x: bounds.maxX, y: bounds.maxY });

      // Handle coordinate system specific bounds adjustments
      if (this.toSystem === COORDINATE_SYSTEMS.WGS84) {
        // Ensure WGS84 bounds are within valid ranges
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
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('Bounds transformation error:', error);
      throw new Error(`Failed to transform bounds from ${this.fromSystem} to ${this.toSystem}: ${message}`);
    }
  }

  static convertLV03ToLV95(point: Point): Point {
    try {
      return {
        x: point.x + 2000000,
        y: point.y + 1000000,
        z: point.z
      };
    } catch (error) {
      console.error('LV03 to LV95 conversion error:', error);
      throw new Error('Failed to convert coordinates from LV03 to LV95');
    }
  }

  static convertLV95ToLV03(point: Point): Point {
    try {
      return {
        x: point.x - 2000000,
        y: point.y - 1000000,
        z: point.z
      };
    } catch (error) {
      console.error('LV95 to LV03 conversion error:', error);
      throw new Error('Failed to convert coordinates from LV95 to LV03');
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

function detectLV95Coordinates(points: Point[]): boolean {
  if (!Array.isArray(points) || points.length === 0) {
    return false;
  }

  const sampleSize = Math.min(points.length, 10);
  const sample = points.slice(0, sampleSize);

  return sample.every(point => {
    if (!point || typeof point.x !== 'number' || typeof point.y !== 'number') {
      return false;
    }
    const isXInRange = point.x >= 2485000 && point.x <= 2835000;
    const isYInRange = point.y >= 1075000 && point.y <= 1295000;
    return isXInRange && isYInRange;
  });
}

function detectLV03Coordinates(points: Point[]): boolean {
  if (!Array.isArray(points) || points.length === 0) {
    return false;
  }

  const sampleSize = Math.min(points.length, 10);
  const sample = points.slice(0, sampleSize);

  return sample.every(point => {
    if (!point || typeof point.x !== 'number' || typeof point.y !== 'number') {
      return false;
    }
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

    if (detectLV95Coordinates(points)) {
      return COORDINATE_SYSTEMS.SWISS_LV95;
    }
    if (detectLV03Coordinates(points)) {
      return COORDINATE_SYSTEMS.SWISS_LV03;
    }

    // Check if coordinates might be in WGS84 range
    const isWGS84Range = points.every(point => 
      point && 
      typeof point.x === 'number' && 
      typeof point.y === 'number' &&
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
