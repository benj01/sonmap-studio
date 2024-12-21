/**
 * Represents a coordinate system
 */
export interface CoordinateSystem {
  /** Unique identifier for the coordinate system */
  id: string;
  /** Human-readable name */
  name: string;
  /** EPSG code if available */
  epsg?: number;
  /** WKT definition if available */
  wkt?: string;
  /** Proj4 definition if available */
  proj4?: string;
  /** Units of measurement */
  units?: 'meters' | 'feet' | 'degrees';
  /** Whether the system is geographic (lat/lon) */
  isGeographic?: boolean;
}

/**
 * Represents a coordinate transformation result
 */
export interface TransformResult {
  /** Transformed coordinates */
  coordinates: number[];
  /** Whether the transformation was successful */
  success: boolean;
  /** Error message if transformation failed */
  error?: string;
}

/**
 * Options for coordinate transformation
 */
export interface TransformOptions {
  /** Whether to attempt fallback transformations */
  allowFallback?: boolean;
  /** Whether to validate coordinates before transformation */
  validate?: boolean;
  /** Custom error handler */
  onError?: (error: Error) => void;
}

/**
 * Represents a coordinate transformation operation
 */
export interface TransformOperation {
  /** Source coordinate system */
  from: CoordinateSystem;
  /** Target coordinate system */
  to: CoordinateSystem;
  /** Transform function */
  transform: (coordinates: number[]) => number[];
}
