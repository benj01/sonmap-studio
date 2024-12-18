import proj4 from 'proj4';
import { CoordinateTransformer } from './coordinate-utils';
import { COORDINATE_SYSTEMS } from '../types/coordinates';

// Initialize coordinate systems
export function initializeCoordinateSystems() {
  // Swiss LV95 / EPSG:2056
  // Updated definition from EPSG registry
  proj4.defs(
    COORDINATE_SYSTEMS.SWISS_LV95,
    '+proj=somerc +lat_0=46.9524055555556 +lon_0=7.43958333333333 +k_0=1 +x_0=2600000 ' +
    '+y_0=1200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs'
  );

  // Swiss LV03 / EPSG:21781
  // Updated definition from EPSG registry
  proj4.defs(
    COORDINATE_SYSTEMS.SWISS_LV03,
    '+proj=somerc +lat_0=46.9524055555556 +lon_0=7.43958333333333 +k_0=1 +x_0=600000 ' +
    '+y_0=200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs'
  );

  // WGS84 / EPSG:4326
  proj4.defs(
    COORDINATE_SYSTEMS.WGS84,
    '+proj=longlat +datum=WGS84 +no_defs'
  );

  // Special handling for local coordinates (no transformation)
  proj4.defs(
    COORDINATE_SYSTEMS.NONE,
    '+proj=longlat +datum=WGS84 +no_defs'
  );

  // Register with proj4 globally
  (window as any).proj4 = proj4;

  // Verify transformations
  try {
    // Test point near Aarau in LV95
    const testPoint = [2645000, 1250000];
    const result = proj4(COORDINATE_SYSTEMS.SWISS_LV95, COORDINATE_SYSTEMS.WGS84, testPoint);
    console.debug('Coordinate system test transformation:', {
      from: 'LV95',
      point: testPoint,
      to: 'WGS84',
      result
    });
  } catch (error) {
    console.error('Failed to verify coordinate transformations:', error);
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
    initializeCoordinateSystems();
  }

  // If either system is 'none', return null to indicate no transformation needed
  if (fromSystem === COORDINATE_SYSTEMS.NONE || toSystem === COORDINATE_SYSTEMS.NONE) {
    return new CoordinateTransformer(fromSystem, fromSystem); // Use same system to prevent transformation
  }

  // For Swiss coordinates, always transform through WGS84
  if (fromSystem !== COORDINATE_SYSTEMS.WGS84 && toSystem !== COORDINATE_SYSTEMS.WGS84) {
    // Create a chain of transformers
    const toWGS84 = new CoordinateTransformer(fromSystem, COORDINATE_SYSTEMS.WGS84);
    const fromWGS84 = new CoordinateTransformer(COORDINATE_SYSTEMS.WGS84, toSystem);
    return {
      transform: (point) => {
        const wgs84Point = toWGS84.transform(point);
        if (!wgs84Point) return null;
        return fromWGS84.transform(wgs84Point);
      },
      transformBounds: (bounds) => {
        const wgs84Bounds = toWGS84.transformBounds(bounds);
        if (!wgs84Bounds) return null;
        return fromWGS84.transformBounds(wgs84Bounds);
      }
    } as CoordinateTransformer;
  }

  return new CoordinateTransformer(fromSystem, toSystem);
}

/**
 * Check if a coordinate system requires transformation
 * @param system The coordinate system to check
 * @returns boolean indicating if transformation is needed
 */
export function needsTransformation(system: string): boolean {
  return system !== COORDINATE_SYSTEMS.NONE;
}

/**
 * Convert coordinates to Mapbox format (longitude, latitude)
 * @param point The point to convert
 * @returns [longitude, latitude] array for Mapbox
 */
export function toMapboxCoordinates(point: { x: number; y: number }): [number, number] {
  // Mapbox expects coordinates in [longitude, latitude] format
  return [point.x, point.y];
}

export { COORDINATE_SYSTEMS };
