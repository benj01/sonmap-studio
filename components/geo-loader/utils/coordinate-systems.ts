import proj4 from 'proj4';
import { CoordinateTransformer } from './coordinate-utils';
import { COORDINATE_SYSTEMS, CoordinateSystem, isSwissSystem } from '../types/coordinates';
import { 
  CoordinateSystemError, 
  CoordinateTransformationError, 
  InvalidCoordinateError,
  ErrorReporter,
  createErrorReporter 
} from './errors';

// Create a global error reporter instance and track initialization state
const errorReporter = createErrorReporter();
let isInitialized = false;

// Register default proj4 definitions
proj4.defs([
  ['EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs +type=crs'],
  ['EPSG:2056', '+proj=somerc +lat_0=46.9524055555556 +lon_0=7.43958333333333 +k_0=1 +x_0=2600000 +y_0=1200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs +type=crs'],
  ['EPSG:21781', '+proj=somerc +lat_0=46.9524055555556 +lon_0=7.43958333333333 +k_0=1 +x_0=600000 +y_0=200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs +type=crs']
]);

/**
 * Check if coordinate systems are initialized
 * @returns true if systems are initialized
 */
export function areCoordinateSystemsInitialized(): boolean {
  return isInitialized;
}

interface TestPoint {
  point: [number, number];
  expectedWGS84: [number, number];
  tolerance: number;
}

// Test points for different coordinate systems
const TEST_POINTS: Record<CoordinateSystem, TestPoint> = {
  [COORDINATE_SYSTEMS.SWISS_LV95]: {
    point: [2645021, 1249991],
    expectedWGS84: [8.0, 47.4],
    tolerance: 0.5
  },
  [COORDINATE_SYSTEMS.SWISS_LV03]: {
    point: [645021, 249991],
    expectedWGS84: [8.0, 47.4],
    tolerance: 0.5
  },
  [COORDINATE_SYSTEMS.WGS84]: {
    point: [8.0, 47.4],
    expectedWGS84: [8.0, 47.4],
    tolerance: 0.0001
  },
  [COORDINATE_SYSTEMS.NONE]: {
    point: [8.0, 47.4],
    expectedWGS84: [8.0, 47.4],
    tolerance: 0.0001
  }
};

/**
 * Initialize coordinate systems with their proj4 definitions
 * @throws {CoordinateSystemError} If initialization fails
 * @returns true if initialization is successful
 */
