import { CoordinateSystem } from '../../../types/coordinates';
import { ErrorReporterImpl as ErrorReporter } from '../../../core/errors/reporter';

/**
 * Base processor options
 */
export interface ProcessorOptions {
  /** Target coordinate system */
  coordinateSystem?: CoordinateSystem;
  /** Selected layers to process */
  selectedLayers?: string[];
  /** Selected types to process */
  selectedTypes?: string[];
  /** Whether to import attributes */
  importAttributes?: boolean;
  /** Error reporter instance */
  errorReporter?: ErrorReporter;
  /** Progress callback */
  onProgress?: (progress: number) => void;
  /** Related files (e.g. shapefile components) */
  relatedFiles?: {
    /** DBF file containing attributes */
    dbf?: File;
    /** SHX file containing shape index */
    shx?: File;
    /** PRJ file containing projection info */
    prj?: File;
  };
}

/**
 * Processor statistics
 */
export interface ProcessorStats {
  /** Total number of features */
  featureCount: number;
  /** Number of layers */
  layerCount: number;
  /** Feature type counts */
  featureTypes: Record<string, number>;
  /** Number of failed transformations */
  failedTransformations: number;
  /** Processing errors */
  errors: Array<{
    message: string;
    details?: Record<string, unknown>;
  }>;
}

/**
 * Result of processing
 */
export interface ProcessorResult {
  /** Processed features */
  features: any[];
  /** Processing statistics */
  statistics: ProcessorStats;
  /** Detected coordinate system */
  coordinateSystem?: CoordinateSystem;
  /** Detected layers */
  layers: string[];
  /** Bounding box */
  bounds?: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
}

/**
 * Result of file analysis
 */
export interface AnalyzeResult {
  /** Detected layers */
  layers: string[];
  /** Detected coordinate system */
  coordinateSystem?: CoordinateSystem;
  /** Bounding box */
  bounds?: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  /** Preview data */
  preview?: {
    type: string;
    features: any[];
  };
  /** Any issues found during analysis */
  issues?: Array<{
    type: string;
    message: string;
    details?: Record<string, unknown>;
  }>;
}
