/**
 * Required bounds with all properties
 */
export interface RequiredBounds {
  /** Minimum X coordinate */
  minX: number;
  /** Minimum Y coordinate */
  minY: number;
  /** Maximum X coordinate */
  maxX: number;
  /** Maximum Y coordinate */
  maxY: number;
}

/**
 * Coordinate system with SRID
 */
export interface CoordinateSystemWithSRID {
  /** System name */
  name: string;
  /** System code */
  code?: string;
  /** Spatial reference identifier */
  srid: number;
  /** System units */
  units?: string;
  /** System description */
  description?: string;
}

/**
 * Compressed file with required properties
 */
export interface CompressedDxfFile {
  /** File data */
  data: File;
  /** File name */
  name: string;
  /** File path */
  path: string;
  /** File size */
  size: number;
}
