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

/**
 * Error reporter interface for collecting and reporting errors
 */
export interface ErrorReporter {
  addError: (message: string, code: string, details?: ErrorDetails) => void;
  addWarning: (message: string, code: string, details?: ErrorDetails) => void;
  clear: () => void;
  getErrors: () => Array<{ message: string; code: string; details?: ErrorDetails }>;
  getWarnings: () => Array<{ message: string; code: string; details?: ErrorDetails }>;
}
