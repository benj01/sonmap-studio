import { ProcessorOptions } from '../../../processors/base/types';

/**
 * DXF entity types
 */
export type DxfEntityType = 
  | 'POINT'
  | 'LINE'
  | 'POLYLINE'
  | 'LWPOLYLINE'
  | 'CIRCLE'
  | 'ARC'
  | 'ELLIPSE'
  | 'INSERT'
  | 'TEXT'
  | 'MTEXT'
  | 'DIMENSION';

/**
 * DXF entity attributes
 */
export interface DxfEntityAttributes {
  /** Entity handle */
  handle?: string;
  /** Layer name */
  layer?: string;
  /** Line type */
  lineType?: string;
  /** Color number */
  color?: number;
  /** Line weight */
  lineWeight?: number;
  /** Transparency */
  transparency?: number;
  /** Additional properties */
  [key: string]: unknown;
}

/**
 * DXF entity definition
 */
export interface DxfEntity {
  /** Entity type */
  type: DxfEntityType;
  /** Entity attributes */
  attributes: DxfEntityAttributes;
  /** Entity geometry data */
  data: Record<string, unknown>;
}

/**
 * DXF layer definition
 */
export interface DxfLayer {
  /** Layer name */
  name: string;
  /** Layer color */
  color?: number;
  /** Line type */
  lineType?: string;
  /** Line weight */
  lineWeight?: number;
  /** Whether layer is frozen */
  frozen?: boolean;
  /** Whether layer is locked */
  locked?: boolean;
  /** Whether layer is off */
  off?: boolean;
}

/**
 * DXF block definition
 */
export interface DxfBlock {
  /** Block name */
  name: string;
  /** Block base point */
  basePoint: [number, number, number];
  /** Block entities */
  entities: DxfEntity[];
  /** Block attributes */
  attributes?: Record<string, unknown>;
}

/**
 * DXF file structure
 */
export interface DxfStructure {
  /** Available layers */
  layers: DxfLayer[];
  /** Available blocks */
  blocks: DxfBlock[];
  /** Entity types present in file */
  entityTypes: DxfEntityType[];
  /** Drawing units */
  units?: string;
  /** Drawing extents */
  extents?: {
    min: [number, number, number];
    max: [number, number, number];
  };
}

/**
 * DXF processor options
 */
export interface DxfProcessorOptions extends ProcessorOptions {
  /** Entity types to include */
  entityTypes?: DxfEntityType[];
  /** Whether to import block references */
  importBlocks?: boolean;
  /** Whether to import text entities */
  importText?: boolean;
  /** Whether to import dimensions */
  importDimensions?: boolean;
  /** Whether to preserve original colors */
  preserveColors?: boolean;
  /** Whether to preserve line weights */
  preserveLineWeights?: boolean;
  /** Whether to validate geometry */
  validateGeometry?: boolean;
  /** Maximum number of preview entities */
  previewEntities?: number;
}

/**
 * DXF parsing options
 */
export interface DxfParseOptions {
  /** Entity types to parse */
  entityTypes?: DxfEntityType[];
  /** Whether to parse blocks */
  parseBlocks?: boolean;
  /** Whether to parse text */
  parseText?: boolean;
  /** Whether to parse dimensions */
  parseDimensions?: boolean;
  /** Whether to validate geometry */
  validate?: boolean;
  /** Maximum number of entities to parse */
  maxEntities?: number;
}

/**
 * Result of DXF structure analysis
 */
export interface DxfAnalyzeResult {
  /** Detected file structure */
  structure: DxfStructure;
  /** Sample entities */
  preview: DxfEntity[];
  /** Any issues found during analysis */
  issues?: Array<{
    type: string;
    message: string;
    details?: Record<string, unknown>;
  }>;
}
