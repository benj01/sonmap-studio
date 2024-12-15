// components/geo-loader/utils/coordinate-systems.ts

import proj4 from 'proj4';

// Define Swiss coordinate systems
// LV95 (EPSG:2056) - newer system with 7-digit coordinates
proj4.defs(
  'EPSG:2056',
  '+proj=somerc +lat_0=46.95240555555556 +lon_0=7.439583333333333 +k_0=1 +x_0=2600000 +y_0=1200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs +type=crs'
);

// LV03 (EPSG:21781) - older system with 6-digit coordinates
proj4.defs(
  'EPSG:21781',
  '+proj=somerc +lat_0=46.95240555555556 +lon_0=7.439583333333333 +k_0=1 +x_0=600000 +y_0=200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs +type=crs'
);

// Define common coordinate systems
export const COORDINATE_SYSTEMS = {
  WGS84: 'EPSG:4326',
  SWISS_LV95: 'EPSG:2056',
  SWISS_LV03: 'EPSG:21781',
} as const;

export type CoordinateSystem = typeof COORDINATE_SYSTEMS[keyof typeof COORDINATE_SYSTEMS];

interface Point {
  x: number;
  y: number;
  z?: number; // Optional Z coordinate
}

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

  // Transform a single point
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

  // Transform bounding box coordinates
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

  // Convert between LV03 and LV95
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

  // Detect whether points are likely in Swiss LV95 coordinates (7-digit)
  static detectLV95Coordinates(points: Point[]): boolean {
    const sampleSize = Math.min(points.length, 10);
    const sample = points.slice(0, sampleSize);

    return sample.every(point => {
      const isXInRange = point.x >= 2485000 && point.x <= 2835000;
      const isYInRange = point.y >= 1075000 && point.y <= 1295000;
      return isXInRange && isYInRange;
    });
  }

  // Detect whether points are likely in Swiss LV03 coordinates (6-digit)
  static detectLV03Coordinates(points: Point[]): boolean {
    const sampleSize = Math.min(points.length, 10);
    const sample = points.slice(0, sampleSize);

    return sample.every(point => {
      const isXInRange = point.x >= 485000 && point.x <= 835000;
      const isYInRange = point.y >= 75000 && point.y <= 295000;
      return isXInRange && isYInRange;
    });
  }

  // Suggest coordinate system based on input points
  static suggestCoordinateSystem(points: Point[]): CoordinateSystem {
    if (this.detectLV95Coordinates(points)) {
      return COORDINATE_SYSTEMS.SWISS_LV95;
    }
    if (this.detectLV03Coordinates(points)) {
      return COORDINATE_SYSTEMS.SWISS_LV03;
    }
    return COORDINATE_SYSTEMS.WGS84; // Default to WGS84 if no match
  }
}

// Factory function to create a transformer
export const createTransformer = (fromSystem: string, toSystem: string) => {
  return new CoordinateTransformer(fromSystem, toSystem);
};
