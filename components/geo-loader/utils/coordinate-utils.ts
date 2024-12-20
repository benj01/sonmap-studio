import proj4 from 'proj4';
import { COORDINATE_SYSTEMS, CoordinateSystem, isSwissSystem } from '../types/coordinates';
import { 
  GeoLoaderError,
  CoordinateTransformationError,
  InvalidCoordinateError,
  ErrorReporter,
  createErrorReporter
} from './errors';

export interface CoordinatePoint {
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
  private errorReporter: ErrorReporter;

  constructor(fromSystem: string, toSystem: string, errorReporter?: ErrorReporter) {
    this.fromSystem = fromSystem;
    this.toSystem = toSystem;

    this.errorReporter = errorReporter || createErrorReporter();

    // Validate that the coordinate systems are defined in proj4
    if (!proj4.defs(this.fromSystem)) {
      throw new GeoLoaderError(
        `Source coordinate system not registered: ${this.fromSystem}`,
        'COORDINATE_SYSTEM_NOT_REGISTERED',
        { system: this.fromSystem, type: 'source' }
      );
    }
    if (!proj4.defs(this.toSystem)) {
      throw new GeoLoaderError(
        `Target coordinate system not registered: ${this.toSystem}`,
        'COORDINATE_SYSTEM_NOT_REGISTERED',
        { system: this.toSystem, type: 'target' }
      );
    }

    try {
      // Create and store the transformer for reuse
      this.transformer = proj4(this.fromSystem, this.toSystem);
    } catch (error) {
      throw new GeoLoaderError(
        `Failed to initialize transformer from ${fromSystem} to ${toSystem}: ${error instanceof Error ? error.message : String(error)}`,
        'TRANSFORMER_INITIALIZATION_ERROR',
        { fromSystem, toSystem, error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  private validatePoint(point: CoordinatePoint): boolean {
    return typeof point.x === 'number' && 
           typeof point.y === 'number' && 
           isFinite(point.x) && 
           isFinite(point.y);
  }

  private getPointKey(point: CoordinatePoint): string {
    return `${point.x},${point.y}`;
  }

  private checkTransformationAttempts(point: CoordinatePoint): boolean {
    const key = this.getPointKey(point);
    const attempts = this.transformationAttempts.get(key) || 0;
    if (attempts >= this.MAX_ATTEMPTS) {
      const error = new CoordinateTransformationError(
        `Maximum transformation attempts (${this.MAX_ATTEMPTS}) exceeded`,
        point,
        this.fromSystem as CoordinateSystem,
        this.toSystem as CoordinateSystem
      );
      this.errorReporter.addError(error.message, 'MAX_TRANSFORMATION_ATTEMPTS', { point, attempts: this.MAX_ATTEMPTS });
      throw error;
    }
    this.transformationAttempts.set(key, attempts + 1);
    return true;
  }

  /**
   * Transform a single point from the source CRS to the target CRS
   * @throws {TransformationError} If transformation fails
   */
  transform(point: CoordinatePoint): CoordinatePoint {
    if (this.fromSystem === this.toSystem) {
      if (!this.validatePoint(point)) {
        const error = new InvalidCoordinateError(
          `Invalid point coordinates`,
          point,
          { reason: 'not_finite', system: this.fromSystem }
        );
        this.errorReporter.addError(error.message, 'INVALID_POINT_COORDINATES', { point });
        throw error;
      }
      return point;
    }

    try {
      if (!this.validatePoint(point)) {
        const error = new InvalidCoordinateError(
          `Invalid point coordinates`,
          point,
          { reason: 'not_finite', system: this.fromSystem }
        );
        this.errorReporter.addError(error.message, 'INVALID_POINT_COORDINATES', { point });
        throw error;
      }

      this.checkTransformationAttempts(point);

      // Verify transformers are still valid
      if (!proj4.defs(this.fromSystem) || !proj4.defs(this.toSystem)) {
        throw new GeoLoaderError(
          'Coordinate system definitions lost - reinitializing transformer',
          'COORDINATE_SYSTEM_DEFINITIONS_LOST',
          { fromSystem: this.fromSystem, toSystem: this.toSystem }
        );
      }

      // Transform the point
      const [transformedX, transformedY] = this.transformer.forward([point.x, point.y]);

      if (!isFinite(transformedX) || !isFinite(transformedY)) {
        const error = new CoordinateTransformationError(
          `Transformation resulted in invalid coordinates`,
          point,
          this.fromSystem as CoordinateSystem,
          this.toSystem as CoordinateSystem
        );
        this.errorReporter.addError(error.message, 'INVALID_TRANSFORMED_COORDINATES', { 
          point,
          transformed: { x: transformedX, y: transformedY }
        });
        throw error;
      }

      // If converting from Swiss to WGS84, swap coordinates after transformation
      // This is because Swiss coordinates are (E,N) and we want (lon,lat)
      let finalX = transformedX;
      let finalY = transformedY;
      if (isSwissSystem(this.fromSystem) && this.toSystem === COORDINATE_SYSTEMS.WGS84) {
        [finalX, finalY] = [finalY, finalX];
      }

      // Clear transformation attempts for successful transformation
      this.transformationAttempts.delete(this.getPointKey(point));

      return { x: finalX, y: finalY };
    } catch (error) {
      if (error instanceof GeoLoaderError) {
        throw error;
      }
      const transformError = new CoordinateTransformationError(
        `Transformation failed: ${error instanceof Error ? error.message : String(error)}`,
        point,
        this.fromSystem as CoordinateSystem,
        this.toSystem as CoordinateSystem
      );
      this.errorReporter.addError(transformError.message, 'TRANSFORMATION_FAILED', { point, error: String(error) });
      throw transformError;
    }
  }

  /**
   * Transform bounding box coordinates from source CRS to target CRS
   * @throws {TransformationError} If transformation fails
   */
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
    try {
      if (!isFinite(bounds.minX) || !isFinite(bounds.minY) ||
          !isFinite(bounds.maxX) || !isFinite(bounds.maxY)) {
        const error = new InvalidCoordinateError(
          `Invalid bounds coordinates`,
          { x: bounds.minX, y: bounds.minY },
          { reason: 'not_finite', bounds }
        );
        this.errorReporter.addError(error.message, 'INVALID_BOUNDS_COORDINATES', { bounds });
        throw error;
      }

      if (bounds.minX > bounds.maxX || bounds.minY > bounds.maxY) {
        const error = new InvalidCoordinateError(
          `Invalid bounds: min values greater than max values`,
          { x: bounds.minX, y: bounds.minY },
          { 
            reason: 'invalid_bounds',
            bounds,
            minX: bounds.minX,
            maxX: bounds.maxX,
            minY: bounds.minY,
            maxY: bounds.maxY
          }
        );
        this.errorReporter.addError(error.message, 'INVALID_BOUNDS_VALUES', { bounds });
        throw error;
      }

      // Transform all corners to handle rotated coordinate systems correctly
      const corners = [
        { x: bounds.minX, y: bounds.minY },
        { x: bounds.minX, y: bounds.maxY },
        { x: bounds.maxX, y: bounds.minY },
        { x: bounds.maxX, y: bounds.maxY }
      ].map(point => this.transform(point));

      const xs = corners.map(c => c.x);
      const ys = corners.map(c => c.y);

      return {
        minX: Math.min(...xs),
        minY: Math.min(...ys),
        maxX: Math.max(...xs),
        maxY: Math.max(...ys)
      };
    } catch (error) {
      if (error instanceof GeoLoaderError) {
        throw error;
      }
      const transformError = new CoordinateTransformationError(
        `Bounds transformation failed: ${error instanceof Error ? error.message : String(error)}`,
        { x: bounds.minX, y: bounds.minY },
        this.fromSystem as CoordinateSystem,
        this.toSystem as CoordinateSystem
      );
      this.errorReporter.addError(transformError.message, 'BOUNDS_TRANSFORMATION_FAILED', { bounds, error: String(error) });
      throw transformError;
    }
  }
}

/**
 * Detection Functions:
 * These functions help detect if a given set of points is likely in LV95 or LV03.
 */

function isValidPoint(point: any): point is CoordinatePoint {
  return point && 
         typeof point.x === 'number' && 
         typeof point.y === 'number' && 
         isFinite(point.x) && 
         isFinite(point.y);
}

function detectLV95Coordinates(points: CoordinatePoint[]): boolean {
  if (!Array.isArray(points) || points.length === 0) {
    return false;
  }

  const validPoints = points.filter(isValidPoint);
  if (validPoints.length === 0) {
    return false;
  }

  // Sample up to 10 points for detection
  const sampleSize = Math.min(validPoints.length, 10);
  const sample = validPoints.slice(0, sampleSize);

  // Count points that match LV95 pattern
  let lv95PointCount = 0;
  for (const point of sample) {
    // Check if coordinates match LV95 pattern:
    // - X should start with 2 (usually between 2.4M and 2.9M)
    // - Y should start with 1 (usually between 1.0M and 1.3M)
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

  // If more than 80% of points match LV95 pattern, consider it LV95
  return (lv95PointCount / sample.length) >= 0.8;
}

function detectLV03Coordinates(points: CoordinatePoint[]): boolean {
  if (!Array.isArray(points) || points.length === 0) {
    return false;
  }

  const validPoints = points.filter(isValidPoint);
  if (validPoints.length === 0) {
    return false;
  }

  // Sample up to 10 points for detection
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

  // If more than 80% of points match LV03 pattern, consider it LV03
  return (lv03PointCount / sample.length) >= 0.8;
}

/**
 * Suggest the most likely coordinate system for a set of points
 * @throws {CoordinateSystemError} If coordinate system detection fails
 */
export function suggestCoordinateSystem(points: CoordinatePoint[]): CoordinateSystem {
  try {
    if (!Array.isArray(points) || points.length === 0) {
      throw new GeoLoaderError(
        'No points provided for coordinate system detection',
        'NO_POINTS_FOR_DETECTION',
        { points }
      );
    }

    const validPoints = points.filter(isValidPoint);
    if (validPoints.length === 0) {
      throw new GeoLoaderError(
        'No valid points found for coordinate system detection',
        'NO_VALID_POINTS_FOR_DETECTION',
        { points, validCount: validPoints.length }
      );
    }

    // First check for Swiss coordinate systems
    if (detectLV95Coordinates(validPoints)) {
      return COORDINATE_SYSTEMS.SWISS_LV95;
    }
    if (detectLV03Coordinates(validPoints)) {
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
      return COORDINATE_SYSTEMS.WGS84;
    }

    // If coordinates are large numbers but not in Swiss ranges,
    // they're likely in a different local system
    return COORDINATE_SYSTEMS.NONE;
  } catch (error) {
    if (error instanceof GeoLoaderError) {
      throw error;
    }
    throw new GeoLoaderError(
      `Failed to detect coordinate system: ${error instanceof Error ? error.message : String(error)}`,
      'COORDINATE_SYSTEM_DETECTION_ERROR',
      { error: error instanceof Error ? error.message : String(error) }
    );
  }
}
