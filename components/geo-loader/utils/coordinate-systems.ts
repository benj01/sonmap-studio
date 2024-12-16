// components/geo-loader/utils/coordinate-systems.ts
import proj4 from 'proj4';
import { CoordinateTransformer } from './coordinate-utils';

// Define the coordinate systems
export const COORDINATE_SYSTEMS = {
  WGS84: 'EPSG:4326',
  SWISS_LV95: 'EPSG:2056',
  SWISS_LV03: 'EPSG:21781',
} as const;

// Register the coordinate systems with proj4
proj4.defs(COORDINATE_SYSTEMS.WGS84, '+proj=longlat +datum=WGS84 +no_defs');
proj4.defs(COORDINATE_SYSTEMS.SWISS_LV95, '+proj=somerc +lat_0=46.95240555555556 +lon_0=7.439583333333333 +k_0=1 +x_0=2600000 +y_0=1200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs');
proj4.defs(COORDINATE_SYSTEMS.SWISS_LV03, '+proj=somerc +lat_0=46.95240555555556 +lon_0=7.439583333333333 +k_0=1 +x_0=600000 +y_0=200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs');

export type CoordinateSystem = typeof COORDINATE_SYSTEMS[keyof typeof COORDINATE_SYSTEMS];

// Helper function to create a transformer
export function createTransformer(fromSystem: string, toSystem: string): CoordinateTransformer {
  return new CoordinateTransformer(fromSystem, toSystem);
}
