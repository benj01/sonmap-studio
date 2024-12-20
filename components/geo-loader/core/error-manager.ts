import { 
  ErrorSeverity,
  TimestampedError,
  ErrorFilterOptions,
  ErrorSummary
} from '../../../types/errors';

export interface GeoError extends TimestampedError {
  code: string;
  message: string;
  severity: ErrorSeverity;
  timestamp: number;
  context: Record<string, unknown>;
}

interface ErrorGroup {
  errors: GeoError[];
  count: number;
  lastOccurrence: number;
  firstOccurrence: number;
}

export class GeoErrorManager {
  private static instance: GeoErrorManager;
  private errors: Map<string, Map<string, ErrorGroup>>;
  private readonly MAX_ERRORS_PER_GROUP = 100;
  private readonly MAX_ERROR_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

  private constructor() {
    this.errors = new Map();
  }

  public static getInstance(): GeoErrorManager {
    if (!this.instance) {
      this.instance = new GeoErrorManager();
    }
    return this.instance;
  }

  public addError(
    context: string,
    code: string,
    message: string,
    severity: ErrorSeverity = ErrorSeverity.ERROR,
    details: Record<string, unknown> = {}
  ): void {
    const error: GeoError = {
      code,
      message,
      severity,
      timestamp: Date.now(),
      context: details
    };

    // Get or create context group
    if (!this.errors.has(context)) {
      this.errors.set(context, new Map());
    }
    const contextErrors = this.errors.get(context)!;

    // Get or create error group
    if (!contextErrors.has(code)) {
      contextErrors.set(code, {
        errors: [],
        count: 0,
        lastOccurrence: error.timestamp,
        firstOccurrence: error.timestamp
      });
    }
    const group = contextErrors.get(code)!;

    // Update error group
    group.count++;
    group.lastOccurrence = error.timestamp;
    group.errors.push(error);

    // Trim old errors if needed
    if (group.errors.length > this.MAX_ERRORS_PER_GROUP) {
      group.errors = group.errors.slice(-this.MAX_ERRORS_PER_GROUP);
    }

    // Log critical errors
    if (severity === ErrorSeverity.CRITICAL) {
      console.error(`[CRITICAL] ${context}: ${message}`, details);
    }
  }

  public getErrors(
    context?: string,
    options: {
      severity?: ErrorSeverity;
      code?: string;
      maxAge?: number;
    } = {}
  ): GeoError[] {
    const errors: GeoError[] = [];
    const maxAge = options.maxAge || this.MAX_ERROR_AGE_MS;
    const minTimestamp = Date.now() - maxAge;

    const contexts = context ? [context] : Array.from(this.errors.keys());
    
    contexts.forEach(ctx => {
      const contextErrors = this.errors.get(ctx);
      if (!contextErrors) return;

      Array.from(contextErrors.entries()).forEach(([errorCode, group]) => {
        if (options.code && errorCode !== options.code) return;

        group.errors.forEach(error => {
          if (error.timestamp < minTimestamp) return;
          if (options.severity && error.severity !== options.severity) return;
          errors.push(error);
        });
      });
    });

    return errors.sort((a, b) => b.timestamp - a.timestamp);
  }

  public getErrorSummary(context?: string): Array<{
    context: string;
    code: string;
    count: number;
    lastOccurrence: number;
    severity: ErrorSeverity;
    latestMessage: string;
  }> {
    const summary: ReturnType<typeof this.getErrorSummary> = [];
    const contexts = context ? [context] : Array.from(this.errors.keys());
    
    contexts.forEach(ctx => {
      const contextErrors = this.errors.get(ctx);
      if (!contextErrors) return;

      Array.from(contextErrors.entries()).forEach(([code, group]) => {
        if (group.errors.length === 0) return;

        const latestError = group.errors[group.errors.length - 1];
        summary.push({
          context: ctx,
          code,
          count: group.count,
          lastOccurrence: group.lastOccurrence,
          severity: latestError.severity,
          latestMessage: latestError.message
        });
      });
    });

    return summary.sort((a, b) => b.lastOccurrence - a.lastOccurrence);
  }

  public hasErrors(
    context?: string,
    severity: ErrorSeverity = ErrorSeverity.ERROR
  ): boolean {
    return this.getErrors(context, { severity }).length > 0;
  }

  public hasCriticalErrors(context?: string): boolean {
    return this.hasErrors(context, ErrorSeverity.CRITICAL);
  }

  public clear(context?: string): void {
    if (context) {
      this.errors.delete(context);
    } else {
      this.errors.clear();
    }
  }

  public clearOldErrors(): void {
    const minTimestamp = Date.now() - this.MAX_ERROR_AGE_MS;

    Array.from(this.errors.entries()).forEach(([context, contextErrors]) => {
      Array.from(contextErrors.entries()).forEach(([code, group]) => {
        group.errors = group.errors.filter((error: GeoError) => error.timestamp >= minTimestamp);
        if (group.errors.length === 0) {
          contextErrors.delete(code);
        }
      });
      if (contextErrors.size === 0) {
        this.errors.delete(context);
      }
    });
  }

  public getErrorCount(context?: string): number {
    if (context) {
      return this.getErrors(context).length;
    }
    
    return Array.from(this.errors.values()).reduce((total, contextErrors) => 
      total + Array.from(contextErrors.values()).reduce((subtotal, group) => 
        subtotal + group.errors.length, 0
      ), 0
    );
  }

  public getCriticalErrorCount(context?: string): number {
    return this.getErrors(context, { severity: ErrorSeverity.CRITICAL }).length;
  }

  public getContexts(): string[] {
    return Array.from(this.errors.keys());
  }
}

// Export singleton instance
export const geoErrorManager = GeoErrorManager.getInstance();
