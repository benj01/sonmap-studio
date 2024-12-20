/**
 * Base class for all geo-loader errors
 */
export class GeoLoaderError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'GeoLoaderError';
  }
}

/**
 * Error thrown when coordinate transformation fails
 */
export class CoordinateTransformationError extends GeoLoaderError {
  constructor(
    message: string,
    public readonly coordinates: { x: number; y: number; z?: number },
    public readonly sourceSystem: string,
    public readonly targetSystem: string,
    details?: Record<string, unknown>
  ) {
    super(message, 'COORDINATE_TRANSFORMATION_ERROR', {
      coordinates,
      sourceSystem,
      targetSystem,
      ...details
    });
    this.name = 'CoordinateTransformationError';
  }
}

/**
 * Error thrown when validation fails
 */
export class ValidationError extends GeoLoaderError {
  constructor(
    message: string,
    public readonly entityType: string,
    public readonly entityId?: string,
    details?: Record<string, unknown>
  ) {
    super(message, 'VALIDATION_ERROR', {
      entityType,
      entityId,
      ...details
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
    public readonly fileType: string,
    public readonly fileName: string,
    details?: Record<string, unknown>
  ) {
    super(message, 'PARSE_ERROR', {
      fileType,
      fileName,
      ...details
    });
    this.name = 'ParseError';
  }
}

/**
 * Error thrown when geometry operations fail
 */
/**
 * Error thrown when coordinate values are invalid
 */
export class InvalidCoordinateError extends GeoLoaderError {
  constructor(
    message: string,
    public readonly coordinates: { x: number; y: number; z?: number },
    details?: Record<string, unknown>
  ) {
    super(message, 'INVALID_COORDINATE_ERROR', {
      coordinates,
      ...details
    });
    this.name = 'InvalidCoordinateError';
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

export class GeometryError extends GeoLoaderError {
  constructor(
    message: string,
    public readonly geometryType: string,
    details?: Record<string, unknown>
  ) {
    super(message, 'GEOMETRY_ERROR', {
      geometryType,
      ...details
    });
    this.name = 'GeometryError';
  }
}

/**
 * Severity levels for error reporting
 */
export enum Severity {
  ERROR = 'error',
  WARNING = 'warning',
  INFO = 'info'
}

/**
 * Structure of an error message
 */
export interface ErrorMessage {
  message: string;
  code: string;
  severity: Severity;
  timestamp: Date;
  details?: Record<string, unknown>;
}

/**
 * Options for error reporter configuration
 */
export interface ErrorReporterOptions {
  /** Whether to log errors to console (default: true) */
  logToConsole?: boolean;
  /** Minimum severity level to report (default: INFO) */
  minSeverity?: Severity;
  /** Maximum number of errors to store (default: 100) */
  maxErrors?: number;
}

/**
 * Central error reporting and management class
 */
export class ErrorReporter {
  private errors: ErrorMessage[] = [];
  private options: Required<ErrorReporterOptions>;

  constructor(options?: ErrorReporterOptions) {
    this.options = {
      logToConsole: options?.logToConsole ?? true,
      minSeverity: options?.minSeverity ?? Severity.INFO,
      maxErrors: options?.maxErrors ?? 100
    };
  }

  /**
   * Add an error message
   */
  addError(message: string, code: string, details?: Record<string, unknown>): void {
    this.addMessage(message, code, Severity.ERROR, details);
  }

  /**
   * Add a warning message
   */
  addWarning(message: string, code: string, details?: Record<string, unknown>): void {
    this.addMessage(message, code, Severity.WARNING, details);
  }

  /**
   * Add an info message
   */
  addInfo(message: string, code: string, details?: Record<string, unknown>): void {
    this.addMessage(message, code, Severity.INFO, details);
  }

  /**
   * Get all error messages
   */
  getErrors(): ErrorMessage[] {
    return this.errors.filter(e => e.severity === Severity.ERROR);
  }

  /**
   * Get all warning messages
   */
  getWarnings(): ErrorMessage[] {
    return this.errors.filter(e => e.severity === Severity.WARNING);
  }

  /**
   * Get all info messages
   */
  getInfo(): ErrorMessage[] {
    return this.errors.filter(e => e.severity === Severity.INFO);
  }

  /**
   * Get all messages of specified severity or higher
   */
  getMessages(minSeverity: Severity = this.options.minSeverity): ErrorMessage[] {
    const severityOrder = {
      [Severity.ERROR]: 3,
      [Severity.WARNING]: 2,
      [Severity.INFO]: 1
    };
    return this.errors.filter(e => severityOrder[e.severity] >= severityOrder[minSeverity]);
  }

  /**
   * Check if there are any errors
   */
  hasErrors(): boolean {
    return this.errors.some(e => e.severity === Severity.ERROR);
  }

  /**
   * Check if there are any warnings
   */
  hasWarnings(): boolean {
    return this.errors.some(e => e.severity === Severity.WARNING);
  }

  /**
   * Clear all messages
   */
  clear(): void {
    this.errors = [];
  }

  private addMessage(
    message: string,
    code: string,
    severity: Severity,
    details?: Record<string, unknown>
  ): void {
    // Check if we should process this severity level
    if (this.shouldProcessSeverity(severity)) {
      const errorMessage: ErrorMessage = {
        message,
        code,
        severity,
        timestamp: new Date(),
        details
      };

      // Add to internal array
      this.errors.push(errorMessage);

      // Trim if we exceed maxErrors
      if (this.errors.length > this.options.maxErrors) {
        this.errors = this.errors.slice(-this.options.maxErrors);
      }

      // Log to console if enabled
      if (this.options.logToConsole) {
        this.logToConsole(errorMessage);
      }
    }
  }

  private shouldProcessSeverity(severity: Severity): boolean {
    const severityOrder = {
      [Severity.ERROR]: 3,
      [Severity.WARNING]: 2,
      [Severity.INFO]: 1
    };
    return severityOrder[severity] >= severityOrder[this.options.minSeverity];
  }

  private logToConsole(error: ErrorMessage): void {
    const timestamp = error.timestamp.toISOString();
    const details = error.details ? `\nDetails: ${JSON.stringify(error.details, null, 2)}` : '';
    const message = `[${timestamp}] ${error.severity.toUpperCase()}: ${error.message} (${error.code})${details}`;

    switch (error.severity) {
      case Severity.ERROR:
        console.error(message);
        break;
      case Severity.WARNING:
        console.warn(message);
        break;
      case Severity.INFO:
        console.info(message);
        break;
    }
  }
}

/**
 * Create a new ErrorReporter instance with default options
 */
export function createErrorReporter(options?: ErrorReporterOptions): ErrorReporter {
  return new ErrorReporter(options);
}
