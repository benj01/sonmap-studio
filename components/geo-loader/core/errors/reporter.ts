import { ErrorReporter } from './types';

/**
 * Implementation of error reporter
 */
export class ErrorReporterImpl implements ErrorReporter {
  private errors: Array<{ message: string; code: string; details?: Record<string, unknown> }> = [];
  private warnings: Array<{ message: string; code: string; details?: Record<string, unknown> }> = [];

  addError(message: string, code: string, details?: Record<string, unknown>): void {
    this.errors.push({ message, code, details });
  }

  addWarning(message: string, code: string, details?: Record<string, unknown>): void {
    this.warnings.push({ message, code, details });
  }

  getErrors() {
    return [...this.errors];
  }

  getWarnings() {
    return [...this.warnings];
  }

  clear(): void {
    this.errors = [];
    this.warnings = [];
  }
}

/**
 * Create a new error reporter instance
 */
export function createErrorReporter(): ErrorReporter {
  return new ErrorReporterImpl();
}
