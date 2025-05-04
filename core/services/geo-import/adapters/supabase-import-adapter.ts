import { SupabaseClient } from '@supabase/supabase-js';
import { dbLogger } from '@/utils/logging/dbLogger';
import {
  ImportAdapter,
  ImportParams,
  ImportResult,
  StreamParams,
  ImportProgress
} from '../types/index';

const SOURCE = 'SupabaseImportAdapter';

export class SupabaseImportAdapter implements ImportAdapter {
  constructor(private supabase: SupabaseClient) {}

  private getImportId(params: ImportParams): string {
    return `${params.projectFileId}-${Date.now()}`;
  }

  async importFeatures(params: ImportParams): Promise<ImportResult> {
    const importId = this.getImportId(params);
    try {
      const { data: result, error } = await this.supabase.rpc(
        'import_geo_features_with_transform',
        {
          p_project_file_id: params.projectFileId,
          p_collection_name: params.collectionName,
          p_features: params.features,
          p_source_srid: params.sourceSrid,
          p_target_srid: params.targetSrid,
          p_batch_size: params.batchSize
        }
      );

      if (error) {
        await dbLogger.error('Import RPC failed', { error }, { importId, params });
        throw error;
      }

      if (!result || !Array.isArray(result) || result.length === 0) {
        await dbLogger.error('No results returned from import function', {}, { importId, params });
        throw new Error('No results returned from import function');
      }

      // Aggregate results from all batches
      const aggregatedResult: ImportResult = {
        importId,
        importedCount: 0,
        failedCount: 0,
        debugInfo: {
          repairedCount: 0,
          cleanedCount: 0,
          skippedCount: 0,
          repairSummary: {},
          skippedSummary: {},
          notices: []
        }
      };

      for (const batchResult of result) {
        aggregatedResult.importedCount += batchResult.imported_count || 0;
        aggregatedResult.failedCount += batchResult.failed_count || 0;
        if (!aggregatedResult.collectionId && batchResult.collection_id) {
          aggregatedResult.collectionId = batchResult.collection_id;
        }
        if (!aggregatedResult.layerId && batchResult.layer_id) {
          aggregatedResult.layerId = batchResult.layer_id;
        }
        if (batchResult.debug_info) {
          const debug = aggregatedResult.debugInfo!;
          debug.repairedCount += batchResult.debug_info.repaired_count || 0;
          debug.cleanedCount += batchResult.debug_info.cleaned_count || 0;
          debug.skippedCount += batchResult.debug_info.skipped_count || 0;
          if (batchResult.debug_info.repair_summary) {
            debug.repairSummary = {
              ...debug.repairSummary,
              ...batchResult.debug_info.repair_summary
            };
          }
          if (batchResult.debug_info.skipped_summary) {
            debug.skippedSummary = {
              ...debug.skippedSummary,
              ...batchResult.debug_info.skipped_summary
            };
          }
          if (batchResult.debug_info.notices) {
            debug.notices = debug.notices.concat(batchResult.debug_info.notices);
          }
        }
      }
      await dbLogger.info('Import completed', { aggregatedResult }, { importId, params });
      return aggregatedResult;
    } catch (error) {
      await dbLogger.error('Import failed', { error }, { importId, params });
      throw error;
    }
  }

