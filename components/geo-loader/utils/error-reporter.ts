export type ErrorSeverity = 'error' | 'warning';

export interface ErrorContext {
  [key: string]: any;
}

export interface ErrorReport {
  type: string;
  message: string;
  severity: ErrorSeverity;
  context?: ErrorContext;
  timestamp: Date;
}

export interface ErrorReporter {
  reportError(type: string, message: string, context?: ErrorContext): void;
  reportWarning(type: string, message: string, context?: ErrorContext): void;
  getErrors(): ErrorReport[];
  getWarnings(): ErrorReport[];
  clear(): void;
}

export class ErrorReporterImpl implements ErrorReporter {
  private reports: ErrorReport[] = [];

  private addReport(type: string, message: string, severity: ErrorSeverity, context?: ErrorContext) {
    this.reports.push({
      type,
      message,
      severity,
      context,
      timestamp: new Date()
    });
  }

  reportError(type: string, message: string, context?: ErrorContext): void {
    this.addReport(type, message, 'error', context);
  }

  reportWarning(type: string, message: string, context?: ErrorContext): void {
    this.addReport(type, message, 'warning', context);
  }

  getErrors(): ErrorReport[] {
    return this.reports.filter(report => report.severity === 'error');
  }

  getWarnings(): ErrorReport[] {
    return this.reports.filter(report => report.severity === 'warning');
  }

  clear(): void {
    this.reports = [];
  }
}

export const createErrorReporter = (): ErrorReporter => new ErrorReporterImpl();
