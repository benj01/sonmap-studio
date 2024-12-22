import { Feature } from 'geojson';
import { IProcessor } from './interfaces';
import { ProcessorOptions, ProcessorResult, ProcessorStats, AnalyzeResult } from './types';
import { ErrorReporter, ValidationError } from '../../errors/types';
import { createErrorReporter } from '../../errors/reporter';

/**
 * Base class for file processors
 */
export abstract class BaseProcessor implements IProcessor {
  protected options: ProcessorOptions;
  protected errorReporter: ErrorReporter;

  constructor(options: ProcessorOptions = {}) {
    this.options = options;
    this.errorReporter = options.errorReporter || createErrorReporter();
  }

  abstract canProcess(file: File): Promise<boolean>;
  abstract analyze(file: File): Promise<AnalyzeResult>;
  abstract process(file: File): Promise<ProcessorResult>;
  abstract convertToFeatures(entities: any[]): Promise<Feature[]>;

  protected emitProgress(progress: number) {
    this.options.onProgress?.(Math.min(1, Math.max(0, progress)));
  }

  /**
   * Validate bounds object
   * @throws {ValidationError} If bounds are invalid
   */
  protected validateBounds(bounds: ProcessorResult['bounds']) {
    if (!isFinite(bounds.minX) || !isFinite(bounds.minY) ||
        !isFinite(bounds.maxX) || !isFinite(bounds.maxY)) {
      throw new ValidationError(
        'Invalid bounds coordinates',
        'bounds',
        undefined,
        { bounds }
      );
    }

    if (bounds.minX > bounds.maxX || bounds.minY > bounds.maxY) {
      throw new ValidationError(
        'Invalid bounds: min values greater than max values',
        'bounds',
        undefined,
        {
          bounds,
          minX: bounds.minX,
          maxX: bounds.maxX,
          minY: bounds.minY,
          maxY: bounds.maxY
        }
      );
    }

    return true;
  }

  protected createDefaultStats(): ProcessorStats {
    return {
      featureCount: 0,
      layerCount: 0,
      featureTypes: {},
      failedTransformations: 0,
      errors: []
    };
  }

  protected updateStats(stats: ProcessorStats, type: string) {
    stats.featureCount++;
    stats.featureTypes[type] = (stats.featureTypes[type] || 0) + 1;
  }

  protected recordError(
    stats: ProcessorStats,
    type: string,
    code: string,
    message?: string,
    details?: Record<string, unknown>
  ) {
    const existingError = stats.errors.find(e => e.type === type && e.code === code);
    if (existingError) {
      existingError.count++;
      if (details) {
        existingError.details = { ...existingError.details, ...details };
      }
    } else {
      stats.errors.push({ type, code, message, count: 1, details });
    }

    // Also report to error reporter
    this.errorReporter.addError(
      message || `${type} error`,
      code,
      { type, ...details }
    );
  }

  /**
   * Get all errors from this processor
   */
  getErrors(): string[] {
    return this.errorReporter.getErrors().map(e => e.message);
  }

  /**
   * Get all warnings from this processor
   */
  getWarnings(): string[] {
    return this.errorReporter.getWarnings().map(e => e.message);
  }

  /**
   * Clear all errors and warnings
   */
  clear(): void {
    this.errorReporter.clear();
  }
}
