import proj4 from 'proj4';
import {
  COORDINATE_SYSTEMS,
  CoordinateSystem,
  BaseCoordinate,
  Coordinate,
  isSwissSystem,
  validateCoordinates
} from '../types/coordinates';
import { CoordinateTransformationError, ErrorReporter } from './errors';

/**
 * Class for transforming coordinates between different coordinate systems
 */
export class CoordinateTransformer {
  private transformer: proj4.Converter;

  constructor(
    private readonly fromSystem: CoordinateSystem,
    private readonly toSystem: CoordinateSystem,
    private readonly errorReporter: ErrorReporter,
    private readonly proj4Instance: typeof proj4
  ) {
    if (fromSystem === COORDINATE_SYSTEMS.NONE || toSystem === COORDINATE_SYSTEMS.NONE) {
      throw new Error('Cannot transform coordinates with NONE coordinate system');
    }

    if (!this.proj4Instance.defs(fromSystem) || !this.proj4Instance.defs(toSystem)) {
      this.reportError('INITIALIZATION_ERROR', 'Coordinate system definitions not found', {
        fromSystem,
        toSystem
      });
      throw new Error(`Coordinate system definitions not found for ${fromSystem} or ${toSystem}`);
    }

    this.transformer = this.proj4Instance(fromSystem, toSystem);
  }

  /**
   * Transform a single coordinate
   */
  transform(coord: BaseCoordinate, featureId?: string, layer?: string): BaseCoordinate | null {
    // If source and target systems are the same, return a copy of the original coordinate
    if (this.fromSystem === this.toSystem) {
      return { ...coord };
    }

    // Validate input coordinate
    if (!validateCoordinates(coord, this.fromSystem)) {
      this.reportError('VALIDATION_ERROR', `Invalid coordinate for system ${this.fromSystem}`, {
        coord,
        featureId,
        layer
      });
      return null;
    }

    try {
      // Handle coordinate order for Swiss systems
      // Swiss coordinates are in (E,N) format while WGS84 is in (lon,lat) format
      let x = coord.x;
      let y = coord.y;

      if (isSwissSystem(this.fromSystem) && this.toSystem === COORDINATE_SYSTEMS.WGS84) {
        [x, y] = [y, x];
      }

      // Transform the coordinates
      const result = this.transformer.forward([x, y]);

      // Create transformed coordinate object with all properties at once
      const transformedCoord: BaseCoordinate = coord.z !== undefined
        ? { x: result[0], y: result[1], z: coord.z }
        : { x: result[0], y: result[1] };

      // Validate transformed coordinate
      if (!validateCoordinates(transformedCoord, this.toSystem)) {
        throw new CoordinateTransformationError(
          `Invalid transformed coordinate for system ${this.toSystem}`,
          coord,
          this.fromSystem,
          this.toSystem,
          featureId,
          layer
        );
      }

      return transformedCoord;
    } catch (error) {
      if (error instanceof CoordinateTransformationError) {
        this.reportError('TRANSFORM_ERROR', error.message, {
          originalCoordinates: error.originalCoordinates,
          fromSystem: error.fromSystem,
          toSystem: error.toSystem,
          featureId: error.featureId,
          layer: error.layer
        });
      } else {
        this.reportError('TRANSFORM_ERROR', 'Failed to transform coordinate', {
          error: error instanceof Error ? error.message : 'Unknown error',
          coord,
          featureId,
          layer,
          fromSystem: this.fromSystem,
          toSystem: this.toSystem
        });
      }
      return null;
    }
  }

  /**
   * Transform bounds
   */
  transformBounds(bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  }): { minX: number; minY: number; maxX: number; maxY: number } | null {
    try {
      // Transform all four corners
      const corners = [
        this.transform({ x: bounds.minX, y: bounds.minY }),
        this.transform({ x: bounds.minX, y: bounds.maxY }),
        this.transform({ x: bounds.maxX, y: bounds.minY }),
        this.transform({ x: bounds.maxX, y: bounds.maxY })
      ];

      // Check if any transformation failed
      if (corners.some(corner => corner === null)) {
        return null;
      }

      // Calculate new bounds
      const validCorners = corners as BaseCoordinate[];
      return {
        minX: Math.min(...validCorners.map(c => c.x)),
        minY: Math.min(...validCorners.map(c => c.y)),
        maxX: Math.max(...validCorners.map(c => c.x)),
        maxY: Math.max(...validCorners.map(c => c.y))
      };
    } catch (error) {
      this.reportError('TRANSFORM_ERROR', 'Failed to transform bounds', {
        error: error instanceof Error ? error.message : 'Unknown error',
        bounds,
        fromSystem: this.fromSystem,
        toSystem: this.toSystem
      });
      return null;
    }
  }

  private reportError(type: string, message: string, context?: Record<string, any>): void {
    this.errorReporter.reportError(type, message, context);
  }

  private reportWarning(type: string, message: string, context?: Record<string, any>): void {
    this.errorReporter.reportWarning(type, message, context);
  }

  private reportInfo(type: string, message: string, context?: Record<string, any>): void {
    this.errorReporter.reportInfo(type, message, context);
  }
}

