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
