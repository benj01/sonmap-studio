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
    
    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * Get a formatted string representation of the error
   */
  toString(): string {
    let result = `${this.name}: ${this.message}`;
    if (this.details) {
      result += `\nDetails: ${JSON.stringify(this.details, null, 2)}`;
    }
    return result;
  }

  /**
   * Convert error to a plain object for serialization
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
    };
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
    super(message, code, {
      field,
      ...details,
    });
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
    super(message, code, {
      line,
      ...details,
    });
    this.name = 'ParseError';
  }
}

/**
 * Error thrown when coordinate system operations fail
 */
export class CoordinateSystemError extends GeoLoaderError {
  constructor(
    message: string,
    code: string,
    public system?: string,
    details?: Record<string, unknown>
  ) {
    super(message, code, {
      system,
      ...details,
    });
    this.name = 'CoordinateSystemError';
  }
}

/**
 * Interface for error reporting
 */
export interface ErrorReporter {
  /**
   * Add an error to the report
   */
  addError(message: string, code: string, details?: Record<string, unknown>): void;
  
  /**
   * Add a warning to the report
   */
  addWarning(message: string, code: string, details?: Record<string, unknown>): void;
  
  /**
   * Get all errors
   */
  getErrors(): Array<{ message: string; code: string; details?: Record<string, unknown> }>;
  
  /**
   * Get all warnings
   */
  getWarnings(): Array<{ message: string; code: string; details?: Record<string, unknown> }>;
  
  /**
   * Clear all errors and warnings
   */
  clear(): void;
}
