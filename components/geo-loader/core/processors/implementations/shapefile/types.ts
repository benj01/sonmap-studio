import { ProcessorOptions } from '../../../processors/base/types';

/**
 * Shapefile geometry types
 */
export enum ShapeType {
  NULL = 0,
  POINT = 1,
  POLYLINE = 3,
  POLYGON = 5,
  MULTIPOINT = 8,
  POINTZ = 11,
  POLYLINEZ = 13,
  POLYGONZ = 15,
  MULTIPOINTZ = 18,
  POINTM = 21,
  POLYLINEM = 23,
  POLYGONM = 25,
  MULTIPOINTM = 28,
  MULTIPATCH = 31
}

/**
 * Shapefile record attributes
 */
export interface ShapefileAttributes {
  /** Record number */
  recordNumber: number;
  /** Field values */
  [key: string]: unknown;
}

/**
 * Shapefile field definition
 */
export interface ShapefileField {
  /** Field name */
  name: string;
  /** Field type */
  type: 'C' | 'N' | 'F' | 'L' | 'D';
  /** Field length */
  length: number;
  /** Decimal count for numeric fields */
  decimals?: number;
}

/**
 * Shapefile header information
 */
export interface ShapefileHeader {
  /** File code (should be 9994) */
  fileCode: number;
  /** File length in 16-bit words */
  fileLength: number;
  /** Version number */
  version: number;
  /** Shape type */
  shapeType: ShapeType;
  /** Bounding box */
  bbox: {
    xMin: number;
    yMin: number;
    xMax: number;
    yMax: number;
    zMin?: number;
    zMax?: number;
    mMin?: number;
    mMax?: number;
  };
}

/**
 * DBF file header information
 */
export interface DbfHeader {
  /** Version number */
  version: number;
  /** Last update date */
  lastUpdate: Date;
  /** Number of records */
  recordCount: number;
  /** Header length in bytes */
  headerLength: number;
  /** Record length in bytes */
  recordLength: number;
  /** Field descriptors */
  fields: ShapefileField[];
}

/**
 * Shapefile record
 */
export interface ShapefileRecord {
  /** Record header */
  header: {
    recordNumber: number;
    contentLength: number;
  };
  /** Shape type */
  shapeType: ShapeType;
  /** Shape data */
  data: Record<string, unknown>;
  /** DBF attributes */
  attributes?: ShapefileAttributes;
}

/**
 * Shapefile structure
 */
export interface ShapefileStructure {
  /** Shape file header */
  shapeHeader: ShapefileHeader;
  /** DBF file header */
  dbfHeader?: DbfHeader;
  /** Available fields */
  fields: ShapefileField[];
  /** Shape type */
  shapeType: ShapeType;
  /** Record count */
  recordCount: number;
}

/**
 * Shapefile processor options
 */
export interface ShapefileProcessorOptions extends ProcessorOptions {
  /** Whether to import DBF attributes */
  importAttributes?: boolean;
  /** Whether to validate geometry */
  validateGeometry?: boolean;
  /** Whether to repair invalid geometry */
  repairGeometry?: boolean;
  /** Whether to simplify geometry */
  simplifyGeometry?: boolean;
  /** Simplification tolerance */
  simplifyTolerance?: number;
  /** Maximum number of preview records */
  previewRecords?: number;
}

/**
 * Shapefile parsing options
 */
export interface ShapefileParseOptions {
  /** Whether to parse DBF */
  parseDbf?: boolean;
  /** Whether to validate geometry */
  validate?: boolean;
  /** Whether to repair geometry */
  repair?: boolean;
  /** Whether to simplify geometry */
  simplify?: boolean;
  /** Simplification tolerance */
  tolerance?: number;
  /** Maximum number of records to parse */
  maxRecords?: number;
}

/**
 * Result of shapefile structure analysis
 */
export interface ShapefileAnalyzeResult {
  /** Detected file structure */
  structure: ShapefileStructure;
  /** Sample records */
  preview: ShapefileRecord[];
  /** Any issues found during analysis */
  issues?: Array<{
    type: string;
    message: string;
    details?: Record<string, unknown>;
  }>;
}
