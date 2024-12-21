/**
 * Base class for geo-loader errors
 */
export class GeoLoaderError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'GeoLoaderError';
  }
}

/**
 * Error thrown when coordinate system operations fail
 */
export class CoordinateSystemError extends GeoLoaderError {
  constructor(
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message, 'COORDINATE_SYSTEM_ERROR', details);
    this.name = 'CoordinateSystemError';
  }
}

/**
 * Error thrown when coordinate transformation fails
 */
export class CoordinateTransformationError extends GeoLoaderError {
  constructor(
    message: string,
    public point: { x: number; y: number },
    public fromSystem: string,
    public toSystem: string,
    details?: Record<string, unknown>
  ) {
    super(message, 'COORDINATE_TRANSFORMATION_ERROR', details);
    this.name = 'CoordinateTransformationError';
  }
}

/**
 * Error thrown when invalid coordinates are provided
 */
export class InvalidCoordinateError extends GeoLoaderError {
  constructor(
    message: string,
    public point: { x: number; y: number },
    details?: Record<string, unknown>
  ) {
    super(message, 'INVALID_COORDINATE_ERROR', details);
    this.name = 'InvalidCoordinateError';
  }
}

/**
 * Error thrown when file validation fails
 */
export class ValidationError extends GeoLoaderError {
  constructor(
    message: string,
    code: string,
    public field?: string,
    details?: Record<string, unknown>
  ) {
    super(message, code, details);
    this.name = 'ValidationError';
  }
}

/**
 * Error thrown when file parsing fails
 */
export class ParseError extends GeoLoaderError {
  constructor(
    message: string,
    code: string,
    public line?: number,
    details?: Record<string, unknown>
  ) {
    super(message, code, details);
    this.name = 'ParseError';
  }
}

/**
 * Interface for error reporting
 */
export interface ErrorReporter {
  addError(message: string, code: string, details?: Record<string, unknown>): void;
  addWarning(message: string, code: string, details?: Record<string, unknown>): void;
  getErrors(): Array<{ message: string; code: string; details?: Record<string, unknown> }>;
  getWarnings(): Array<{ message: string; code: string; details?: Record<string, unknown> }>;
  clear(): void;
}
