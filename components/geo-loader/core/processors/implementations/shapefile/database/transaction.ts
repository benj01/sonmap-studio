import { PostGISClient } from '../../../../../database/client';
import { PostGISFeature } from '../../../../../types/postgis';
import { DatabaseImportResult } from '../../../base/types';

/**
 * Options for transaction operations
 */
export interface TransactionOptions {
  /** Maximum number of records to process at once */
  batchSize: number;
  /** Whether to use transaction mode */
  useTransaction: boolean;
  /** Progress callback */
  onProgress?: (progress: number) => void;
  /** Batch completion callback */
  onBatchComplete?: (batchNumber: number, totalBatches: number) => void;
}

/**
 * Handle database transactions for shapefile import
 */
export class TransactionManager {
  private client: PostGISClient;
  private transactionActive = false;

  constructor(client: PostGISClient) {
    this.client = client;
  }

  /**
   * Begin a new transaction
   */
  async beginTransaction(): Promise<void> {
    if (!this.transactionActive) {
      await this.client.beginTransaction();
      this.transactionActive = true;
    }
  }

  /**
   * Commit the current transaction
   */
  async commitTransaction(): Promise<void> {
    if (this.transactionActive) {
      await this.client.commitTransaction();
      this.transactionActive = false;
    }
  }

  /**
   * Rollback the current transaction
   */
  async rollbackTransaction(): Promise<void> {
    if (this.transactionActive) {
      await this.client.rollbackTransaction();
      this.transactionActive = false;
    }
  }

  /**
   * Insert features in batches
   */
  async insertFeatures(
    tableName: string,
    features: PostGISFeature[],
    options: TransactionOptions
  ): Promise<DatabaseImportResult> {
    const {
      batchSize,
      useTransaction,
      onProgress,
      onBatchComplete
    } = options;

    const result: DatabaseImportResult = {
      importedFeatures: 0,
      collectionId: '',
      layerIds: [],
      failedFeatures: [],
      statistics: {
        importTime: 0,
        validatedCount: 0,
        transformedCount: 0,
        batchesProcessed: 0,
        transactionsCommitted: 0,
        transactionRollbacks: 0
      },
      postgis: {
        tableName,
        schemaName: 'public',
        srid: features[0]?.srid || 4326,
        geometryTypes: []
      }
    };

    const startTime = Date.now();

    try {
      if (useTransaction) {
        await this.beginTransaction();
      }

      for (let i = 0; i < features.length; i += batchSize) {
        const batch = features.slice(i, i + batchSize);
        
        try {
          const insertResult = await this.client.insertFeatures(
            tableName,
            batch,
            { batchSize }
          );

          if (insertResult) {
            result.importedFeatures += insertResult.inserted;
            result.failedFeatures.push(...batch
              .slice(insertResult.inserted)
              .map(feature => ({
                entity: feature,
                error: 'Failed to insert into PostGIS'
              }))
            );
          }

          if (onProgress) {
            onProgress((i + batch.length) / features.length);
          }

          result.statistics.batchesProcessed++;
          
          if (onBatchComplete) {
            onBatchComplete(
              result.statistics.batchesProcessed,
              Math.ceil(features.length / batchSize)
            );
          }
        } catch (error) {
          if (useTransaction) {
            throw error; // Will trigger rollback
          }
          // If not using transaction, log error and continue
          console.error('Batch insert failed:', error);
          result.failedFeatures.push(...batch.map(feature => ({
            entity: feature,
            error: error instanceof Error ? error.message : String(error)
          })));
        }
      }

      if (useTransaction) {
        await this.commitTransaction();
        result.statistics.transactionsCommitted++;
      }

    } catch (error) {
      if (this.transactionActive) {
        await this.rollbackTransaction();
        result.statistics.transactionRollbacks++;
      }
      throw error;
    }

    result.statistics.importTime = Date.now() - startTime;
    return result;
  }

  /**
   * Create spatial index for imported data
   */
  async createSpatialIndex(tableName: string, schemaName: string = 'public'): Promise<void> {
    const indexName = `${tableName}_geometry_idx`;
    await this.client.executeQuery(
      `CREATE INDEX IF NOT EXISTS ${indexName} ON ${schemaName}.${tableName} USING GIST (geometry)`
    );
  }

  /**
   * Check if a transaction is currently active
   */
  isTransactionActive(): boolean {
    return this.transactionActive;
  }
}
