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
  }

  // Transform a single point from the source CRS to the target CRS
  transform(point: Point): Point {
    if (this.fromSystem === this.toSystem) {
      return point; // No transformation needed
    }

    try {
      const [x, y] = proj4(this.fromSystem, this.toSystem, [point.x, point.y]);
      return { x, y, z: point.z }; // Z-coordinate remains unchanged
    } catch (error) {
      console.error('Transformation error:', error);
      throw new Error(`Failed to transform point from ${this.fromSystem} to ${this.toSystem}`);
    }
  }

  // Transform bounding box coordinates from source CRS to target CRS
  transformBounds(bounds: { minX: number; minY: number; maxX: number; maxY: number }): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } {
    const transformedMin = this.transform({ x: bounds.minX, y: bounds.minY });
    const transformedMax = this.transform({ x: bounds.maxX, y: bounds.maxY });

    return {
      minX: transformedMin.x,
      minY: transformedMin.y,
      maxX: transformedMax.x,
      maxY: transformedMax.y,
    };
  }

  static convertLV03ToLV95(point: Point): Point {
    return {
      x: point.x + 2000000,
      y: point.y + 1000000,
      z: point.z
    };
  }

  static convertLV95ToLV03(point: Point): Point {
    return {
      x: point.x - 2000000,
      y: point.y - 1000000,
      z: point.z
    };
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
  const sampleSize = Math.min(points.length, 10);
  const sample = points.slice(0, sampleSize);

  return sample.every(point => {
    const isXInRange = point.x >= 2485000 && point.x <= 2835000;
    const isYInRange = point.y >= 1075000 && point.y <= 1295000;
    return isXInRange && isYInRange;
  });
}

function detectLV03Coordinates(points: Point[]): boolean {
  const sampleSize = Math.min(points.length, 10);
  const sample = points.slice(0, sampleSize);

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
  if (detectLV95Coordinates(points)) {
    return COORDINATE_SYSTEMS.SWISS_LV95;
  }
  if (detectLV03Coordinates(points)) {
    return COORDINATE_SYSTEMS.SWISS_LV03;
  }
  return COORDINATE_SYSTEMS.WGS84; // Default to WGS84 if no match
}

// Export the helper functions
export {
  Point,
  detectLV95Coordinates,
  detectLV03Coordinates,
  suggestCoordinateSystem
};
