import { CoordinateSystem } from '../../../types/coordinates';
import { ErrorReporterImpl as ErrorReporter } from '../../../core/errors/reporter';
import { PostGISBatchOptions } from '../../../types/postgis';

/**
 * Base processor options
 */
export interface ProcessorOptions {
  /** Target coordinate system */
  coordinateSystem?: CoordinateSystem;
  /** Selected layers to process */
  selectedLayers?: string[];
  /** Selected types to process */
  selectedTypes?: string[];
  /** Whether to import attributes */
  importAttributes?: boolean;
  /** Error reporter instance */
  errorReporter?: ErrorReporter;
  /** Progress callback */
  onProgress?: (progress: number) => void;
  /** Related files (e.g. shapefile components) */
  relatedFiles?: {
    /** DBF file containing attributes */
    dbf?: File;
    /** SHX file containing shape index */
    shx?: File;
    /** PRJ file containing projection info */
    prj?: File;
  };
  /** PostGIS batch processing options */
  postgis?: PostGISBatchOptions & {
    /** Table name for import */
    tableName?: string;
    /** Schema name for import */
    schemaName?: string;
  };
}

/**
 * Processor statistics
 */
export interface ProcessorStats {
  /** Total number of features */
  featureCount: number;
  /** Number of layers */
  layerCount: number;
  /** Feature type counts */
  featureTypes: Record<string, number>;
  /** Number of failed transformations */
  failedTransformations: number;
  /** Processing errors */
  errors: Array<{
    message: string;
    details?: Record<string, unknown>;
  }>;
}

/**
 * Result of database import operation
 */
export interface DatabaseImportResult {
  /** Number of features successfully imported */
  importedFeatures: number;
  /** Collection ID in the database */
  collectionId: string;
  /** Layer IDs in the database */
  layerIds: string[];
  /** Failed features */
  failedFeatures: Array<{
    entity: any;
    error: string;
  }>;
  /** Import statistics */
  statistics: {
    /** Time taken for import */
    importTime: number;
    /** Number of features validated */
    validatedCount: number;
    /** Number of features transformed */
    transformedCount: number;
    /** Number of batches processed */
    batchesProcessed?: number;
    /** Number of transactions committed */
    transactionsCommitted?: number;
    /** Number of transaction rollbacks */
    transactionRollbacks?: number;
  };
  /** PostGIS-specific results */
  postgis?: {
    /** Table name where data was imported */
    tableName: string;
    /** Schema name where data was imported */
    schemaName: string;
    /** SRID of imported geometries */
    srid: number;
    /** Geometry types imported */
    geometryTypes: string[];
  };
}

/**
 * Result of processing operation
 */
export interface ProcessorResult {
  /** Database import result */
  databaseResult: DatabaseImportResult;
  /** Processing statistics */
  statistics: ProcessorStats;
  /** Detected coordinate system */
  coordinateSystem?: CoordinateSystem;
  /** Detected layers */
  layers: string[];
  /** Bounding box */
  bounds?: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
}

/**
 * Result of file analysis
 */
export interface AnalyzeResult {
  /** Detected layers */
  layers: string[];
  /** Detected coordinate system */
  coordinateSystem?: CoordinateSystem;
  /** Bounding box */
  bounds?: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  /** Preview data */
  preview?: {
    type: string;
    features: any[];
  };
  /** Any issues found during analysis */
  issues?: Array<{
    type: string;
    message: string;
    details?: Record<string, unknown>;
  }>;
}
