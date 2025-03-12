import { LogManager } from '@/core/logging/log-manager';
import { createClient } from '@/utils/supabase/client';

const SOURCE = 'import-stream';
const logger = LogManager.getInstance();
const supabase = createClient();

export async function processImportStream(
  projectFileId: string,
  collectionName: string,
  features: any[],
  sourceSrid: number = 2056,
  batchSize: number = 100,
  importLogId?: string
): Promise<ReadableStream> {
  console.log("==== IMPORT-STREAM.TS EXECUTING ====");
  console.log("Import stream details:", {
    projectFileId,
    collectionName,
    totalFeatures: features.length,
    sourceSrid,
    batchSize,
    importLogId
  });

  let importLog;
  
  if (importLogId) {
    // Use existing import log
    const { data, error: getError } = await supabase
      .from('realtime_import_logs')
      .select()
      .eq('id', importLogId)
      .single();
      
    if (getError) {
      logger.error('Failed to get import log', SOURCE, {
        error: getError,
        importLogId
      });
      throw new Error('Failed to get import log');
    }
    
    importLog = data;
  } else {
    // Create a new import log entry
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
      logger.error('Failed to create import log', SOURCE, {
        error: createError,
        projectFileId,
        collectionName
      });
      throw new Error('Failed to create import log');
    }
    
    importLog = data;
  }

  // Calculate total batches
  const totalFeatures = features.length;
  const totalBatches = Math.ceil(totalFeatures / batchSize);
  let totalImported = 0;
  let totalFailed = 0;
  let collectionId: string | undefined;
  let layerId: string | undefined;
  let allNotices: any[] = [];
  let allDebugInfo = {
    repaired_count: 0,
    cleaned_count: 0,
    skipped_count: 0,
    repair_summary: {},
    skipped_summary: {}
  };

  logger.info('Starting batch import', SOURCE, {
    totalFeatures,
    totalBatches,
    batchSize,
    importLogId: importLog.id
  });

  // Create a transform stream to process the import
  const stream = new TransformStream({
    async transform(chunk, controller) {
      try {
        // Process each batch
        for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
          const start = batchIndex * batchSize;
          const end = Math.min(start + batchSize, totalFeatures);
          const batchFeatures = features.slice(start, end);

          logger.info('Processing batch', SOURCE, {
            batchIndex: batchIndex + 1,
            totalBatches,
            start,
            end,
            featureCount: batchFeatures.length
          });

          // Call the import function with just this batch
          const { data: result, error } = await supabase.rpc(
            'import_geo_features_with_transform',
            {
              p_project_file_id: projectFileId,
              p_collection_name: collectionName,
              p_features: batchFeatures,
              p_source_srid: sourceSrid,
              p_batch_size: batchFeatures.length
            }
          );

          if (error) {
            logger.error('Batch import failed', SOURCE, {
              error,
              batchIndex,
              start,
              end,
              details: error.details,
              hint: error.hint,
              code: error.code
            });

            // Update import log with error
            await supabase
              .from('realtime_import_logs')
              .update({
                status: 'failed',
                metadata: {
                  error: error.message,
                  details: error.details,
                  hint: error.hint,
                  code: error.code,
                  batchIndex,
                  start,
                  end
                }
              })
              .eq('id', importLog.id);

            controller.enqueue(
              `data: ${JSON.stringify({
                type: 'error',
                message: error.message || 'Import failed',
                details: error.details,
                hint: error.hint,
                code: error.code,
                batchIndex,
                start,
                end
              })}\n\n`
            );
            return;
          }

          if (!result || !Array.isArray(result) || result.length === 0) {
            const noResultError = new Error('No results returned from import function');
            logger.error('Batch import failed - no results', SOURCE, {
              batchIndex,
              start,
              end
            });

            // Update import log with error
            await supabase
              .from('realtime_import_logs')
              .update({
                status: 'failed',
                metadata: {
                  error: noResultError.message,
                  batchIndex,
                  start,
                  end
                }
              })
              .eq('id', importLog.id);

            controller.enqueue(
              `data: ${JSON.stringify({
                type: 'error',
                message: noResultError.message,
                batchIndex,
                start,
                end
              })}\n\n`
            );
            return;
          }

          // Process batch results
          for (const batchResult of result) {
            const {
              imported_count,
              failed_count,
              collection_id,
              layer_id,
              debug_info
            } = batchResult;

            // Update running totals
            totalImported += imported_count;
            totalFailed += failed_count;

            // Store collection and layer IDs from first successful result
            if (!collectionId && collection_id) {
              collectionId = collection_id;
            }
            if (!layerId && layer_id) {
              layerId = layer_id;
            }

            // Aggregate debug info
            if (debug_info) {
              allDebugInfo.repaired_count += debug_info.repaired_count || 0;
              allDebugInfo.cleaned_count += debug_info.cleaned_count || 0;
              allDebugInfo.skipped_count += debug_info.skipped_count || 0;

              // Merge repair and skip summaries
              if (debug_info.repair_summary) {
                allDebugInfo.repair_summary = {
                  ...allDebugInfo.repair_summary,
                  ...debug_info.repair_summary
                };
              }
              if (debug_info.skipped_summary) {
                allDebugInfo.skipped_summary = {
                  ...allDebugInfo.skipped_summary,
                  ...debug_info.skipped_summary
                };
              }

              // Collect notices
              if (debug_info.notices) {
                allNotices = allNotices.concat(debug_info.notices);
                // Log notices
                for (const notice of debug_info.notices) {
                  switch (notice.level) {
                    case 'error':
                      logger.error(notice.message, SOURCE, notice.details);
                      break;
                    case 'warning':
                      logger.warn(notice.message, SOURCE, notice.details);
                      break;
                    case 'info':
                      logger.info(notice.message, SOURCE, notice.details);
                      break;
                    case 'debug':
                      logger.debug(notice.message, SOURCE, notice.details);
                      break;
                  }
                }
              }
            }
          }

          // Update import log with progress
          await supabase
            .from('realtime_import_logs')
            .update({
              imported_count: totalImported,
              failed_count: totalFailed,
              collection_id: collectionId,
              layer_id: layerId,
              metadata: {
                current_batch: batchIndex + 1,
                total_batches: totalBatches,
                notices: allNotices,
                debug_info: allDebugInfo
              },
              status:
                batchIndex === totalBatches - 1
                  ? 'completed'
                  : 'processing'
            })
            .eq('id', importLog.id);

          // Send progress event
          controller.enqueue(
            `data: ${JSON.stringify({
              type: 'progress',
              imported: totalImported,
              failed: totalFailed,
              total: totalFeatures,
              collection_id: collectionId,
              layer_id: layerId,
              progress: {
                current_batch: batchIndex + 1,
                total_batches: totalBatches,
                features_processed: end,
                total_features: totalFeatures
              },
              debug_info: allDebugInfo
            })}\n\n`
          );

          // Add a small delay between batches
          if (batchIndex < totalBatches - 1) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }

        // Send complete event
        controller.enqueue(
          `data: ${JSON.stringify({
            type: 'complete',
            message: 'Import completed successfully',
            finalStats: {
              imported: totalImported,
              failed: totalFailed,
              total: totalFeatures,
              collection_id: collectionId,
              layer_id: layerId
            }
          })}\n\n`
        );
      } catch (error) {
        logger.error('Import stream error', SOURCE, {
          error,
          projectFileId,
          collectionName
        });

        // Update import log with error
        await supabase
          .from('realtime_import_logs')
          .update({
            status: 'failed',
            metadata: {
              error: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined
            }
          })
          .eq('id', importLog.id);

        controller.enqueue(
          `data: ${JSON.stringify({
            type: 'error',
            message: error instanceof Error ? error.message : 'Import failed'
          })}\n\n`
        );
      }
    }
  });

  return stream.readable;
} 