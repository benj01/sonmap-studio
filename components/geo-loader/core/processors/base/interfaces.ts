import { Feature } from 'geojson';
import { PostGISClient } from '@/components/geo-loader/database/client';
import { PostGISGeometry } from '../../../types/postgis';
import { CoordinateSystem } from '../../../types/coordinates';
import { DetectionResult } from '../../coordinate-systems/detector';

export interface ProcessorOptions {
  coordinateSystem?: string;
  validation?: {
    validateGeometry?: boolean;
    repairInvalid?: boolean;
    simplifyTolerance?: number;
  };
  encoding?: string;
  sampleSize?: number;
}

export interface GeoFileUpload {
  mainFile: {
    name: string;
    data: ArrayBuffer;
    type: string;
    size: number;
  };
  companions: Record<string, {
    name: string;
    data: ArrayBuffer;
    type: string;
    size: number;
  }>;
}

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
}

/**
 * Core processor interface that all format processors must implement
 */
export interface FileProcessor {
  /**
   * Check if this processor can handle the given file
   */
  canProcess(fileName: string, mimeType?: string): boolean;

  /**
   * Analyze file contents without full processing
   */
  analyze(upload: GeoFileUpload, options?: ProcessorOptions): Promise<ProcessingResult>;

  /**
   * Sample a subset of features for preview
   */
  sample(upload: GeoFileUpload, options?: ProcessorOptions): Promise<ProcessingResult>;

  /**
   * Process the entire file
   */
  process(upload: GeoFileUpload, options?: ProcessorOptions): Promise<ProcessingResult>;

  /**
   * Clean up resources
   */
  dispose?(): Promise<void>;
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
