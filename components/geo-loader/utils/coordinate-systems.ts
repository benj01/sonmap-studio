// components/geo-loader/utils/coordinate-systems.ts

// Here we only define coordinate system constants and related types.
// All transformation logic and detection methods will be moved to coordinate-utils.ts.

export const COORDINATE_SYSTEMS = {
  WGS84: 'EPSG:4326',
  SWISS_LV95: 'EPSG:2056',
  SWISS_LV03: 'EPSG:21781',
} as const;

export type CoordinateSystem = typeof COORDINATE_SYSTEMS[keyof typeof COORDINATE_SYSTEMS];
