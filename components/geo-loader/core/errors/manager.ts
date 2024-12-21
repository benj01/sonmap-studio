import { ErrorReporter } from './types';
import { createErrorReporter } from './reporter';

/**
 * Manages error reporting across multiple processors
 */
export class ErrorManager {
  private reporters: Map<string, ErrorReporter> = new Map();
  private globalReporter: ErrorReporter;

  constructor() {
    this.globalReporter = createErrorReporter();
  }

  /**
   * Get or create reporter for a specific context
   */
  getReporter(context: string): ErrorReporter {
    if (!this.reporters.has(context)) {
      this.reporters.set(context, createErrorReporter());
    }
    return this.reporters.get(context)!;
  }

  /**
   * Get global error reporter
   */
  getGlobalReporter(): ErrorReporter {
    return this.globalReporter;
  }

  /**
   * Get all errors across all reporters
   */
  getAllErrors(): Array<{ context: string; message: string; code: string; details?: Record<string, unknown> }> {
    const errors: Array<{ context: string; message: string; code: string; details?: Record<string, unknown> }> = [];
    
    // Add global errors
    this.globalReporter.getErrors().forEach(error => {
      errors.push({ context: 'global', ...error });
    });

    // Add context-specific errors
    this.reporters.forEach((reporter, context) => {
      reporter.getErrors().forEach(error => {
        errors.push({ context, ...error });
      });
    });

    return errors;
  }

  /**
   * Get all warnings across all reporters
   */
  getAllWarnings(): Array<{ context: string; message: string; code: string; details?: Record<string, unknown> }> {
    const warnings: Array<{ context: string; message: string; code: string; details?: Record<string, unknown> }> = [];
    
    // Add global warnings
    this.globalReporter.getWarnings().forEach(warning => {
      warnings.push({ context: 'global', ...warning });
    });

    // Add context-specific warnings
    this.reporters.forEach((reporter, context) => {
      reporter.getWarnings().forEach(warning => {
        warnings.push({ context, ...warning });
      });
    });

    return warnings;
  }

  /**
   * Clear all errors and warnings
   */
  clear(): void {
    this.globalReporter.clear();
    this.reporters.forEach(reporter => reporter.clear());
  }
}
