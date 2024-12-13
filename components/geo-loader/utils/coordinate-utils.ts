import proj4 from 'proj4';
import { COORDINATE_SYSTEMS, CoordinateSystem, isSwissSystem } from '../types/coordinates';

// Basic Point interface for transformations
export interface Point {
  x: number;
  y: number;
  z?: number;
}

/**
 * Create a coordinate transformer
 */
export function createTransformer(fromSystem: string, toSystem: string): CoordinateTransformer {
  return new CoordinateTransformer(fromSystem, toSystem);
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

    // Verify proj4 is available globally
    if (!(window as any).proj4) {
      console.warn('proj4 is not initialized globally. Coordinate transformations may fail.');
    }

    // Validate that the coordinate systems are defined in proj4
    if (!proj4.defs(this.fromSystem)) {
      throw new Error(`Source coordinate system not registered: ${this.fromSystem}`);
    }
    if (!proj4.defs(this.toSystem)) {
      throw new Error(`Target coordinate system not registered: ${this.toSystem}`);
    }

    try {
      // Create and store the transformer for reuse
      this.transformer = proj4(this.fromSystem, this.toSystem);
      
      // Log the transformation setup
      console.debug('Created coordinate transformer:', {
        from: fromSystem,
        to: toSystem,
        proj4Def: {
          from: proj4.defs(fromSystem),
          to: proj4.defs(toSystem)
        }
      });
    } catch (error) {
      console.error('Failed to create coordinate transformer:', error);
      throw new Error(`Failed to initialize transformer from ${fromSystem} to ${toSystem}`);
    }
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

      // Verify transformers are still valid
      if (!proj4.defs(this.fromSystem) || !proj4.defs(this.toSystem)) {
        throw new Error('Coordinate system definitions lost - reinitializing transformer');
      }

      // For Swiss coordinates, we need to handle the coordinate order differently
      // Swiss coordinates are in (E,N) format, while WGS84 expects (lon,lat)
      let x = point.x;
      let y = point.y;

      // Transform the point
      const [transformedX, transformedY] = this.transformer.forward([x, y]);

      if (!isFinite(transformedX) || !isFinite(transformedY)) {
        console.warn('Transformation resulted in invalid coordinates:', { x: transformedX, y: transformedY, original: point });
        return null;
      }

      // If converting from Swiss to WGS84, swap coordinates after transformation
      // This is because Swiss coordinates are (E,N) and we want (lon,lat)
      let finalX = transformedX;
      let finalY = transformedY;
      if (isSwissSystem(this.fromSystem) && this.toSystem === COORDINATE_SYSTEMS.WGS84) {
        [finalX, finalY] = [finalY, finalX];
      }

      // Log successful transformation for debugging
      console.debug('Coordinate transformation:', {
        from: { x: point.x, y: point.y },
        to: { x: finalX, y: finalY },
        systems: {
          from: this.fromSystem,
          to: this.toSystem
        }
      });

      // Clear transformation attempts for successful transformation
      this.transformationAttempts.delete(this.getPointKey(point));

      return { x: finalX, y: finalY, z: point.z };
    } catch (error) {
      console.error('Transformation error:', error, {
        point,
        fromSystem: this.fromSystem,
        toSystem: this.toSystem
      });
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

      // Verify transformers are still valid
      if (!proj4.defs(this.fromSystem) || !proj4.defs(this.toSystem)) {
        throw new Error('Coordinate system definitions lost - reinitializing transformer');
      }

      // Transform all corners to handle rotated coordinate systems correctly
      const corners = [
        this.transform({ x: bounds.minX, y: bounds.minY }),
        this.transform({ x: bounds.minX, y: bounds.maxY }),
        this.transform({ x: bounds.maxX, y: bounds.minY }),
        this.transform({ x: bounds.maxX, y: bounds.maxY })
      ];

      if (corners.some(c => c === null)) {
        console.warn('Failed to transform one or more corners:', corners);
        return null;
      }

      const validCorners = corners.filter((c): c is Point => c !== null);
      const xs = validCorners.map(c => c.x);
      const ys = validCorners.map(c => c.y);

      const result = {
        minX: Math.min(...xs),
        minY: Math.min(...ys),
        maxX: Math.max(...xs),
        maxY: Math.max(...ys)
      };

      // Log transformed bounds for debugging
      console.debug('Bounds transformation:', {
        from: bounds,
        to: result,
        systems: {
          from: this.fromSystem,
          to: this.toSystem
        }
      });

      return result;
    } catch (error) {
      console.error('Bounds transformation error:', error);
      return null;
    }
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

  // Updated Swiss bounds for LV95
  // More lenient bounds covering all of Switzerland
  const sampleSize = Math.min(validPoints.length, 10);
  const sample = validPoints.slice(0, sampleSize);

  // Count points that match LV95 pattern
  let lv95PointCount = 0;
  for (const point of sample) {
    // Check if coordinates match LV95 pattern:
    // - X should start with 2 (usually between 2.4M and 2.9M)
    // - Y should start with 1 (usually between 1.0M and 1.3M)
    // - Values should be within reasonable Swiss bounds
    const xStr = Math.floor(point.x).toString();
    const yStr = Math.floor(point.y).toString();
    
    const isLV95Pattern = 
      xStr.startsWith('2') &&
      yStr.startsWith('1') &&
      point.x >= 2450000 && point.x <= 2850000 &&  // Expanded range
      point.y >= 1050000 && point.y <= 1300000;    // Expanded range

    if (isLV95Pattern) {
      lv95PointCount++;
    }
  }

  // Log detection results for debugging
  console.debug('LV95 detection:', {
    totalPoints: points.length,
    validPoints: validPoints.length,
    sampleSize,
    matchingPoints: lv95PointCount,
    samplePoints: sample.slice(0, 3)
  });

  // If more than 80% of points match LV95 pattern, consider it LV95
  return (lv95PointCount / sample.length) >= 0.8;
}

