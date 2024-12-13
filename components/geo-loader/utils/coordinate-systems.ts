// components/geo-loader/utils/coordinate-systems.ts

import proj4 from 'proj4';

// Define Swiss coordinate system (EPSG:2056)
proj4.defs('EPSG:2056', '+proj=somerc +lat_0=46.95240555555556 +lon_0=7.439583333333333 +k_0=1 +x_0=2600000 +y_0=1200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs +type=crs');

// Common coordinate systems
export const COORDINATE_SYSTEMS = {
  WGS84: 'EPSG:4326',
  SWISS_LV95: 'EPSG:2056'
} as const;

export type CoordinateSystem = typeof COORDINATE_SYSTEMS[keyof typeof COORDINATE_SYSTEMS];

interface Point {
  x: number;
  y: number;
  z?: number;
}

export class CoordinateTransformer {
  private fromSystem: string;
  private toSystem: string;

  constructor(fromSystem: string, toSystem: string) {
    this.fromSystem = fromSystem;
    this.toSystem = toSystem;
  }

  transform(point: Point): Point {
    // If same coordinate system, return original point
    if (this.fromSystem === this.toSystem) {
      return point;
    }

    try {
      const [x, y] = proj4(this.fromSystem, this.toSystem, [point.x, point.y]);
      return {
        x,
        y,
        z: point.z // Z coordinate usually stays the same
      };
    } catch (error) {
      console.error('Transformation error:', error);
      throw new Error(`Failed to transform coordinates from ${this.fromSystem} to ${this.toSystem}`);
    }
  }

  transformBounds(bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  }): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } {
    const min = this.transform({ x: bounds.minX, y: bounds.minY });
    const max = this.transform({ x: bounds.maxX, y: bounds.maxY });
    return {
      minX: min.x,
      minY: min.y,
      maxX: max.x,
      maxY: max.y
    };
  }

  // Helper to detect if coordinates might be in Swiss format
  static detectSwissCoordinates(points: Point[]): boolean {
    // Check a sample of points to see if they fall within typical Swiss coordinate ranges
    const sampleSize = Math.min(points.length, 10);
    const sample = points.slice(0, sampleSize);
    
    return sample.every(point => {
      // Swiss coordinates typically fall within these ranges
      const isXInRange = point.x >= 2485000 && point.x <= 2835000;
      const isYInRange = point.y >= 1075000 && point.y <= 1295000;
      return isXInRange && isYInRange;
    });
  }

  // Helper to suggest coordinate system based on coordinates
  static suggestCoordinateSystem(points: Point[]): CoordinateSystem {
    if (this.detectSwissCoordinates(points)) {
      return COORDINATE_SYSTEMS.SWISS_LV95;
    }
    // Default to WGS84 if no specific system is detected
    return COORDINATE_SYSTEMS.WGS84;
  }
}

// Export common transformers
export const createTransformer = (fromSystem: string, toSystem: string) => {
  return new CoordinateTransformer(fromSystem, toSystem);
};