  async streamFeatures(params: StreamParams): Promise<ReadableStream> {
    const importId = this.getImportId(params);
    const totalFeatures = params.features.length;
    const supabase = this.supabase;

    // Add validation and early error handling
    if (!params.projectFileId) {
      await dbLogger.error('Project file ID is required', {}, { importId, params });
      throw new Error(JSON.stringify({
        type: 'ValidationError',
        message: 'Project file ID is required',
        details: {
          phase: 'stream_setup',
          timestamp: new Date().toISOString()
        }
      }));
    }
    if (!params.collectionName) {
      await dbLogger.error('Collection name is required', {}, { importId, params });
      throw new Error(JSON.stringify({
        type: 'ValidationError',
        message: 'Collection name is required',
        details: {
          phase: 'stream_setup',
          timestamp: new Date().toISOString()
        }
      }));
    }
    if (!params.features || !Array.isArray(params.features) || params.features.length === 0) {
      await dbLogger.error('Features array is required and must not be empty', {}, { importId, params });
      throw new Error(JSON.stringify({
        type: 'ValidationError',
        message: 'Features array is required and must not be empty',
        details: {
          phase: 'stream_setup',
          timestamp: new Date().toISOString()
        }
      }));
    }
    if (!params.sourceSrid) {
      await dbLogger.error('Source SRID is required', {}, { importId, params });
      throw new Error(JSON.stringify({
        type: 'ValidationError',
        message: 'Source SRID is required',
        details: {
          phase: 'stream_setup',
          timestamp: new Date().toISOString()
        }
      }));
    }
    try {
      await dbLogger.debug('Setting up import stream', {
        importId,
        projectFileId: params.projectFileId,
        collectionName: params.collectionName,
        features: totalFeatures,
        sourceSrid: params.sourceSrid,
        targetSrid: params.targetSrid
      }, { importId, params });
      
      // Create the transform stream with improved error handling
      const stream = new TransformStream({
        async start(controller) {
          // Stream initialization code goes here if needed
          await dbLogger.debug('Stream started', { importId }, { importId });
        },
        async transform(chunk, controller) {
          try {
            // Make a single RPC call with all features
            const { data: result, error } = await supabase.rpc(
              'import_geo_features_with_transform',
              {
                p_project_file_id: params.projectFileId,
                p_collection_name: params.collectionName,
                p_features: params.features,
                p_source_srid: params.sourceSrid,
                p_target_srid: params.targetSrid,
                p_batch_size: params.batchSize || 1000 // Use provided batch size or default
              }
            );

            if (error) {
              await dbLogger.error('Import failed', { error }, {
                importId,
                error: error.message,
                details: error.details
              });
              throw error;
            }

            if (!result || !Array.isArray(result) || result.length === 0) {
              throw new Error('No results returned from import function');
            }

            // Aggregate results
            const aggregatedResult: ImportResult = {
              importId,
              importedCount: 0,
              failedCount: 0,
              debugInfo: {
                repairedCount: 0,
                cleanedCount: 0,
                skippedCount: 0,
                repairSummary: {},
                skippedSummary: {},
                notices: []
              }
            };

            for (const batchResult of result) {
              aggregatedResult.importedCount += batchResult.imported_count || 0;
              aggregatedResult.failedCount += batchResult.failed_count || 0;
              
              if (!aggregatedResult.collectionId && batchResult.collection_id) {
                aggregatedResult.collectionId = batchResult.collection_id;
              }
              if (!aggregatedResult.layerId && batchResult.layer_id) {
                aggregatedResult.layerId = batchResult.layer_id;
              }

              if (batchResult.debug_info) {
                const debug = aggregatedResult.debugInfo!;
                debug.repairedCount += batchResult.debug_info.repaired_count || 0;
                debug.cleanedCount += batchResult.debug_info.cleaned_count || 0;
                debug.skippedCount += batchResult.debug_info.skipped_count || 0;

                // Merge summaries
                if (batchResult.debug_info.repair_summary) {
                  debug.repairSummary = {
                    ...debug.repairSummary,
                    ...batchResult.debug_info.repair_summary
                  };
                }
                if (batchResult.debug_info.skipped_summary) {
                  debug.skippedSummary = {
                    ...debug.skippedSummary,
                    ...batchResult.debug_info.skipped_summary
                  };
                }

                // Collect notices
                if (batchResult.debug_info.notices) {
                  debug.notices = debug.notices.concat(batchResult.debug_info.notices);
                }
              }
            }

            // Send progress update
            const progress: ImportProgress = {
              importId,
              currentBatch: 1,
              totalBatches: 1,
              total: totalFeatures,
              imported: aggregatedResult.importedCount,
              failed: aggregatedResult.failedCount,
              collectionId: aggregatedResult.collectionId,
              layerId: aggregatedResult.layerId
            };

            controller.enqueue(progress);

            // Send final result
            controller.enqueue(aggregatedResult);
            controller.terminate();

          } catch (error) {
            await dbLogger.error('Stream processing failed', { error }, {
              importId,
              error: error instanceof Error ? error.message : String(error)
            });
            controller.error(error);
          }
        }
      });

      return stream.readable;
    } catch (error) {
      await dbLogger.error('Stream setup failed', { error }, {
        importId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
} 