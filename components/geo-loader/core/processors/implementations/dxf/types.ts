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
  data: {
    /** Coordinates */
    x?: number;
    y?: number;
    z?: number;
    x2?: number;
    y2?: number;
    z2?: number;
    /** Dimensions */
    radius?: number;
    /** Angles */
    angle?: number;
    startAngle?: number;
    endAngle?: number;
    /** Polyline specific */
    vertices?: Array<{
      x: number;
      y: number;
      z?: number;
    }>;
    closed?: boolean;
    /** Other properties */
    [key: string]: unknown;
  };
  /** Block name (for INSERT entities) */
  blockName?: string;
  /** Insertion point (for INSERT entities) */
  insertionPoint?: [number, number, number];
  /** Scale factors (for INSERT entities) */
  scale?: [number, number, number];
  /** Rotation angle in degrees (for INSERT entities) */
  rotation?: number;
  /** Column count (for INSERT entities) */
  columnCount?: number;
  /** Row count (for INSERT entities) */
  rowCount?: number;
  /** Column spacing (for INSERT entities) */
  columnSpacing?: number;
  /** Row spacing (for INSERT entities) */
  rowSpacing?: number;
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
  /** Layer name */
  layer?: string;
  /** Block description */
  description?: string;
  /** Block origin */
  origin?: [number, number, number];
  /** Block units */
  units?: string;
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
