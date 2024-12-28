import { ProcessorOptions } from '../../../processors/base/types';

/**
 * 3D vector representation
 */
export interface Vector3 {
  x: number;
  y: number;
  z?: number;
}

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
  | 'DIMENSION'
  | 'SPLINE'
  | 'HATCH'
  | 'SOLID'
  | 'FACE3D';

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
/** Hatch boundary path types */
export type HatchBoundaryType = 
  | 'POLYLINE'
  | 'CIRCLE'
  | 'ELLIPSE'
  | 'SPLINE';

/** Hatch boundary path definition */
export interface HatchBoundary {
  /** Boundary type */
  type: HatchBoundaryType;
  /** Whether boundary is external */
  isExternal: boolean;
  /** Boundary data */
  data: {
    /** Polyline vertices */
    vertices?: Array<{ x: number; y: number }>;
    /** Circle center and radius */
    center?: { x: number; y: number };
    radius?: number;
    /** Ellipse parameters */
    majorAxis?: { x: number; y: number };
    ratio?: number;
    /** Spline data */
    controlPoints?: Array<{ x: number; y: number }>;
    knots?: number[];
    weights?: number[];
  };
}

/** Text alignment types */
export type TextAlignment = 
  | 'LEFT'
  | 'CENTER'
  | 'RIGHT'
  | 'ALIGNED'
  | 'MIDDLE'
  | 'FIT';

/** Text vertical alignment types */
export type TextVerticalAlignment =
  | 'BASELINE'
  | 'BOTTOM'
  | 'MIDDLE'
  | 'TOP';

/** Dimension types */
export type DimensionType =
  | 'LINEAR'
  | 'ALIGNED'
  | 'ANGULAR'
  | 'DIAMETER'
  | 'RADIUS'
  | 'ORDINATE';

/** Dimension measurement data */
export interface DimensionMeasurement {
  /** Actual measurement value */
  value: number;
  /** Measurement unit */
  unit?: string;
  /** Prefix text */
  prefix?: string;
  /** Suffix text */
  suffix?: string;
  /** Override text (if different from calculated) */
  override?: string;
}

/** Dimension geometry points */
export interface DimensionGeometry {
  /** Definition points */
  defPoint?: Vector3;
  defPoint2?: Vector3;
  defPoint3?: Vector3;
  defPoint4?: Vector3;
  /** Text midpoint */
  textMid?: Vector3;
  /** Extension line points */
  ext1Start?: Vector3;
  ext1End?: Vector3;
  ext2Start?: Vector3;
  ext2End?: Vector3;
  /** Arrow points */
  arrow1?: Vector3;
  arrow2?: Vector3;
}

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
    /** Hatch specific */
    isSolid?: boolean;
    elevation?: number;
    boundaries?: HatchBoundary[];
    pattern?: {
      name: string;
      angle: number;
      scale: number;
      double: boolean;
    };
    /** Text specific */
    text?: string;
    height?: number;
    width?: number;
    style?: string;
    alignment?: TextAlignment;
    verticalAlignment?: TextVerticalAlignment;
    isBackward?: boolean;
    isUpsideDown?: boolean;
    oblique?: number;
    generation?: {
      isBox?: boolean;
      isMirrored?: boolean;
    };
    /** Dimension specific */
    dimType?: DimensionType;
    measurement?: DimensionMeasurement;
    geometry?: DimensionGeometry;
    dimStyle?: string;
    dimScale?: number;
    dimRotation?: number;
    dimArrowSize?: number;
    dimLineGap?: number;
    dimExtension?: number;
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
  /** Main entities */
  entities: DxfEntity[];
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
