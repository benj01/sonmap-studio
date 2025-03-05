import { GeoFeature, FullDataset } from '@/types/geo-import';

/**
 * Progress event for parser operations
 */
export interface ParserProgressEvent {
  phase: 'reading' | 'parsing' | 'processing' | 'complete';
  progress: number;  // 0-100
  message?: string;
  featuresProcessed?: number;
  totalFeatures?: number;
}

/**
 * Base error class for parser operations
 */
export class ParserError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'ParserError';
  }
}

/**
 * Specific error types
 */
export class FileNotFoundError extends ParserError {
  constructor(fileName: string) {
    super(
      `File not found: ${fileName}`,
      'FILE_NOT_FOUND',
      { fileName }
    );
  }
}

export class InvalidFileFormatError extends ParserError {
  constructor(fileName: string, reason: string) {
    super(
      `Invalid file format: ${reason}`,
      'INVALID_FORMAT',
      { fileName, reason }
    );
  }
}

export class MissingCompanionFileError extends ParserError {
  constructor(mainFile: string, missingFile: string) {
    super(
      `Missing required companion file: ${missingFile}`,
      'MISSING_COMPANION',
      { mainFile, missingFile }
    );
  }
}

/**
 * Parser configuration options
 */
export interface ParserOptions {
  maxFeatures?: number;
  skipValidation?: boolean;
  encoding?: string;
  srid?: number;
  transformCoordinates?: boolean;
  filename?: string;
}

/**
 * Base interface for all geodata parsers
 */
export interface GeoDataParser {
  /**
   * Parse the input file(s) and return a full dataset
   * @param mainFile The main file to parse
   * @param companionFiles Optional companion files (e.g., .shx, .dbf for Shapefiles)
   * @param options Parser configuration options
   * @param onProgress Callback for progress updates
   */
  parse(
    mainFile: ArrayBuffer,
    companionFiles?: Record<string, ArrayBuffer>,
    options?: ParserOptions,
    onProgress?: (event: ParserProgressEvent) => void
  ): Promise<FullDataset>;

  /**
   * Validate the input file(s) before parsing
   * @param mainFile The main file to validate
   * @param companionFiles Optional companion files
   */
  validate(
    mainFile: ArrayBuffer,
    companionFiles?: Record<string, ArrayBuffer>
  ): Promise<boolean>;

  /**
   * Get metadata about the dataset without full parsing
   * @param mainFile The main file to analyze
   * @param companionFiles Optional companion files
   */
  getMetadata(
    mainFile: ArrayBuffer,
    companionFiles?: Record<string, ArrayBuffer>
  ): Promise<{
    featureCount: number;
    bounds?: [number, number, number, number];
    geometryTypes: string[];
    properties: string[];
    srid?: number;
  }>;

  /**
   * Clean up any resources used by the parser
   */
  dispose(): void;
}

/**
 * Base abstract class implementing common parser functionality
 */
export abstract class BaseGeoDataParser implements GeoDataParser {
  protected reportProgress(
    onProgress: ((event: ParserProgressEvent) => void) | undefined,
    event: Partial<ParserProgressEvent>
  ) {
    if (onProgress) {
      onProgress({
        phase: 'processing',
        progress: 0,
        ...event
      });
    }
  }

  abstract parse(
    mainFile: ArrayBuffer,
    companionFiles?: Record<string, ArrayBuffer>,
    options?: ParserOptions,
    onProgress?: (event: ParserProgressEvent) => void
  ): Promise<FullDataset>;

  abstract validate(
    mainFile: ArrayBuffer,
    companionFiles?: Record<string, ArrayBuffer>
  ): Promise<boolean>;

  abstract getMetadata(
    mainFile: ArrayBuffer,
    companionFiles?: Record<string, ArrayBuffer>
  ): Promise<{
    featureCount: number;
    bounds?: [number, number, number, number];
    geometryTypes: string[];
    properties: string[];
    srid?: number;
  }>;

  dispose(): void {
    // Base implementation - override if needed
  }

  protected validateCompanionFiles(
    required: string[],
    provided?: Record<string, ArrayBuffer>
  ): void {
    if (!provided) {
      if (required.length > 0) {
        throw new MissingCompanionFileError('main file', required.join(', '));
      }
      return;
    }

    const missing = required.filter(file => !provided[file]);
    if (missing.length > 0) {
      throw new MissingCompanionFileError('main file', missing.join(', '));
    }
  }

  protected async readFileAsText(file: ArrayBuffer, encoding: string = 'utf-8'): Promise<string> {
    const decoder = new TextDecoder(encoding);
    return decoder.decode(file);
  }
} 