import { SupabaseClient } from '@supabase/supabase-js';
import { dbLogger } from '@/utils/logging/dbLogger';
import {
  MetricsAdapter,
  ImportParams,
  ImportProgress,
  ImportResult
} from '../types/index';

const SOURCE = 'SupabaseMetricsAdapter';
const METRICS_TABLE = 'import_metrics';

export class SupabaseMetricsAdapter implements MetricsAdapter {
  private importStartTimes: Map<string, number> = new Map();

  constructor(private supabase: SupabaseClient) {}

  private getImportId(params: ImportParams): string {
    return `${params.projectFileId}-${Date.now()}`;
  }

  async trackImportStart(params: ImportParams): Promise<void> {
    const importId = this.getImportId(params);
    this.importStartTimes.set(importId, Date.now());

    try {
      const { error } = await this.supabase
        .from(METRICS_TABLE)
        .insert({
          import_id: importId,
          project_file_id: params.projectFileId,
          collection_name: params.collectionName,
          total_features: params.features.length,
          source_srid: params.sourceSrid,
          target_srid: params.targetSrid,
          batch_size: params.batchSize,
          status: 'started',
          started_at: new Date().toISOString()
        });

      if (error) {
        await dbLogger.error('Failed to track import start', { error }, { importId, params });
        throw error;
      }
      await dbLogger.info('Import start tracked', {}, { importId, params });
    } catch (error) {
      await dbLogger.error('Import start tracking failed', { error }, { importId, params });
      throw error;
    }
  }

  async trackImportProgress(progress: ImportProgress): Promise<void> {
    try {
      const { error } = await this.supabase
        .from(METRICS_TABLE)
        .update({
          imported_count: progress.imported,
          failed_count: progress.failed,
          current_batch: progress.currentBatch,
          total_batches: progress.totalBatches,
          collection_id: progress.collectionId,
          layer_id: progress.layerId,
          debug_info: progress.debugInfo,
          status: 'in_progress',
          updated_at: new Date().toISOString()
        })
        .eq('import_id', progress.importId);

      if (error) {
        await dbLogger.error('Failed to track import progress', { error }, { progress });
        throw error;
      }
      await dbLogger.info('Import progress tracked', {}, { progress });
    } catch (error) {
      await dbLogger.error('Import progress tracking failed', { error }, { progress });
      throw error;
    }
  }

  async trackImportComplete(result: ImportResult): Promise<void> {
    try {
      const { error } = await this.supabase
        .from(METRICS_TABLE)
        .update({
          imported_count: result.importedCount,
          failed_count: result.failedCount,
          collection_id: result.collectionId,
          layer_id: result.layerId,
          debug_info: result.debugInfo,
          status: 'completed',
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - (this.importStartTimes.get(result.importId) || 0)
        })
        .eq('import_id', result.importId);

      if (error) {
        await dbLogger.error('Failed to track import completion', { error }, { result });
        throw error;
      }
      await dbLogger.info('Import completion tracked', {}, { result });
      // Clean up start time
      this.importStartTimes.delete(result.importId);
    } catch (error) {
      await dbLogger.error('Import completion tracking failed', { error }, { result });
      throw error;
    }
  }

  async trackImportError(error: Error): Promise<void> {
    try {
      const { error: dbError } = await this.supabase
        .from(METRICS_TABLE)
        .update({
          status: 'failed',
          error_message: error.message,
          error_stack: error.stack,
          failed_at: new Date().toISOString()
        })
        .eq('status', 'in_progress');

      if (dbError) {
        await dbLogger.error('Failed to track import error', { dbError }, { error });
        throw dbError;
      }
      await dbLogger.info('Import error tracked', {}, { error });
    } catch (err) {
      await dbLogger.error('Import error tracking failed', { error: err }, { error });
      throw err;
    }
  }
} 