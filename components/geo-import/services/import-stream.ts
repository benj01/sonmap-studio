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
  batchSize: number = 100
): Promise<ReadableStream> {
  // Create a new import log entry
  const { data: importLog, error: createError } = await supabase
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

  // Create a transform stream to process the import
  const stream = new TransformStream({
    async transform(chunk, controller) {
      try {
        // Call the import function
        const { data: result, error } = await supabase.rpc(
          'import_geo_features_with_transform',
          {
            p_project_file_id: projectFileId,
            p_collection_name: collectionName,
            p_features: features,
            p_source_srid: sourceSrid,
            p_batch_size: batchSize
          }
        );

        if (error) {
          logger.error('Import failed', SOURCE, {
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
                error: error.message,
                stack: error.stack
              }
            })
            .eq('id', importLog.id);

          controller.enqueue(
            `data: ${JSON.stringify({
              type: 'error',
              message: error.message || 'Import failed'
            })}\n\n`
          );
          return;
        }

        // Process each batch result
        for (const batchResult of result) {
          const {
            imported_count,
            failed_count,
            collection_id,
            layer_id,
            debug_info
          } = batchResult;

          // Update import log with progress
          await supabase
            .from('realtime_import_logs')
            .update({
              imported_count,
              failed_count,
              collection_id,
              layer_id,
              metadata: debug_info,
              status:
                imported_count + failed_count >= features.length
                  ? 'completed'
                  : 'processing'
            })
            .eq('id', importLog.id);

          // Send progress event
          controller.enqueue(
            `data: ${JSON.stringify({
              type: 'progress',
              imported: imported_count,
              failed: failed_count,
              total: features.length,
              collection_id,
              layer_id,
              debug_info
            })}\n\n`
          );

          // Log notices from debug info
          if (debug_info?.notices) {
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

        // Send complete event
        controller.enqueue(
          `data: ${JSON.stringify({
            type: 'complete',
            message: 'Import completed successfully'
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