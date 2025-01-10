/**
 * Shared constants for shapefile processing
 * Used by both TypeScript and Rust (via WebAssembly) code
 */
export const SHAPEFILE_CONSTANTS = {
  // Header constants
  HEADER_LENGTH: 100,
  RECORD_HEADER_LENGTH: 8,
  FILE_CODE: 9994,
  VERSION: 1000,

  // Validation limits
  MAX_RECORD_LENGTH: 1000000,
  MAX_PARTS: 1000000,
  MAX_POINTS: 1000000,

  // Shape types
  SHAPE_TYPES: {
    NULL: 0,
    POINT: 1,
    POLYLINE: 3,
    POLYGON: 5,
    MULTIPOINT: 8,
    POINT_Z: 11,
    POLYLINE_Z: 13,
    POLYGON_Z: 15,
    MULTIPOINT_Z: 18,
    POINT_M: 21,
    POLYLINE_M: 23,
    POLYGON_M: 25,
    MULTIPOINT_M: 28,
    MULTIPATCH: 31
  }
} as const;
