/**
 * Error details type
 */
export interface ErrorDetails extends Record<string, unknown> {
  originalError?: string;
}

/**
 * Base error class for geo-loader
 */
export class GeoLoaderError extends Error {
  constructor(
    message: string,
    public code: string,
    public cause?: Error,
    public details?: ErrorDetails
  ) {
    super(message);
    this.name = 'GeoLoaderError';
  }
}

/**
 * Error thrown during validation
 */
export class ValidationError extends GeoLoaderError {
  constructor(
    message: string,
    code: string,
    cause?: Error,
    details?: ErrorDetails
  ) {
    super(message, code, cause, details);
    this.name = 'ValidationError';
  }
}

/**
 * Error thrown during parsing
 */
export class ParseError extends GeoLoaderError {
  constructor(
    message: string,
    code: string,
    cause?: Error,
    details?: ErrorDetails
  ) {
    super(message, code, cause, details);
    this.name = 'ParseError';
  }
}

/**
 * Create error details with original error
 */
export function createErrorDetails(originalError: unknown): ErrorDetails {
  return {
    originalError: originalError instanceof Error ? originalError.message : String(originalError)
  };
}
