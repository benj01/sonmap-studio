import proj4 from 'proj4';
import { CoordinateTransformer } from './coordinate-utils';
import { COORDINATE_SYSTEMS, isSwissSystem } from '../types/coordinates';

// Initialize coordinate systems
export function initializeCoordinateSystems(): boolean {
  try {
    // Swiss LV95 / EPSG:2056
    // Updated definition with more precise parameters
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

    // Register with proj4 globally
    (window as any).proj4 = proj4;

    // Verify transformations
    try {
      // Test point near Aarau in LV95 (2645021, 1249991)
      const testPoint = [2645021, 1249991];
      const result = proj4(COORDINATE_SYSTEMS.SWISS_LV95, COORDINATE_SYSTEMS.WGS84, testPoint);
      
      // Verify the result is reasonable (should be near 8.0, 47.4)
      const [lon, lat] = result;
      const isValid = 
        Math.abs(lon - 8.0) < 0.5 && // Should be within 0.5 degrees of expected
        Math.abs(lat - 47.4) < 0.5;  // Should be within 0.5 degrees of expected
      
      console.debug('Coordinate system test transformation:', {
        from: 'LV95',
        point: testPoint,
        to: 'WGS84',
        result,
        isValid,
        expected: [8.0, 47.4]
      });

      if (!isValid) {
        throw new Error(`Invalid test transformation result: ${result}`);
      }

      // Verify all systems are registered
      const systems = [
        COORDINATE_SYSTEMS.SWISS_LV95,
        COORDINATE_SYSTEMS.SWISS_LV03,
        COORDINATE_SYSTEMS.WGS84,
        COORDINATE_SYSTEMS.NONE
      ];
      
      const unregisteredSystems = systems.filter(system => !proj4.defs(system));
      if (unregisteredSystems.length > 0) {
        throw new Error(`Failed to verify coordinate systems: ${unregisteredSystems.join(', ')}`);
      }

      return true;
    } catch (error) {
      console.error('Failed to verify coordinate transformations:', error);
      return false;
    }
  } catch (error) {
    console.error('Failed to initialize coordinate systems:', error);
    return false;
  }
}

/**
 * Creates a new CoordinateTransformer instance for transforming coordinates
 * between the specified coordinate systems.
 * 
 * @param fromSystem The source coordinate system
 * @param toSystem The target coordinate system
 * @returns A CoordinateTransformer instance
 */
export function createTransformer(fromSystem: string, toSystem: string): CoordinateTransformer {
  // Initialize systems if not already done
  if (!proj4.defs(COORDINATE_SYSTEMS.SWISS_LV95)) {
    if (!initializeCoordinateSystems()) {
      throw new Error('Failed to initialize coordinate systems');
    }
  }

  // If either system is 'none', return identity transformer
  if (fromSystem === COORDINATE_SYSTEMS.NONE || toSystem === COORDINATE_SYSTEMS.NONE) {
    return new CoordinateTransformer(COORDINATE_SYSTEMS.WGS84, COORDINATE_SYSTEMS.WGS84);
  }

  return new CoordinateTransformer(fromSystem, toSystem);
}

/**
 * Check if a coordinate system requires transformation
 * @param system The coordinate system to check
 * @returns boolean indicating if transformation is needed
 */
export function needsTransformation(system: string): boolean {
  return system !== COORDINATE_SYSTEMS.NONE && system !== COORDINATE_SYSTEMS.WGS84;
}

/**
 * Convert coordinates to Mapbox format (longitude, latitude)
 * @param point The point to convert
 * @param sourceSystem The source coordinate system of the point
 * @returns [longitude, latitude] array for Mapbox
 */
export function toMapboxCoordinates(
  point: { x: number; y: number },
  sourceSystem: string = COORDINATE_SYSTEMS.WGS84
): [number, number] {
  // If the coordinates are already in WGS84, they're in lon/lat format
  if (sourceSystem === COORDINATE_SYSTEMS.WGS84 || sourceSystem === COORDINATE_SYSTEMS.NONE) {
    // For WGS84, x is longitude and y is latitude, which is what Mapbox expects
    return [point.x, point.y];
  }

  // For Swiss coordinates, x is easting (lon) and y is northing (lat)
  // We need to transform them to WGS84 first
  const transformer = createTransformer(sourceSystem, COORDINATE_SYSTEMS.WGS84);
  const transformed = transformer.transform(point);
  if (!transformed) {
    console.error('Failed to transform coordinates to Mapbox format:', point);
    // Return original coordinates as fallback
    return [point.x, point.y];
  }

  // The transformer already handles the coordinate order for Swiss systems
  return [transformed.x, transformed.y];
}

export { COORDINATE_SYSTEMS }
