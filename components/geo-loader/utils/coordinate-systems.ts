import proj4 from 'proj4';
import { COORDINATE_SYSTEMS, CoordinateSystem } from '../types/coordinates';
import { ErrorReporter } from './errors';
import { CoordinateTransformer } from './coordinate-utils';

/**
 * Initialize coordinate systems in proj4
 */
export function initializeCoordinateSystems(proj4Instance: typeof proj4, errorReporter?: ErrorReporter): boolean {
  try {
    // Define Swiss coordinate systems
    proj4Instance.defs(COORDINATE_SYSTEMS.SWISS_LV95,
      '+proj=somerc +lat_0=46.95240555555556 +lon_0=7.439583333333333 ' +
      '+k_0=1 +x_0=2600000 +y_0=1200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 ' +
      '+units=m +no_defs');

    proj4Instance.defs(COORDINATE_SYSTEMS.SWISS_LV03,
      '+proj=somerc +lat_0=46.95240555555556 +lon_0=7.439583333333333 ' +
      '+k_0=1 +x_0=600000 +y_0=200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 ' +
      '+units=m +no_defs');

    // WGS84 is already defined by default
    proj4Instance.defs(COORDINATE_SYSTEMS.WGS84, '+proj=longlat +datum=WGS84 +no_defs');

    // NONE is treated as WGS84 for simplicity
    proj4Instance.defs(COORDINATE_SYSTEMS.NONE, proj4Instance.defs(COORDINATE_SYSTEMS.WGS84));

    // Verify transformations work by testing a known point
    try {
      const testPoint = proj4Instance(
        COORDINATE_SYSTEMS.SWISS_LV95,
        COORDINATE_SYSTEMS.WGS84,
        [2600000, 1200000]
      );

      // Test point should be approximately [7.4395, 46.9524]
      if (Math.abs(testPoint[0] - 7.4395) > 0.001 || Math.abs(testPoint[1] - 46.9524) > 0.001) {
        errorReporter?.reportError('INIT_ERROR', 'Coordinate system verification failed', {
          expected: [7.4395, 46.9524],
          actual: testPoint
        });
        return false;
      }
    } catch (error) {
      errorReporter?.reportError('INIT_ERROR', 'Failed to verify coordinate transformations', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }

    // Verify all systems are registered
    for (const system of Object.values(COORDINATE_SYSTEMS)) {
      if (!proj4Instance.defs(system)) {
        errorReporter?.reportError('INIT_ERROR', 'Coordinate system not registered', {
          system
        });
        return false;
      }
    }

    return true;
  } catch (error) {
    errorReporter?.reportError('INIT_ERROR', 'Failed to initialize coordinate systems', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return false;
  }
}

/**
 * Convert coordinates to Mapbox format (longitude, latitude)
 */
export function toMapboxCoordinates(
  point: { x: number; y: number },
  sourceSystem: CoordinateSystem = COORDINATE_SYSTEMS.WGS84,
  errorReporter: ErrorReporter,
  proj4Instance: typeof proj4
): [number, number] {
  try {
    // No transformation needed for WGS84 or NONE
    if (sourceSystem === COORDINATE_SYSTEMS.WGS84 || sourceSystem === COORDINATE_SYSTEMS.NONE) {
      return [point.x, point.y];
    }

    // Create transformer to WGS84
    const transformer = new CoordinateTransformer(
      sourceSystem,
      COORDINATE_SYSTEMS.WGS84,
      errorReporter,
      proj4Instance
    );

    const result = transformer.transform(point);
    if (!result) {
      throw new Error('Coordinate transformation failed');
    }

    return [result.x, result.y];
  } catch (error) {
    errorReporter.reportError('TRANSFORM_ERROR', 'Failed to convert to Mapbox coordinates', {
      error: error instanceof Error ? error.message : 'Unknown error',
      point,
      sourceSystem
    });
    throw error; // Don't silently fall back
  }
}

/**
 * Check if a coordinate system needs transformation
 */
export function needsTransformation(system: CoordinateSystem): boolean {
  return system !== COORDINATE_SYSTEMS.NONE && system !== COORDINATE_SYSTEMS.WGS84;
}

// Re-export for convenience
export { COORDINATE_SYSTEMS };
