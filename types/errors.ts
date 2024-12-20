/**
 * Severity levels for errors
 */
export enum ErrorSeverity {
  /** Informational message */
  INFO = 'info',
  /** Warning that doesn't prevent operation */
  WARNING = 'warning',
  /** Error that affects operation but allows continuation */
  ERROR = 'error',
  /** Critical error that prevents operation */
  CRITICAL = 'critical'
}

/**
 * Base error interface
 */
export interface BaseError {
  message: string;
  code: string;
  context?: Record<string, unknown>;
}

/**
 * Error with severity level
 */
export interface SeverityError extends BaseError {
  severity: ErrorSeverity;
}

/**
 * Error with timestamp
 */
export interface TimestampedError extends SeverityError {
  timestamp: number;
}

/**
 * Error with source context
 */
export interface ContextualError extends TimestampedError {
  source: string;
  details?: Record<string, unknown>;
}

/**
 * Error group statistics
 */
export interface ErrorGroupStats {
  count: number;
  firstOccurrence: number;
  lastOccurrence: number;
  severity: ErrorSeverity;
}

/**
 * Error filter options
 */
export interface ErrorFilterOptions {
  severity?: ErrorSeverity;
  code?: string;
  maxAge?: number;
  source?: string;
}

/**
 * Error summary
 */
export interface ErrorSummary {
  context: string;
  code: string;
  count: number;
  lastOccurrence: number;
  severity: ErrorSeverity;
  latestMessage: string;
}