export function initializeCoordinateSystems(): boolean {
  // Skip if already initialized
  if (isInitialized) {
    console.log('Coordinate systems already initialized');
    return true;
  }
  
  try {
    console.log('Starting coordinate systems initialization');
    errorReporter.addInfo(
      'Starting coordinate systems initialization',
      'COORDINATE_SYSTEM_INIT_START'
    );

    // Map our coordinate system constants to EPSG codes
    const systemToEpsg = {
      [COORDINATE_SYSTEMS.WGS84]: 'EPSG:4326',
      [COORDINATE_SYSTEMS.SWISS_LV95]: 'EPSG:2056',
      [COORDINATE_SYSTEMS.SWISS_LV03]: 'EPSG:21781',
      [COORDINATE_SYSTEMS.NONE]: 'EPSG:4326'
    };

    // Copy definitions from EPSG codes to our system constants
    Object.entries(systemToEpsg).forEach(([system, epsg]) => {
      const def = proj4.defs(epsg);
      if (!def) {
        throw new CoordinateSystemError(`EPSG definition not found: ${epsg}`);
      }
      proj4.defs(system, def);
      console.log(`Registered coordinate system: ${system} from ${epsg}`);
    });

    // Log registration of each system
    errorReporter.addInfo(
      'Registering coordinate system definitions',
      'COORDINATE_SYSTEM_REGISTRATION',
      { systems: Object.values(COORDINATE_SYSTEMS) }
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
      throw new CoordinateSystemError(
        `Failed to verify coordinate systems: ${unregisteredSystems.join(', ')}`,
        { unregisteredSystems }
      );
    }

    // Verify transformations for each test point
    for (const [system, testData] of Object.entries(TEST_POINTS)) {
      console.log(`Testing transformation for ${system}`);
      const result = proj4(system as CoordinateSystem, COORDINATE_SYSTEMS.WGS84, testData.point);
      const [lon, lat] = result;
      const [expectedLon, expectedLat] = testData.expectedWGS84;
      
      const isValid = 
        Math.abs(lon - expectedLon) < testData.tolerance &&
        Math.abs(lat - expectedLat) < testData.tolerance;
      
      if (!isValid) {
        const details = {
          system,
          result: { longitude: lon, latitude: lat },
          expected: { longitude: expectedLon, latitude: expectedLat },
          tolerance: testData.tolerance,
          difference: {
            longitude: Math.abs(lon - expectedLon),
            latitude: Math.abs(lat - expectedLat)
          }
        };
        console.error('Transformation test failed:', details);
        throw new CoordinateTransformationError(
          `Invalid test transformation result for ${system}: difference exceeds tolerance of ${testData.tolerance} degrees`,
          { x: testData.point[0], y: testData.point[1] },
          system as CoordinateSystem,
          COORDINATE_SYSTEMS.WGS84,
          details
        );
      }
      console.log(`Transformation test passed for ${system}`);
    }

    errorReporter.addInfo(
      'Successfully initialized all coordinate systems',
      'COORDINATE_SYSTEM_INIT_SUCCESS',
      { verifiedSystems: systems }
    );

    isInitialized = true;
    console.log('Coordinate systems initialization complete');
    return true;
  } catch (error) {
    console.error('Failed to initialize coordinate systems:', error);
    errorReporter.addError(
      'Failed to initialize coordinate systems',
      'COORDINATE_SYSTEM_INIT_FAILURE',
      { error: error instanceof Error ? error.message : String(error) }
    );
    if (error instanceof CoordinateSystemError || error instanceof CoordinateTransformationError) {
      throw error;
    }
    throw new CoordinateSystemError(
      `Failed to initialize coordinate systems: ${error instanceof Error ? error.message : String(error)}`,
      { originalError: error instanceof Error ? error.message : String(error) }
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
  // Initialize systems if needed
  if (!isInitialized && !initializeCoordinateSystems()) {
    throw new CoordinateSystemError('Failed to initialize coordinate systems');
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

  errorReporter.addInfo(
    'Created coordinate transformer',
    'TRANSFORMER_CREATED',
    { fromSystem: from, toSystem: to }
  );

  return new CoordinateTransformer(from, to);
}

/**
 * Validates a coordinate point
 * @throws {InvalidCoordinateError} If the point is invalid
 */
function validatePoint(point: CoordinatePoint, system: CoordinateSystem): void {
  if (!point || typeof point.x !== 'number' || typeof point.y !== 'number' || 
      !isFinite(point.x) || !isFinite(point.y)) {
    throw new InvalidCoordinateError(
      'Invalid coordinate point',
      point,
      { reason: 'not_finite', system }
    );
  }

  // Additional validation for WGS84 coordinates
  if (system === COORDINATE_SYSTEMS.WGS84 || system === COORDINATE_SYSTEMS.NONE) {
    if (Math.abs(point.x) > 180 || Math.abs(point.y) > 90) {
      throw new InvalidCoordinateError(
        'Coordinates out of WGS84 bounds',
        point,
        { 
          reason: 'out_of_bounds',
          system,
          bounds: { minX: -180, maxX: 180, minY: -90, maxY: 90 }
        }
      );
    }
  }
}

export function toMapboxCoordinates(
  point: CoordinatePoint,
  sourceSystem: CoordinateSystem
): [number, number] {
  try {
    // Validate input point
    validatePoint(point, sourceSystem);

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
    if (error instanceof CoordinateSystemError || error instanceof CoordinateTransformationError) {
      throw error;
    }
    const details = {
      originalError: error instanceof Error ? error.message : String(error),
      point,
      sourceSystem
    };
    throw new CoordinateTransformationError(
      `Failed to convert coordinates to Mapbox format: ${details.originalError}`,
      point,
      sourceSystem,
      COORDINATE_SYSTEMS.WGS84,
      details
    );
  }
}

export { 
  COORDINATE_SYSTEMS,
  CoordinateSystemError,
  CoordinateTransformationError
};
