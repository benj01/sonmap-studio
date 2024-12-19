import { ErrorReporter, ErrorReport, Severity, ErrorContext } from '../utils/errors';
import { DxfData } from '../utils/dxf/types';

/**
 * Mock implementation of ErrorReporter for testing
 */
export class MockErrorReporter implements ErrorReporter {
  private reports: ErrorReport[] = [];

  reportError(type: string, message: string, context?: ErrorContext): void {
    this.reports.push({
      type,
      message,
      severity: Severity.ERROR,
      context,
      timestamp: new Date()
    });
  }

  reportWarning(type: string, message: string, context?: ErrorContext): void {
    this.reports.push({
      type,
      message,
      severity: Severity.WARNING,
      context,
      timestamp: new Date()
    });
  }

  reportInfo(type: string, message: string, context?: ErrorContext): void {
    this.reports.push({
      type,
      message,
      severity: Severity.INFO,
      context,
      timestamp: new Date()
    });
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

  // Helper methods for testing
  getLastReport(): ErrorReport | undefined {
    return this.reports[this.reports.length - 1];
  }

  getReportsByType(type: string): ErrorReport[] {
    return this.reports.filter(r => r.type === type);
  }

  getReportsBySeverity(severity: Severity): ErrorReport[] {
    return this.reports.filter(r => r.severity === severity);
  }

  getReportCount(): number {
    return this.reports.length;
  }
}

/**
 * Create a new mock error reporter for testing
 */
export function createMockErrorReporter(): MockErrorReporter {
  return new MockErrorReporter();
}

/**
 * Create mock DXF data for testing
 */
export function createMockDxfData(): DxfData {
  return {
    entities: [],
    blocks: {},
    tables: {
      layer: {
        layers: {}
      }
    }
  };
}

/**
 * Helper function to create a mock file for testing
 */
export function createMockFile(name: string, type: string, content: string | Blob): File {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  return new File([blob], name, { type });
}

/**
 * Helper function to create a mock coordinate system for testing
 */
export function createMockCoordinateSystem(name: string, proj4Def: string): void {
  (window as any).proj4.defs(name, proj4Def);
}

/**
 * Helper function to remove a mock coordinate system after testing
 */
export function removeMockCoordinateSystem(name: string): void {
  delete (window as any).proj4.defs[name];
}

/**
 * Helper function to wait for a specified number of milliseconds
 */
export function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Helper function to create a mock error context
 */
export function createMockErrorContext(data: Record<string, unknown>): ErrorContext {
  return data;
}
