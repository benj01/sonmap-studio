import proj4 from 'proj4';
import { CoordinateTransformer } from './coordinate-utils';
import { COORDINATE_SYSTEMS } from '../types/coordinates';

// Register the coordinate systems with proj4
proj4.defs(COORDINATE_SYSTEMS.WGS84, '+proj=longlat +datum=WGS84 +no_defs');
proj4.defs(COORDINATE_SYSTEMS.SWISS_LV95, '+proj=somerc +lat_0=46.95240555555556 +lon_0=7.439583333333333 +k_0=1 +x_0=2600000 +y_0=1200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs');
proj4.defs(COORDINATE_SYSTEMS.SWISS_LV03, '+proj=somerc +lat_0=46.95240555555556 +lon_0=7.439583333333333 +k_0=1 +x_0=600000 +y_0=200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs');

// Special handling for local coordinates (no transformation)
proj4.defs(COORDINATE_SYSTEMS.NONE, '+proj=longlat +datum=WGS84 +no_defs');

/**
 * Creates a new CoordinateTransformer instance for transforming coordinates
 * between the specified coordinate systems.
 * 
 * @param fromSystem The source coordinate system
 * @param toSystem The target coordinate system
 * @returns A CoordinateTransformer instance
 */
export function createTransformer(fromSystem: string, toSystem: string): CoordinateTransformer {
  // If either system is 'none', return null to indicate no transformation needed
  if (fromSystem === COORDINATE_SYSTEMS.NONE || toSystem === COORDINATE_SYSTEMS.NONE) {
    return new CoordinateTransformer(fromSystem, fromSystem); // Use same system to prevent transformation
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

export { COORDINATE_SYSTEMS };
