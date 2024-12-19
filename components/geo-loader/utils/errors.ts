/**
 * Base class for all geo-loader errors
 */
export class GeoLoaderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeoLoaderError';
  }
}

/**
 * Error thrown when invalid coordinates are encountered
 */
export class InvalidCoordinateError extends GeoLoaderError {
  constructor(
    message: string,
    public readonly coordinates: number[],
    public readonly coordinateSystem?: string
  ) {
    super(message);
    this.name = 'InvalidCoordinateError';
  }
}

/**
 * Error thrown when coordinate transformation fails
 */
export class CoordinateTransformationError extends GeoLoaderError {
  constructor(
    message: string,
    public readonly originalCoordinates: { x: number; y: number; z?: number },
    public readonly fromSystem: string,
    public readonly toSystem: string,
    public readonly featureId?: string,
    public readonly layer?: string
  ) {
    super(message);
    this.name = 'CoordinateTransformationError';
  }
}

/**
 * Error thrown when file parsing fails
 */
export class FileParsingError extends GeoLoaderError {
  constructor(
    message: string,
    public readonly fileType: string,
    public readonly fileName: string
  ) {
    super(message);
    this.name = 'FileParsingError';
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
    public readonly layer?: string
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Severity levels for errors and warnings
 */
export enum Severity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error'
}

/**
 * Interface for error/warning messages
 */
export interface ErrorReport {
  type: string;
  message: string;
  severity: Severity;
  context?: ErrorContext;
  timestamp: Date;
}

/**
 * Interface for error context
 */
export interface ErrorContext {
  [key: string]: unknown;
}

/**
 * Interface for error reporting
 */
export interface ErrorReporter {
  /**
   * Report an error with context
   */
  reportError(type: string, message: string, context?: ErrorContext): void;

  /**
   * Report a warning with context
   */
  reportWarning(type: string, message: string, context?: ErrorContext): void;

  /**
   * Report an info message with context
   */
  reportInfo(type: string, message: string, context?: ErrorContext): void;

  /**
   * Get all error reports
   */
  getReports(): ErrorReport[];

  /**
   * Get error reports only
   */
  getErrors(): ErrorReport[];

  /**
   * Get warning reports only
   */
  getWarnings(): ErrorReport[];

  /**
   * Check if there are any errors
   */
  hasErrors(): boolean;

  /**
   * Clear all reports
   */
  clear(): void;
}

/**
 * Implementation of ErrorReporter
 */
export class ErrorReporterImpl implements ErrorReporter {
  private reports: ErrorReport[] = [];

  private addReport(type: string, message: string, severity: Severity, context?: ErrorContext): void {
    this.reports.push({
      type,
      message,
      severity,
      context,
      timestamp: new Date()
    });
  }

  reportError(type: string, message: string, context?: ErrorContext): void {
    this.addReport(type, message, Severity.ERROR, context);
  }

  reportWarning(type: string, message: string, context?: ErrorContext): void {
    this.addReport(type, message, Severity.WARNING, context);
  }

  reportInfo(type: string, message: string, context?: ErrorContext): void {
    this.addReport(type, message, Severity.INFO, context);
  }

  getReports(): ErrorReport[] {
    return [...this.reports];
  }

  getErrors(): ErrorReport[] {
    return this.reports.filter(r => r.severity === Severity.ERROR);
  }

  getWarnings(): ErrorReport[] {
    return this.reports.filter(r => r.severity === Severity.WARNING);
  }

  hasErrors(): boolean {
    return this.reports.some(r => r.severity === Severity.ERROR);
  }

  clear(): void {
    this.reports = [];
  }
}

/**
 * Create a new ErrorReporter instance
 */
export function createErrorReporter(): ErrorReporter {
  return new ErrorReporterImpl();
}

// Helper function to convert from old Message format to new ErrorReport format
export function convertMessage(message: { severity: Severity; message: string; timestamp: Date; error?: Error; context?: Record<string, unknown> }): ErrorReport {
  return {
    type: message.error?.name || 'UNKNOWN',
    message: message.message,
    severity: message.severity,
    context: message.context,
    timestamp: message.timestamp
  };
}
