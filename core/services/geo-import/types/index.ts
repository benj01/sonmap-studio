import { SupabaseClient } from '@supabase/supabase-js';
import { GeoFeature } from '@/types/geo';
import { ImportError } from '../utils/error-handler';

export interface ImportParams {
  projectFileId: string;
  collectionName: string;
  features: GeoFeature[];
  sourceSrid: number;
  batchSize?: number;
  targetSrid?: number;
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
  repairedCount: number;
  cleanedCount: number;
  skippedCount: number;
  repairSummary: Record<string, any>;
  skippedSummary: Record<string, any>;
  notices: ImportNotice[];
}

export interface ImportNotice {
  level: 'error' | 'warning' | 'info' | 'debug';
  message: string;
  details?: Record<string, any>;
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

export interface StreamParams extends ImportParams {
  signal?: AbortSignal;
  onProgress?: (progress: ImportProgress) => Promise<void>;
  onComplete?: (result: ImportResult) => Promise<void>;
  onError?: (error: Error) => Promise<void>;
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

export interface ImportAdapter {
  importFeatures(params: ImportParams): Promise<ImportResult>;
  streamFeatures(params: StreamParams): Promise<ReadableStream>;
}

export interface StorageAdapter {
  saveCheckpoint(importId: string, state: ImportState): Promise<void>;
  loadCheckpoint(importId: string): Promise<ImportState | null>;
  clearCheckpoint(importId: string): Promise<void>;
}

export interface MetricsAdapter {
  trackImportStart(params: ImportParams): Promise<void>;
  trackImportProgress(progress: ImportProgress): Promise<void>;
  trackImportComplete(result: ImportResult): Promise<void>;
  trackImportError(error: Error): Promise<void>;
}

export interface FeatureError {
  feature_index: number;
  error: string;
  error_state: string;
  invalid_reason?: string;
  geometry_type_after_repair?: string;
} 