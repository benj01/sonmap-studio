import { FeatureCollection } from 'geojson';
import { CoordinateSystem } from '../types/coordinates';
import { DxfData } from '../utils/dxf/types';
import { 
  GeoLoaderError, 
  ErrorReporter, 
  createErrorReporter,
  ValidationError,
  ParseError
} from '../utils/errors';

/**
 * Options for file processing
 */
export interface ProcessorOptions {
  /** Target coordinate system for output */
  coordinateSystem?: CoordinateSystem;
  /** Layers to include in processing */
  selectedLayers?: string[];
  /** Entity types to include in processing */
  selectedTypes?: string[];
  /** Whether to import attribute data */
  importAttributes?: boolean;
  /** Custom error reporter instance */
  errorReporter?: ErrorReporter;
  /** Progress callback */
  onProgress?: (progress: number) => void;
}

/**
 * Statistics about processed features
 */
export interface ProcessorStats {
  /** Total number of features processed */
  featureCount: number;
  /** Number of layers found */
  layerCount: number;
  /** Count of each feature type */
  featureTypes: Record<string, number>;
  /** Number of failed coordinate transformations */
  failedTransformations: number;
  /** Processing errors by type */
  errors: Array<{
    type: string;
    code: string;
    message?: string;
    count: number;
    details?: Record<string, unknown>;
  }>;
}

/**
 * Result of file processing
 */
export interface ProcessorResult {
  /** Processed GeoJSON features */
  features: FeatureCollection;
  /** Bounds of all features */
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  /** Available layers */
  layers: string[];
  /** Coordinate system of output features */
  coordinateSystem: CoordinateSystem;
  /** Processing statistics */
  statistics: ProcessorStats;
  /** Optional DXF data for DXF processor */
  dxfData?: DxfData;
}

/**
 * Result of file analysis
 */
export interface AnalyzeResult {
  /** Available layers */
  layers: string[];
  /** Detected coordinate system */
  coordinateSystem?: CoordinateSystem;
  /** Bounds of preview features */
  bounds?: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  /** Preview features */
  preview: FeatureCollection;
  /** Optional DXF data for DXF processor */
  dxfData?: DxfData;
}

/**
 * Base class for file processors
 */
export abstract class BaseProcessor {
  protected options: ProcessorOptions;
  protected errorReporter: ErrorReporter;

  constructor(options: ProcessorOptions = {}) {
    this.options = options;
    this.errorReporter = options.errorReporter || createErrorReporter();
  }

  /**
   * Check if this processor can handle the given file
   * @throws {ValidationError} If file validation fails
   */
  abstract canProcess(file: File): Promise<boolean>;

  /**
   * Analyze file contents without full processing
   * @throws {ParseError} If analysis fails
   */
  abstract analyze(file: File): Promise<AnalyzeResult>;

  /**
   * Process file and convert to GeoJSON
   * @throws {ParseError} If processing fails
   */
  abstract process(file: File): Promise<ProcessorResult>;

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

// Helper type for processor registration
export type ProcessorConstructor = new (options: ProcessorOptions) => BaseProcessor;

/**
 * Registry for file processors
 */
export class ProcessorRegistry {
  private static processors = new Map<string, ProcessorConstructor>();

  static register(extension: string, processor: ProcessorConstructor) {
    this.processors.set(extension.toLowerCase(), processor);
  }

  static async getProcessor(file: File, options: ProcessorOptions = {}): Promise<BaseProcessor | null> {
    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    const ProcessorClass = this.processors.get(extension);
    
    if (!ProcessorClass) {
      return null;
    }

    try {
      const processor = new ProcessorClass(options);
      const canProcess = await processor.canProcess(file);
      return canProcess ? processor : null;
    } catch (error) {
      const errorReporter = options.errorReporter || createErrorReporter();
      errorReporter.addError(
        `Failed to create processor for ${file.name}: ${error instanceof Error ? error.message : String(error)}`,
        'PROCESSOR_CREATION_ERROR',
        { file: file.name, extension, error: error instanceof Error ? error.message : String(error) }
      );
      return null;
    }
  }

  static getSupportedExtensions(): string[] {
    return Array.from(this.processors.keys());
  }
}

/**
 * Create a processor for the given file
 * @throws {ValidationError} If no processor is available for the file type
 */
export function createProcessor(file: File, options: ProcessorOptions = {}): Promise<BaseProcessor | null> {
  return ProcessorRegistry.getProcessor(file, options);
}