/**
 * Create a new CoordinateTransformer instance
 */
export function createTransformer(
  fromSystem: CoordinateSystem,
  toSystem: CoordinateSystem,
  errorReporter: ErrorReporter,
  proj4Instance: typeof proj4
): CoordinateTransformer {
  return new CoordinateTransformer(fromSystem, toSystem, errorReporter, proj4Instance);
}

/**
 * Detect if coordinates are likely in LV95 system
 */
export function detectLV95Coordinates(points: BaseCoordinate[], errorReporter: ErrorReporter): boolean {
  if (points.length === 0) {
    errorReporter.reportWarning('DETECTION_ERROR', 'No points provided for LV95 detection');
    return false;
  }

  let validPoints = 0;
  let lv95Points = 0;

  for (const point of points) {
    if (!isFinite(point.x) || !isFinite(point.y)) {
      continue;
    }

    validPoints++;

    // Check if coordinates match LV95 pattern:
    // - x should start with 2 (2000000-3000000)
    // - y should start with 1 (1000000-2000000)
    const x = Math.abs(point.x);
    const y = Math.abs(point.y);
    
    if (
      x >= 2000000 && x <= 3000000 &&
      y >= 1000000 && y <= 2000000
    ) {
      lv95Points++;
    }
  }

  if (validPoints === 0) {
    errorReporter.reportWarning('DETECTION_ERROR', 'No valid points found for LV95 detection');
    return false;
  }

  // Return true if at least 80% of valid points match LV95 pattern
  const ratio = lv95Points / validPoints;
  const result = ratio >= 0.8;

  errorReporter.reportInfo('DETECTION_RESULT', 'LV95 coordinate detection result', {
    result,
    validPoints,
    lv95Points,
    ratio
  });

  return result;
}

/**
 * Detect if coordinates are likely in LV03 system
 */
export function detectLV03Coordinates(points: BaseCoordinate[], errorReporter: ErrorReporter): boolean {
  if (points.length === 0) {
    errorReporter.reportWarning('DETECTION_ERROR', 'No points provided for LV03 detection');
    return false;
  }

  let validPoints = 0;
  let lv03Points = 0;

  for (const point of points) {
    if (!isFinite(point.x) || !isFinite(point.y)) {
      continue;
    }

    validPoints++;

    // Check if coordinates match LV03 pattern:
    // - x should be between 480000-850000
    // - y should be between 70000-310000
    const x = Math.abs(point.x);
    const y = Math.abs(point.y);
    
    if (
      x >= 480000 && x <= 850000 &&
      y >= 70000 && y <= 310000
    ) {
      lv03Points++;
    }
  }

  if (validPoints === 0) {
    errorReporter.reportWarning('DETECTION_ERROR', 'No valid points found for LV03 detection');
    return false;
  }

  // Return true if at least 80% of valid points match LV03 pattern
  const ratio = lv03Points / validPoints;
  const result = ratio >= 0.8;

  errorReporter.reportInfo('DETECTION_RESULT', 'LV03 coordinate detection result', {
    result,
    validPoints,
    lv03Points,
    ratio
  });

  return result;
}

/**
 * Suggest the most likely coordinate system for a set of points
 */
export function suggestCoordinateSystem(points: BaseCoordinate[], errorReporter: ErrorReporter): CoordinateSystem {
  if (points.length === 0) {
    errorReporter.reportWarning('DETECTION_ERROR', 'No points provided for coordinate system detection');
    return COORDINATE_SYSTEMS.NONE;
  }

  // First check for Swiss coordinate systems
  if (detectLV95Coordinates(points, errorReporter)) {
    return COORDINATE_SYSTEMS.SWISS_LV95;
  }

  if (detectLV03Coordinates(points, errorReporter)) {
    return COORDINATE_SYSTEMS.SWISS_LV03;
  }

  // Check if coordinates are definitely within WGS84 range
  let validPoints = 0;
  let wgs84Points = 0;

  for (const point of points) {
    if (!isFinite(point.x) || !isFinite(point.y)) {
      continue;
    }

    validPoints++;

    if (
      point.x >= -180 && point.x <= 180 &&
      point.y >= -90 && point.y <= 90
    ) {
      // Additional check: WGS84 coordinates typically have decimal values
      if (
        point.x % 1 !== 0 ||
        point.y % 1 !== 0
      ) {
        wgs84Points++;
      }
    }
  }

  if (validPoints === 0) {
    errorReporter.reportWarning('DETECTION_ERROR', 'No valid points found for coordinate system detection');
    return COORDINATE_SYSTEMS.NONE;
  }

  // Return WGS84 if at least 80% of valid points match WGS84 pattern
  const ratio = wgs84Points / validPoints;
  if (ratio >= 0.8) {
    errorReporter.reportInfo('DETECTION_RESULT', 'WGS84 coordinate system detected', {
      validPoints,
      wgs84Points,
      ratio
    });
    return COORDINATE_SYSTEMS.WGS84;
  }

  errorReporter.reportWarning('DETECTION_ERROR', 'Could not determine coordinate system', {
    validPoints,
    wgs84Points,
    ratio
  });
  return COORDINATE_SYSTEMS.NONE;
}
