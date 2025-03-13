import { LogManager } from '@/core/logging/log-manager';
import { createLogger } from '@/utils/logger';
import {
  ImportServiceConfig,
  BatchProcessingConfig,
  RetryConfig,
  ImportState,
  ImportProgress,
  ImportResult,
  ImportParams,
  StreamParams,
  ImportAdapter,
  StorageAdapter,
  MetricsAdapter
} from './types/index';

const SOURCE = 'ImportService';
const logger = createLogger(SOURCE);

const DEFAULT_BATCH_CONFIG: BatchProcessingConfig = {
  initialBatchSize: 100,
  minBatchSize: 10,
  maxBatchSize: 500,
  batchSizeAdjustmentFactor: 1.5,
  memoryThreshold: 0.8, // 80% of maxMemoryUsage
  maxMemoryUsage: 512 * 1024 * 1024 // 512MB
};

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffFactor: 2
};

const DEFAULT_CONFIG: ImportServiceConfig = {
  defaultBatchSize: 100,
  defaultTargetSrid: 4326,
  maxRetries: 3,
  retryDelay: 1000,
  checkpointInterval: 5000,
  batchProcessing: DEFAULT_BATCH_CONFIG,
  retry: DEFAULT_RETRY_CONFIG,
  pauseOnMemoryThreshold: true,
  enableAutoResume: true
};

export class ImportService {
  private readonly logger = createLogger(SOURCE);
  private readonly config: ImportServiceConfig;
  private readonly activeImports: Map<string, { 
    state: ImportState;
    controller?: AbortController;
  }> = new Map();

  constructor(
    private readonly importAdapter: ImportAdapter,
    private readonly storageAdapter: StorageAdapter,
    private readonly metricsAdapter: MetricsAdapter,
    config: Partial<ImportServiceConfig> = {}
  ) {
    this.config = {
      defaultBatchSize: 100,
      defaultTargetSrid: 4326,
      maxRetries: 3,
      retryDelay: 1000,
      checkpointInterval: 1000,
      batchProcessing: {
        initialBatchSize: 100,
        minBatchSize: 10,
        maxBatchSize: 1000,
        batchSizeAdjustmentFactor: 1.5,
        memoryThreshold: 0.8,
        maxMemoryUsage: 0.9
      },
      retry: {
        maxRetries: 3,
        initialDelay: 1000,
        maxDelay: 10000,
        backoffFactor: 2
      },
      pauseOnMemoryThreshold: true,
      enableAutoResume: true,
      ...config
    };
  }

