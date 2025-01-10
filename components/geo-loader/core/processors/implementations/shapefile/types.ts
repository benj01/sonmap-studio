import { ProcessorOptions, PreviewData } from '../../base/types';
import { PostGISBatchOptions } from '../../../../types/postgis';
import { ShapefileRecord, ShapefileData, ShapefileAttributes } from './types/records';
import { Feature } from 'geojson';

export type { ShapefileRecord, ShapefileData, ShapefileAttributes };

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
 * Shapefile structure
 */
export interface ShapefileStructure {
  /** Shape file header */
  shapeHeader: {
    fileCode: number;
    fileLength: number;
    version: number;
    shapeType: ShapeType;
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
  };
  /** DBF file header */
  dbfHeader?: {
    version: number;
    lastUpdate: Date;
    recordCount: number;
    headerLength: number;
    recordLength: number;
    fields: Array<{
      name: string;
      type: 'C' | 'N' | 'F' | 'L' | 'D';
      length: number;
      decimals?: number;
    }>;
  };
  /** Available fields */
  fields: Array<{
    name: string;
    type: 'C' | 'N' | 'F' | 'L' | 'D';
    length: number;
    decimals?: number;
  }>;
  /** Shape type */
  shapeType: ShapeType;
  /** Record count */
  recordCount: number;
}

/**
 * Preview data structure
 */
export type ShapefilePreviewData = PreviewData<ShapefileRecord, Feature>;

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
  /** Related shapefile component files */
  relatedFiles?: {
    /** DBF file containing attributes */
    dbf?: File;
    /** SHX file containing shape index */
    shx?: File;
    /** PRJ file containing projection info */
    prj?: File;
  };
  /** PostGIS-specific options */
  postgis?: PostGISBatchOptions & {
    /** Table name for import */
    tableName?: string;
    /** Schema name for import */
    schemaName?: string;
    /** SRID for geometry import */
    srid?: number;
    /** Whether to create spatial indexes */
    createSpatialIndex?: boolean;
    /** Whether to validate geometry in PostGIS */
    validateInPostGIS?: boolean;
  };
}

/**
 * Analysis issue type
 */
export interface AnalysisIssue {
  type: 'WARNING' | 'ERROR';
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Analysis result
 */
export interface ShapefileAnalyzeResult {
  /** Detected file structure */
  structure: ShapefileStructure;
  /** Sample records */
  preview: ShapefileRecord[];
  /** Any issues found during analysis */
  issues?: AnalysisIssue[];
}
