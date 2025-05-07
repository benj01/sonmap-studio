import { GeoFeature } from '@/types/geo';

export interface BatchProcessingConfig {
  initialBatchSize: number;
  minBatchSize: number;
  maxBatchSize: number;
  batchSizeAdjustmentFactor: number;
  memoryThreshold: number;
  maxMemoryUsage: number;
}

export interface RetryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffFactor: number;
}

export interface ImportServiceConfig {
  defaultBatchSize: number;
  defaultTargetSrid: number;
  maxRetries: number;
  retryDelay: number;
  checkpointInterval: number;
  batchProcessing: BatchProcessingConfig;
  retry: RetryConfig;
  pauseOnMemoryThreshold: boolean;
  enableAutoResume: boolean;
}

export interface ImportState {
  currentBatch: number;
  processedCount: number;
  totalFeatures: number;
  collectionId?: string;
  layerId?: string;
  lastCheckpoint?: string;
  paused?: boolean;
  error?: string;
  memoryUsage?: number;
  batchSize?: number;
  retryCount?: number;
}

export interface ImportProgress {
  importId: string;
  imported: number;
  failed: number;
  total: number;
  currentBatch: number;
  totalBatches: number;
  collectionId?: string;
  layerId?: string;
  debugInfo?: ImportDebugInfo;
}

export interface ImportResult {
  importId: string;
  importedCount: number;
  failedCount: number;
  collectionId?: string;
  layerId?: string;
  debugInfo?: ImportDebugInfo;
}

export interface ImportDebugInfo {
  notices?: string[];
  warnings?: string[];
  errors?: string[];
  timing?: {
    start: number;
    end: number;
    duration: number;
  };
  memory?: {
    initial: number;
    peak: number;
    final: number;
  };
}

export interface ImportParams {
  projectFileId: string;
  collectionName: string;
  features: GeoFeature[];
  sourceSrid?: number;
  targetSrid?: number;
  batchSize?: number;
}

export interface StreamParams extends ImportParams {
  signal?: AbortSignal;
  onProgress?: (progress: ImportProgress) => Promise<void>;
  onComplete?: (result: ImportResult) => Promise<void>;
  onError?: (error: Error) => Promise<void>;
}

export interface ImportAdapter {
  importFeatures(params: ImportParams): Promise<ImportResult>;
  streamFeatures(params: StreamParams): Promise<ReadableStream>;
}

export interface StorageAdapter {
  saveCheckpoint(importId: string, state: ImportState): Promise<void>;
  getCheckpoint(importId: string): Promise<ImportState | null>;
  clearCheckpoint(importId: string): Promise<void>;
}

export interface MetricsAdapter {
  trackImportStart(params: ImportParams): Promise<void>;
  trackImportProgress(progress: ImportProgress): Promise<void>;
  trackImportComplete(result: ImportResult): Promise<void>;
  trackImportError(error: Error): Promise<void>;
} 