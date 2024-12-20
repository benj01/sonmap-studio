import proj4 from 'proj4';
import { CoordinateTransformer } from './coordinate-utils';
import { COORDINATE_SYSTEMS, CoordinateSystem, isSwissSystem } from '../types/coordinates';
import { 
  GeoLoaderError, 
  CoordinateTransformationError, 
  ErrorReporter,
  createErrorReporter 
} from './errors';

// Create a global error reporter instance for this module
const errorReporter = createErrorReporter();

// Test points for different coordinate systems
const TEST_POINTS = {
  [COORDINATE_SYSTEMS.SWISS_LV95]: {
    point: [2645021, 1249991],
    expectedWGS84: [8.0, 47.4],
    tolerance: 0.5
  },
  // Add more test points for other systems as needed
};

/**
 * Initialize coordinate systems with their proj4 definitions
 * @throws {CoordinateSystemError} If initialization fails
 * @returns true if initialization is successful
 */
export function initializeCoordinateSystems(): boolean {
  try {
    // Swiss LV95 / EPSG:2056
    proj4.defs(
      COORDINATE_SYSTEMS.SWISS_LV95,
      '+proj=somerc +lat_0=46.9524055555556 +lon_0=7.43958333333333 +k_0=1 +x_0=2600000 ' +
      '+y_0=1200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs ' +
      '+type=crs'
    );

    // Swiss LV03 / EPSG:21781
    proj4.defs(
      COORDINATE_SYSTEMS.SWISS_LV03,
      '+proj=somerc +lat_0=46.9524055555556 +lon_0=7.43958333333333 +k_0=1 +x_0=600000 ' +
      '+y_0=200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs ' +
      '+type=crs'
    );

    // WGS84 / EPSG:4326
    proj4.defs(
      COORDINATE_SYSTEMS.WGS84,
      '+proj=longlat +datum=WGS84 +no_defs +type=crs'
    );

    // Special handling for local coordinates (no transformation)
    proj4.defs(
      COORDINATE_SYSTEMS.NONE,
      '+proj=longlat +datum=WGS84 +no_defs +type=crs'
    );

    // Verify all coordinate systems are registered
    const systems = [
      COORDINATE_SYSTEMS.SWISS_LV95,
      COORDINATE_SYSTEMS.SWISS_LV03,
      COORDINATE_SYSTEMS.WGS84,
      COORDINATE_SYSTEMS.NONE
    ];
    
    const unregisteredSystems = systems.filter(system => !proj4.defs(system));
    if (unregisteredSystems.length > 0) {
      throw new GeoLoaderError(
        `Failed to verify coordinate systems: ${unregisteredSystems.join(', ')}`
      );
    }

    // Verify transformations for each test point
    for (const [system, testData] of Object.entries(TEST_POINTS)) {
      const result = proj4(system as CoordinateSystem, COORDINATE_SYSTEMS.WGS84, testData.point);
      const [lon, lat] = result;
      const [expectedLon, expectedLat] = testData.expectedWGS84;
      
      const isValid = 
        Math.abs(lon - expectedLon) < testData.tolerance &&
        Math.abs(lat - expectedLat) < testData.tolerance;
      
      if (!isValid) {
        const error = new CoordinateTransformationError(
          `Invalid test transformation result`,
          { x: testData.point[0], y: testData.point[1] },
          system as CoordinateSystem,
          COORDINATE_SYSTEMS.WGS84
        );
        errorReporter.addError(error.message, {
          system,
          got: [lon, lat],
          expected: [expectedLon, expectedLat],
          tolerance: testData.tolerance
        });
        throw error;
      }
    }

    return true;
  } catch (error) {
    if (error instanceof GeoLoaderError) {
      throw error;
    }
    throw new GeoLoaderError(
      `Failed to initialize coordinate systems: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Interface for coordinate point
 */
export interface CoordinatePoint {
  x: number;
  y: number;
}

/**
 * Creates a new CoordinateTransformer instance for transforming coordinates
 * between the specified coordinate systems.
 * 
 * @param fromSystem The source coordinate system
 * @param toSystem The target coordinate system
 * @throws {CoordinateSystemError} If coordinate systems initialization fails
 * @returns A CoordinateTransformer instance
 */
export function createTransformer(fromSystem: string, toSystem: string): CoordinateTransformer {
  // Initialize systems if not already done
  if (!proj4.defs(COORDINATE_SYSTEMS.SWISS_LV95)) {
    if (!initializeCoordinateSystems()) {
      throw new GeoLoaderError('Failed to initialize coordinate systems');
    }
  }

  // Handle special case for 'none' coordinate system
  let from = fromSystem as CoordinateSystem;
  let to = toSystem as CoordinateSystem;

  if (from === COORDINATE_SYSTEMS.NONE) {
    from = COORDINATE_SYSTEMS.WGS84;
  }
  if (to === COORDINATE_SYSTEMS.NONE) {
    to = COORDINATE_SYSTEMS.WGS84;
  }

  return new CoordinateTransformer(from, to);
}

/**
 * Convert coordinates to Mapbox format (longitude, latitude)
 * @param point The point to convert
 * @param sourceSystem The source coordinate system of the point
 * @throws {TransformationError} If coordinate transformation fails
 * @returns [longitude, latitude] array for Mapbox
 */
export function toMapboxCoordinates(
  point: CoordinatePoint,
  sourceSystem: CoordinateSystem
): [number, number] {
  try {
    // For WGS84, x is longitude and y is latitude, which is what Mapbox expects
    if (sourceSystem === COORDINATE_SYSTEMS.WGS84 || sourceSystem === COORDINATE_SYSTEMS.NONE) {
      return [point.x, point.y];
    }

    // Transform coordinates to WGS84
    const transformer = createTransformer(sourceSystem, COORDINATE_SYSTEMS.WGS84);
    const transformed = transformer.transform(point);
    
    if (!transformed) {
      throw new CoordinateTransformationError(
        `Failed to transform coordinates to WGS84`,
        point,
        sourceSystem as CoordinateSystem,
        COORDINATE_SYSTEMS.WGS84
      );
    }

    return [transformed.x, transformed.y];
  } catch (error) {
    if (error instanceof GeoLoaderError) {
      throw error;
    }
    throw new CoordinateTransformationError(
      `Failed to convert coordinates to Mapbox format: ${error instanceof Error ? error.message : String(error)}`,
      point,
      sourceSystem,
      COORDINATE_SYSTEMS.WGS84
    );
  }
}

export { COORDINATE_SYSTEMS };
