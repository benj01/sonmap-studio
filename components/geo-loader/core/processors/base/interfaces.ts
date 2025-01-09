import { File } from '@web-std/file';
import { ProcessorOptions, ProcessorResult, AnalyzeResult, DatabaseImportResult } from './types';
import { Feature } from 'geojson';
import { PostGISClient } from '../../../database/client';

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
   * Process file and import to database
   */
  process(file: File, dbClient: PostGISClient): Promise<ProcessorResult>;

  /**
   * Import format-specific entities to database
   */
  importToDatabase(entities: any[], dbClient: PostGISClient): Promise<DatabaseImportResult>;

  /**
   * Validate data before import
   */
  validateData(entities: any[]): Promise<boolean>;

  /**
   * Convert format-specific entities to GeoJSON features
   * @deprecated Use importToDatabase instead
   */
  convertToFeatures(entities: any[]): Promise<Feature[]>;

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
 * Interface for feature cache operations
 */
export interface IFeatureCache {
  /**
   * Add features to cache
   */
  addFeatures(features: GeoJSON.Feature[]): void;

  /**
   * Get features from cache
   */
  getFeatures(): GeoJSON.Feature[];

  /**
   * Clear cache
   */
  clear(): void;
}
