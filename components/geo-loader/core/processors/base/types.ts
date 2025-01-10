/**
 * Base types for processors
 */

export interface ProcessorStats {
  featureCount: number;
  layerCount: number;
  featureTypes: Record<string, number>;
  failedTransformations: number;
  errors: string[];
}

export interface ProcessorResult {
  bounds?: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  success: boolean;
  error?: string;
  statistics: ProcessorStats;
}

/**
 * Preview data structure
 */
export interface PreviewData<R = any, F = any> {
  records: R[];
  features: F[];
}

/**
 * Analysis result
 */
export interface AnalyzeResult<R = any, F = any> {
  layers: string[];
  coordinateSystem: string;
  bounds: Required<ProcessorResult>['bounds'];
  preview: PreviewData<R, F>;
}

/**
 * Base processor options
 */
export interface ProcessorOptions {
  /** Coordinate system identifier */
  coordinateSystem?: string;
  /** Maximum number of preview records */
  previewRecords?: number;
  /** Whether to import attributes */
  importAttributes?: boolean;
}

/**
 * Database import result
 */
export interface DatabaseImportResult {
  importedFeatures: number;
  collectionId: string;
  layerIds: string[];
  failedFeatures: Array<{
    entity: any;
    error: string;
  }>;
  statistics: {
    importTime: number;
    validatedCount: number;
    transformedCount: number;
    batchesProcessed: number;
    transactionsCommitted: number;
    transactionRollbacks: number;
  };
  postgis: {
    tableName: string;
    schemaName: string;
    srid: number;
    geometryTypes: string[];
  };
}

/**
 * Stream processor result
 */
export interface StreamProcessorResult extends ProcessorResult {
  databaseResult?: DatabaseImportResult;
}

/**
 * Stream processor events
 */
export interface StreamProcessorEvents {
  onProgress?: (progress: number) => void;
  onWarning?: (message: string) => void;
  onError?: (error: Error) => void;
  onBatchComplete?: (batchNumber: number, totalBatches: number) => void;
  onTransactionStatus?: (status: 'begin' | 'commit' | 'rollback') => void;
}
