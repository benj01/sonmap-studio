import { ImportService } from '../import-service';
import { SupabaseImportAdapter } from './supabase-import-adapter';
import { SupabaseStorageAdapter } from './supabase-storage-adapter';
import { SupabaseMetricsAdapter } from './supabase-metrics-adapter';
import { createClient } from '@/utils/supabase/client';
import { dbLogger } from '@/utils/logging/dbLogger';
import { ImportProgress, ImportResult } from '../types/index';
import { GeoFeature } from '@/types/geo';

export async function createImportService(): Promise<ImportService> {
  const supabase = createClient();
  return new ImportService(
    new SupabaseImportAdapter(supabase),
    new SupabaseStorageAdapter(supabase),
    new SupabaseMetricsAdapter(supabase),
    {
      defaultBatchSize: 100,
      defaultTargetSrid: 2056,
      maxRetries: 3,
      retryDelay: 1000,
      checkpointInterval: 5000
    }
  );
}

export async function processImportStream(
  projectFileId: string,
  collectionName: string,
  features: GeoFeature[],
  sourceSrid: number = 2056,
  batchSize: number = 100,
  importLogId?: string
): Promise<ReadableStream> {
  const importService = await createImportService();
  const supabase = createClient();
  let importLog;

  if (importLogId) {
    const { data, error: getError } = await supabase
      .from('realtime_import_logs')
      .select()
      .eq('id', importLogId)
      .single();

    if (getError) {
      await dbLogger.error('Failed to get import log', { error: getError }, { source: 'LegacyStreamAdapter', importLogId, projectFileId, collectionName });
      throw new Error('Failed to get import log');
    }
    importLog = data;
  } else {
    const { data, error: createError } = await supabase
      .from('realtime_import_logs')
      .insert({
        project_file_id: projectFileId,
        status: 'processing',
        total_features: features.length,
        imported_count: 0,
        failed_count: 0
      })
      .select()
      .single();

    if (createError) {
      await dbLogger.error('Failed to create import log', { error: createError }, { source: 'LegacyStreamAdapter', projectFileId, collectionName });
      throw new Error('Failed to create import log');
    }
    importLog = data;
  }

  await dbLogger.info('Import log ready', {}, { source: 'LegacyStreamAdapter', importLogId: importLog?.id, projectFileId, collectionName });

  // Use the new service layer for streaming
  return await importService.streamFeatures({
    projectFileId,
    collectionName,
    features,
    sourceSrid,
    batchSize,
    onProgress: async (progress: ImportProgress) => {
      try {
        await supabase
          .from('realtime_import_logs')
          .update({
            imported_count: progress.imported,
            failed_count: progress.failed,
            status: 'processing',
            metadata: {
              current_batch: progress.currentBatch,
              total_batches: progress.totalBatches,
              collection_id: progress.collectionId,
              layer_id: progress.layerId,
              debug_info: progress.debugInfo
            }
          })
          .eq('id', importLog.id);
        await dbLogger.info('Import progress updated', { progress }, { source: 'LegacyStreamAdapter', importLogId: importLog.id, projectFileId, collectionName });
      } catch (error) {
        await dbLogger.error('Failed to update import progress', { error }, { source: 'LegacyStreamAdapter', importLogId: importLog.id, projectFileId, collectionName });
      }
    },
    onComplete: async (result: ImportResult) => {
      try {
        await supabase
          .from('realtime_import_logs')
          .update({
            imported_count: result.importedCount,
            failed_count: result.failedCount,
            status: 'completed',
            metadata: {
              collection_id: result.collectionId,
              layer_id: result.layerId,
              debug_info: result.debugInfo
            }
          })
          .eq('id', importLog.id);
        await dbLogger.info('Import completed', { result }, { source: 'LegacyStreamAdapter', importLogId: importLog.id, projectFileId, collectionName });
      } catch (error) {
        await dbLogger.error('Failed to update import completion', { error }, { source: 'LegacyStreamAdapter', importLogId: importLog.id, projectFileId, collectionName });
      }
    },
    onError: async (error: Error) => {
      try {
        await supabase
          .from('realtime_import_logs')
          .update({
            status: 'failed',
            metadata: {
              error: error.message,
              stack: error.stack
            }
          })
          .eq('id', importLog.id);
        await dbLogger.error('Import failed', { error }, { source: 'LegacyStreamAdapter', importLogId: importLog.id, projectFileId, collectionName });
      } catch (err) {
        await dbLogger.error('Failed to update import error', { error: err }, { source: 'LegacyStreamAdapter', importLogId: importLog.id, projectFileId, collectionName });
      }
    }
  });
} 