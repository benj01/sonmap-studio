import { File } from '@web-std/file';
import { ProcessorOptions, ProcessorResult, AnalyzeResult, DatabaseImportResult } from './types';
import { PostGISClient } from '@/components/geo-loader/database/client';
import { PostGISGeometry } from '../../../types/postgis';
import { Feature } from 'geojson';
import { CoordinateSystem } from '../../../types/coordinates';
import { DetectionResult } from '../../coordinate-systems/detector';

/**
 * Core processor interface that all format processors must implement
 */
export interface IProcessor {
  /**
   * Check if this processor can handle the given file
   */
  canProcess(file: File): Promise<boolean>;

  /**
   * Analyze file contents without full processing
   * Used for previews and metadata extraction
   */
  analyze(file: File): Promise<AnalyzeResult>;

  /**
   * Process file and import to database with transaction support
   * @param file File to process
   * @param dbClient PostGIS client instance
   * @param options Processing options including batch size
   */
  process(
    file: File, 
    dbClient: PostGISClient, 
    options?: ProcessorOptions & { 
      batchSize?: number;
      useTransaction?: boolean;
    }
  ): Promise<ProcessorResult>;

  /**
   * Import format-specific entities to database with batch processing
   * @param entities Array of entities to import
   * @param dbClient PostGIS client instance
   * @param options Import options including batch size
   */
  importToDatabase(
    entities: any[], 
    dbClient: PostGISClient,
    options?: {
      batchSize?: number;
      useTransaction?: boolean;
    }
  ): Promise<DatabaseImportResult>;

  /**
   * Validate data before import
   * @param entities Array of entities to validate
   */
  validateData(entities: any[]): Promise<boolean>;

  /**
   * Get all errors from this processor
   */
  getErrors(): string[];

  /**
   * Get all warnings from this processor
   */
  getWarnings(): string[];

  /**
   * Clear all errors and warnings
   */
  clear(): void;
}

/**
 * Interface for processor event handling
 */
export interface IProcessorEvents {
  /**
   * Report progress during processing
   */
  onProgress(progress: number): void;

  /**
   * Report warnings during processing
   */
  onWarning(message: string, details?: Record<string, unknown>): void;

  /**
   * Report errors during processing
   */
  onError(message: string, details?: Record<string, unknown>): void;

  /**
   * Report batch completion during processing
   */
  onBatchComplete?(batchNumber: number, totalBatches: number): void;

  /**
   * Report transaction status
   */
  onTransactionStatus?(status: 'begin' | 'commit' | 'rollback'): void;
}

/**
 * Interface for file parsing operations
 */
export interface IFileParser<T> {
  /**
   * Parse file content into format-specific data structure
   */
  parseContent(content: string | ArrayBuffer): Promise<T>;

  /**
   * Validate parsed data
   */
  validate(data: T): boolean;

  /**
   * Extract metadata from parsed data
   */
  extractMetadata(data: T): Record<string, unknown>;
}

/**
 * Interface for coordinate transformations
 */
export interface ICoordinateTransformer {
  /**
   * Transform a single point
   */
  transformPoint(point: { x: number; y: number; z?: number }): Promise<{ x: number; y: number; z?: number }>;

  /**
   * Transform bounds
   */
  transformBounds(bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  }): Promise<{
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  }>;
}

/**
 * Interface for PostGIS geometry operations
 */
export interface IPostGISGeometryHandler {
  /**
   * Convert entity to PostGIS geometry
   */
  toPostGISGeometry(entity: any): Promise<PostGISGeometry>;

  /**
   * Get SRID for PostGIS geometry
   */
  getSRID(): number;

  /**
   * Get geometry type for PostGIS
   */
  getGeometryType(): string;
}

/**
 * Interface for database transaction management
 */
export interface ITransactionManager {
  /**
   * Begin a transaction
   */
  beginTransaction(): Promise<void>;

  /**
   * Commit a transaction
   */
  commitTransaction(): Promise<void>;

  /**
   * Rollback a transaction
   */
  rollbackTransaction(): Promise<void>;

  /**
   * Check if a transaction is active
   */
  isTransactionActive(): boolean;
}

export interface ProcessorMetadata {
  fileName: string;
  fileSize: number;
  format: string;
  crs?: string | object;
  prj?: string;
  layerCount?: number;
  featureCount?: number;
  attributeSchema?: Record<string, string>;
  bounds?: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
}

export interface ProcessingOptions {
  sampleSize?: number;
  targetSystem?: CoordinateSystem;
  preserveOriginal?: boolean;
  streamingMode?: boolean;
  chunkSize?: number;
  maxMemoryMB?: number;
}

export interface ProcessingProgress {
  phase: 'analyzing' | 'sampling' | 'processing' | 'complete';
  processed: number;
  total: number;
  currentFile?: string;
  currentLayer?: string;
  error?: Error;
}

export interface ProcessingResult {
  features: Feature[];
  metadata: ProcessorMetadata;
  coordinateSystem: DetectionResult;
  layerStructure: LayerInfo[];
  progress: ProcessingProgress;
  warnings?: string[];
}

export interface LayerInfo {
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
}

export interface FileProcessor {
  /**
   * Check if this processor can handle the given file
   */
  canProcess(fileName: string, mimeType?: string): boolean;

  /**
   * Analyze the file and extract metadata without full processing
   */
  analyze(filePath: string): Promise<ProcessorMetadata>;

  /**
   * Sample a subset of features for preview
   */
  sample(filePath: string, options?: ProcessingOptions): Promise<ProcessingResult>;

  /**
   * Process the entire file
   */
  process(filePath: string, options?: ProcessingOptions): Promise<ProcessingResult>;

  /**
   * Get a stream of features for large files
   */
  createFeatureStream(filePath: string, options?: ProcessingOptions): AsyncIterableIterator<Feature>;

  /**
   * Clean up any resources
   */
  dispose(): Promise<void>;

  /**
   * Subscribe to processing progress
   */
  onProgress(callback: (progress: ProcessingProgress) => void): void;

  /**
   * Cancel ongoing processing
   */
  cancel(): Promise<void>;
}
