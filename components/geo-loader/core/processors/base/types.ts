/**
 * Base types for processors
 */

export interface ProcessorStats {
  featureCount: number;
  layerCount: number;
  featureTypes: Record<string, number>;
  failedTransformations: number;
  errors: string[];
}

export interface ProcessorResult {
  bounds?: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  success: boolean;
  error?: string;
  statistics: ProcessorStats;
}

/**
 * Preview data structure
 */
export interface PreviewData<R = any, F = any> {
  records: R[];
  features: F[];
}

/**
 * Analysis result
 */
export interface AnalyzeResult<R = any, F = any> {
  layers: string[];
  coordinateSystem: CoordinateSystem;
  bounds: Required<ProcessorResult>['bounds'];
  preview: PreviewData<R, F>;
}

/**
 * Base processor options
 */
export interface ProcessorOptions {
  /** Coordinate system identifier */
  coordinateSystem?: string;
  /** Maximum number of preview records */
  previewRecords?: number;
  /** Whether to import attributes */
  importAttributes?: boolean;
  /** Selected layers for processing */
  selectedLayers?: string[];
  /** Selected template types */
  selectedTypes?: string[];
  /** Error reporter instance */
  errorReporter?: ErrorReporter;
}

/**
 * Database import result
 */
export interface DatabaseImportResult {
  importedFeatures: number;
  collectionId: string;
  layerIds: string[];
  failedFeatures: Array<{
    entity: any;
    error: string;
  }>;
  statistics: {
    importTime: number;
    validatedCount: number;
    transformedCount: number;
    batchesProcessed: number;
    transactionsCommitted: number;
    transactionRollbacks: number;
  };
  postgis: {
    tableName: string;
    schemaName: string;
    srid: number;
    geometryTypes: string[];
  };
}

/**
 * Stream processor result
 */
export interface StreamProcessorResult extends ProcessorResult {
  databaseResult?: DatabaseImportResult;
}

/**
 * Stream processor events
 */
export interface StreamProcessorEvents {
  onProgress?: (progress: number) => void;
  onWarning?: (message: string) => void;
  onError?: (error: Error) => void;
  onBatchComplete?: (batchNumber: number, totalBatches: number) => void;
  onTransactionStatus?: (status: 'begin' | 'commit' | 'rollback') => void;
}

import { Feature } from 'geojson';
import { CoordinateSystem } from '../../../types/coordinates';
import { ErrorReporter } from '../../errors/types';

/**
 * Represents a geo file upload with its companion files
 */
export interface GeoFileUpload {
  mainFile: {
    name: string;
    data: ArrayBuffer;
    type: string;
    size: number;
  };
  companions: {
    [extension: string]: {
      name: string;
      data: ArrayBuffer;
      type: string;
      size: number;
    };
  };
}

/**
 * Processing options for geo data import
 */
export interface ProcessingOptions {
  coordinateSystem?: string;
  sampleSize?: number;
  validation?: {
    validateGeometry?: boolean;
    repairInvalid?: boolean;
    simplifyTolerance?: number;
  };
  encoding?: string;
  importAttributes?: boolean;
  previewRecords?: number;
}

/**
 * Status of the processing operation
 */
export interface ProcessingStatus {
  phase: 'analyzing' | 'sampling' | 'processing' | 'complete';
  processed: number;
  total: number;
  currentFile?: string;
  currentLayer?: string;
  error?: Error;
}

/**
 * Result of the processing operation
 */
export interface ProcessingResult {
  features: Feature[];
  metadata: {
    fileName: string;
    fileSize: number;
    format: string;
    crs?: string;
    layerCount: number;
    featureCount: number;
    attributeSchema?: Record<string, string>;
    bounds?: {
      minX: number;
      minY: number;
      maxX: number;
      maxY: number;
    };
  };
  layerStructure: Array<{
    name: string;
    featureCount: number;
    geometryType: string;
    attributes: Array<{
      name: string;
      type: string;
      sample?: any;
    }>;
    bounds?: {
      minX: number;
      minY: number;
      maxX: number;
      maxY: number;
    };
  }>;
  warnings?: string[];
  statistics?: {
    importTime?: number;
    validatedCount?: number;
    transformedCount?: number;
    batchesProcessed?: number;
    failedFeatures?: Array<{
      entity: any;
      error: string;
    }>;
  };
}

/**
 * Context for the processing operation
 */
export interface ProcessingContext {
  mainFile: GeoFileUpload['mainFile'];
  companions: GeoFileUpload['companions'];
  options: ProcessingOptions;
  progress: (status: ProcessingStatus) => void;
}

/**
 * Error types for geo data processing
 */
export enum ProcessingErrorType {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  PARSING_ERROR = 'PARSING_ERROR',
  MISSING_FILE = 'MISSING_FILE',
  INVALID_FORMAT = 'INVALID_FORMAT',
  COORDINATE_SYSTEM_ERROR = 'COORDINATE_SYSTEM_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

/**
 * Error with additional processing context
 */
export class ProcessingError extends Error {
  constructor(
    message: string,
    public type: ProcessingErrorType,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'ProcessingError';
  }
}
