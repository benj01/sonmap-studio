import { ProcessorOptions } from '../../../processors/base/types';

/**
 * CSV column definition
 */
export interface CsvColumn {
  /** Column name */
  name: string;
  /** Column index */
  index: number;
  /** Data type */
  type: 'string' | 'number' | 'boolean' | 'date';
  /** Whether this column contains coordinate data */
  isCoordinate?: boolean;
  /** Which coordinate component (x/y/z) this column represents */
  coordinateType?: 'x' | 'y' | 'z';
  /** Whether this column contains attribute data */
  isAttribute?: boolean;
  /** Whether this column should be ignored */
  ignore?: boolean;
}

/**
 * CSV file structure
 */
export interface CsvStructure {
  /** Column definitions */
  columns: CsvColumn[];
  /** Whether file has headers */
  hasHeaders: boolean;
  /** Delimiter character */
  delimiter: string;
  /** Quote character */
  quote: string;
  /** Comment character */
  comment?: string;
  /** Number of header rows to skip */
  skipRows?: number;
}

/**
 * CSV processor options
 */
export interface CsvProcessorOptions extends ProcessorOptions {
  /** Column configuration */
  columns?: CsvColumn[];
  /** Whether to detect column types */
  detectTypes?: boolean;
  /** Whether to treat first row as headers */
  hasHeaders?: boolean;
  /** Field delimiter */
  delimiter?: string;
  /** Quote character */
  quote?: string;
  /** Comment character */
  comment?: string;
  /** Number of rows to skip */
  skipRows?: number;
  /** Whether to validate coordinate values */
  validateCoordinates?: boolean;
  /** Maximum number of preview rows */
  previewRows?: number;
  /** Size of chunks for processing */
  chunkSize?: number;
}

/**
 * CSV parsing options
 */
export interface CsvParseOptions {
  /** Column configuration */
  columns: CsvColumn[];
  /** Whether file has headers */
  hasHeaders: boolean;
  /** Delimiter character */
  delimiter: string;
  /** Quote character */
  quote: string;
  /** Comment character */
  comment?: string;
  /** Number of rows to skip */
  skipRows?: number;
  /** Whether to validate values */
  validate?: boolean;
  /** Maximum number of rows to parse */
  maxRows?: number;
}

/**
 * Result of CSV structure analysis
 */
export interface CsvAnalyzeResult {
  /** Detected file structure */
  structure: CsvStructure;
  /** Sample rows */
  preview: string[][];
  /** Detected coordinate columns */
  coordinateColumns: CsvColumn[];
  /** Detected attribute columns */
  attributeColumns: CsvColumn[];
  /** Any issues found during analysis */
  issues?: Array<{
    type: string;
    message: string;
    details?: Record<string, unknown>;
  }>;
}