function detectLV03Coordinates(points: Point[]): boolean {
  if (!Array.isArray(points) || points.length === 0) {
    return false;
  }

  const validPoints = points.filter(isValidPoint);
  if (validPoints.length === 0) {
    return false;
  }

  // Updated Swiss bounds for LV03
  const sampleSize = Math.min(validPoints.length, 10);
  const sample = validPoints.slice(0, sampleSize);

  // Count points that match LV03 pattern
  let lv03PointCount = 0;
  for (const point of sample) {
    // Check if coordinates match LV03 pattern:
    // - X should be 6-digit number (usually between 450K and 850K)
    // - Y should be 6-digit number (usually between 50K and 300K)
    const xStr = Math.floor(point.x).toString();
    const yStr = Math.floor(point.y).toString();
    
    const isLV03Pattern = 
      xStr.length === 6 &&
      yStr.length === 6 &&
      point.x >= 450000 && point.x <= 850000 &&   // Expanded range
      point.y >= 50000 && point.y <= 300000;      // Expanded range

    if (isLV03Pattern) {
      lv03PointCount++;
    }
  }

  // Log detection results for debugging
  console.debug('LV03 detection:', {
    totalPoints: points.length,
    validPoints: validPoints.length,
    sampleSize,
    matchingPoints: lv03PointCount,
    samplePoints: sample.slice(0, 3)
  });

  // If more than 80% of points match LV03 pattern, consider it LV03
  return (lv03PointCount / sample.length) >= 0.8;
}

/**
 * suggestCoordinateSystem:
 * Given a set of points, suggest the most likely coordinate system.
 */
export function suggestCoordinateSystem(points: Point[]): CoordinateSystem {
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

    // Log sample points for debugging
    console.debug('Coordinate system detection sample:', validPoints.slice(0, 3));

    // If coordinates are large numbers but not in Swiss ranges,
    // they're likely in a different local system
    console.warn('Could not definitively determine coordinate system, defaulting to NONE');
    return COORDINATE_SYSTEMS.NONE;
  } catch (error) {
    console.error('Error detecting coordinate system:', error);
    return COORDINATE_SYSTEMS.NONE;
  }
}
