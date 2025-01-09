/**
 * Database import result
 */
export interface DatabaseImportResult {
  /** Number of successfully imported features */
  importedFeatures: number;
  /** Collection identifier */
  collectionId: string;
  /** Layer identifiers */
  layerIds: string[];
  /** Failed feature imports */
  failedFeatures: Array<{
    entity: any;
    error: string;
  }>;
  /** Import statistics */
  statistics: {
    /** Total import time in milliseconds */
    importTime: number;
    /** Number of validated entities */
    validatedCount: number;
    /** Number of transformed entities */
    transformedCount: number;
  };
}