  private async getMemoryUsage(): Promise<number> {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const { heapUsed } = process.memoryUsage();
      return heapUsed;
    }
    return 0;
  }

  private async adjustBatchSize(currentBatchSize: number, memoryUsage: number): Promise<number> {
    const { batchProcessing } = this.config;
    const memoryUsageRatio = memoryUsage / batchProcessing.maxMemoryUsage;

    if (memoryUsageRatio > batchProcessing.memoryThreshold) {
      // Decrease batch size
      const newBatchSize = Math.max(
        batchProcessing.minBatchSize,
        Math.floor(currentBatchSize / batchProcessing.batchSizeAdjustmentFactor)
      );
      logger.warn('Decreasing batch size due to high memory usage', {
        currentBatchSize,
        newBatchSize,
        memoryUsageRatio
      });
      return newBatchSize;
    } else if (memoryUsageRatio < batchProcessing.memoryThreshold / 2) {
      // Increase batch size
      const newBatchSize = Math.min(
        batchProcessing.maxBatchSize,
        Math.floor(currentBatchSize * batchProcessing.batchSizeAdjustmentFactor)
      );
      logger.info('Increasing batch size due to low memory usage', {
        currentBatchSize,
        newBatchSize,
        memoryUsageRatio
      });
      return newBatchSize;
    }

    return currentBatchSize;
  }

  private calculateRetryDelay(retryCount: number): number {
    const { retry } = this.config;
    const delay = retry.initialDelay * Math.pow(retry.backoffFactor, retryCount);
    return Math.min(delay, retry.maxDelay);
  }

  async importFeatures(params: ImportParams): Promise<ImportResult> {
    try {
      await this.metricsAdapter.trackImportStart(params);

      const result = await this.importAdapter.importFeatures({
        ...params,
        batchSize: params.batchSize || this.config.defaultBatchSize,
        targetSrid: params.targetSrid || this.config.defaultTargetSrid
      });

      await this.metricsAdapter.trackImportComplete(result);
      return result;
    } catch (error) {
      logger.error('Import failed', { error });
      await this.metricsAdapter.trackImportError(error as Error);
      throw error;
    }
  }

  async streamFeatures(params: StreamParams): Promise<ReadableStream> {
    const importId = `${params.projectFileId}-${Date.now()}`;
    const controller = new AbortController();
    let currentState: ImportState = {
      currentBatch: 0,
      processedCount: 0,
      totalFeatures: params.features.length,
      batchSize: params.batchSize || this.config.defaultBatchSize,
      retryCount: 0
    };

    this.activeImports.set(importId, {
      state: currentState,
      controller
    });

    logger.debug('Starting import stream', {
      importId,
      totalFeatures: params.features.length,
      batchSize: currentState.batchSize,
      sourceSrid: params.sourceSrid,
      targetSrid: params.targetSrid || this.config.defaultTargetSrid
    });

    try {
      await this.metricsAdapter.trackImportStart(params);

      // Set up checkpoint interval
      const checkpointInterval = setInterval(async () => {
        if (currentState.processedCount > 0) {
          await this.storageAdapter.saveCheckpoint(importId, currentState);
        }
      }, this.config.checkpointInterval);

      // Create simplified wrapped handlers
      const wrappedOnError = async (error: Error) => {
        try {
          clearInterval(checkpointInterval);
          this.activeImports.delete(importId);
          
          // Log the raw error
          logger.error('Stream error occurred', { 
            error: error.message,
            importId,
            stack: error.stack
          });
          
          await this.metricsAdapter.trackImportError(error);
          
          // Pass the raw error to the original handler
          if (params.onError) {
            await params.onError(error);
          }
        } catch (handlerError) {
          logger.error('Error in error handler', {
            originalError: error.message,
            handlerError: handlerError instanceof Error ? handlerError.message : String(handlerError)
          });
          
          // Still try to call the original handler
          if (params.onError) {
            await params.onError(error);
          }
        }
      };

      // Create a wrapped onComplete handler
      const wrappedOnComplete = async (result: ImportResult) => {
        clearInterval(checkpointInterval);
        await this.storageAdapter.clearCheckpoint(importId);
        await this.metricsAdapter.trackImportComplete(result);
        this.activeImports.delete(importId);
        
        if (params.onComplete) {
          await params.onComplete(result);
        }
      };

      // Create a wrapped onProgress handler
      const wrappedOnProgress = async (progress: ImportProgress) => {
        try {
          // Monitor memory usage and adjust batch size
          const memoryUsage = await this.getMemoryUsage();
          const currentBatchSize = currentState.batchSize || this.config.batchProcessing.initialBatchSize;
          const newBatchSize = await this.adjustBatchSize(currentBatchSize, memoryUsage);

          currentState = {
            ...currentState,
            currentBatch: progress.currentBatch,
            processedCount: progress.imported + progress.failed,
            totalFeatures: progress.total,
            collectionId: progress.collectionId,
            layerId: progress.layerId,
            memoryUsage,
            batchSize: newBatchSize
          };

          // Check if we need to pause due to memory usage
          if (
            this.config.pauseOnMemoryThreshold &&
            memoryUsage > this.config.batchProcessing.maxMemoryUsage
          ) {
            logger.warn('Pausing import due to high memory usage', {
              importId,
              memoryUsage,
              threshold: this.config.batchProcessing.maxMemoryUsage
            });
            await this.pauseImport(importId);
          }

          await this.metricsAdapter.trackImportProgress(progress);
          
          if (params.onProgress) {
            await params.onProgress(progress);
          }
        } catch (progressError) {
          logger.error('Error in progress handler', {
            error: progressError instanceof Error ? progressError.message : String(progressError),
            importId,
            currentBatch: progress.currentBatch
          });
        }
      };

      // Create a simplified set of parameters with wrapped handlers
      const streamParams = {
        ...params,
        batchSize: currentState.batchSize,
        targetSrid: params.targetSrid || this.config.defaultTargetSrid,
        signal: controller.signal,
        onProgress: wrappedOnProgress,
        onComplete: wrappedOnComplete,
        onError: wrappedOnError
      };

      try {
        return await this.importAdapter.streamFeatures(streamParams);
      } catch (error) {
        // Log the raw error
        logger.error('Stream setup failed', { 
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          importId
        });
        
        // Cleanup resources
        clearInterval(checkpointInterval);
        this.activeImports.delete(importId);
        
        // Report error to metrics
        await this.metricsAdapter.trackImportError(
          error instanceof Error ? error : new Error(String(error))
        );
        
        // Pass the error through without complex transformations
        throw error;
      }
    } catch (error) {
      // Log the error
      logger.error('Import setup failed', {
        error: error instanceof Error ? error.message : String(error),
        importId
      });
      
      this.activeImports.delete(importId);
      await this.metricsAdapter.trackImportError(
        error instanceof Error ? error : new Error(String(error))
      );
      
      // Pass the error through without complex transformations
      throw error;
    }
  }

  async pauseImport(importId: string): Promise<void> {
    const importData = this.activeImports.get(importId);
    if (!importData) {
      throw new Error(`No active import found with ID ${importId}`);
    }

    const updatedState: ImportState = {
      ...importData.state,
      paused: true
    };

    await this.storageAdapter.saveCheckpoint(importId, updatedState);
    this.activeImports.set(importId, {
      ...importData,
      state: updatedState
    });
  }

  async resumeImport(importId: string): Promise<void> {
    const importData = this.activeImports.get(importId);
    if (!importData) {
      throw new Error(`No active import found with ID ${importId}`);
    }

    const updatedState: ImportState = {
      ...importData.state,
      paused: false
    };

    await this.storageAdapter.saveCheckpoint(importId, updatedState);
    this.activeImports.set(importId, {
      ...importData,
      state: updatedState
    });
  }

  async cancelImport(importId: string): Promise<void> {
    const importData = this.activeImports.get(importId);
    if (importData) {
      importData.controller?.abort();
      this.activeImports.delete(importId);
      await this.storageAdapter.clearCheckpoint(importId);
      logger.info('Import cancelled', { importId });
    }
  }
} 