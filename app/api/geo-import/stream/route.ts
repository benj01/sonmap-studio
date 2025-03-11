import { PostgrestError } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { LogManager } from '@/core/logging/log-manager';
import { createClient } from '@/utils/supabase/server';

const SOURCE = 'StreamImportEndpoint';
const logManager = LogManager.getInstance();

const logger = {
  info: (message: string, data?: any) => {
    logManager.info(SOURCE, message, data);
  },
  warn: (message: string, data?: any) => {
    logManager.warn(SOURCE, message, data);
  },
  error: (message: string, error?: any) => {
    logManager.error(SOURCE, message, error);
  },
  debug: (message: string, data?: any) => {
    logManager.debug(SOURCE, message, data);
  }
};

export async function POST(req: Request) {
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  // Helper function to write to stream
  const writeToStream = async (data: any) => {
    try {
      await writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
    } catch (e) {
      logger.error('Error writing to stream', e);
    }
  };

  // Helper function to close stream and return response
  const closeStreamAndReturn = async () => {
    try {
      await writer.close();
    } catch (e) {
      logger.error('Error closing stream', e);
    }
    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });
  };

  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { session }, error: authError } = await supabase.auth.getSession();
    if (authError || !session) {
      logger.error('Authentication failed', { error: authError });
      await writeToStream({ type: 'error', message: 'Authentication required' });
      return closeStreamAndReturn();
    }

    const body = await req.json();
    
    const { 
      fileId,
      importLogId,
      collectionName, 
      features, 
      sourceSrid,
      batchSize = 600
    } = body;

    // Calculate batches
    const totalFeatures = features.length;
    const totalBatches = Math.ceil(totalFeatures / batchSize);
    
    logger.info('Starting batch processing', {
      totalFeatures,
      totalBatches,
      batchSize,
      importLogId
    });

    let collectionId: string | undefined;
    let layerId: string | undefined;
    let totalImported = 0;
    let totalFailed = 0;
    let notices: any[] = [];
    let featureErrors: any[] = [];

    // Process each batch
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const start = batchIndex * batchSize;
      const end = Math.min(start + batchSize, totalFeatures);
      const batchFeatures = features.slice(start, end);

      logger.info('Processing batch', {
        batchIndex: batchIndex + 1,
        totalBatches,
        start,
        end,
        featureCount: batchFeatures.length
      });

      // Call our batch import function
      const { data: batchResults, error: batchError } = await supabase.rpc(
        'import_geo_features_with_transform',
        {
          p_project_file_id: fileId,
          p_collection_name: collectionName,
          p_features: batchFeatures,
          p_source_srid: sourceSrid,
          p_batch_size: batchFeatures.length
        }
      );

      // Handle batch error
      if (batchError) {
        logger.error('Batch import error', {
          error: batchError,
          batchIndex,
          start,
          end
        });

        // Update import log with error
        await supabase.from('realtime_import_logs')
          .update({
            status: 'failed',
            metadata: {
              error: batchError.message,
              details: {
                batchIndex,
                start,
                end
              }
            }
          })
          .eq('id', importLogId);

        await writeToStream({
          type: 'error',
          message: batchError.message,
          error: batchError
        });

        return await closeStreamAndReturn();
      }

      // Verify we have results
      if (!batchResults || !Array.isArray(batchResults) || batchResults.length === 0) {
        const error = 'No batch results returned';
        logger.error(error, {
          batchIndex,
          start,
          end,
          resultsReceived: batchResults
        });

        // Update import log with error
        await supabase.from('realtime_import_logs')
          .update({
            status: 'failed',
            metadata: {
              error,
              details: {
                batchIndex,
                start,
                end,
                resultsReceived: batchResults
              }
            }
          })
          .eq('id', importLogId);

        await writeToStream({
          type: 'error',
          message: error
        });

        return await closeStreamAndReturn();
      }

      // Process each result row from the batch
      for (const result of batchResults) {
        // Store collection and layer IDs from first successful result if not already set
        if (!collectionId && result.collection_id) {
          collectionId = result.collection_id;
        }
        if (!layerId && result.layer_id) {
          layerId = result.layer_id;
        }

        // Update running totals
        totalImported += result.imported_count;
        totalFailed += result.failed_count;

        // Collect notices if any
        if (result.debug_info?.notices) {
          notices = notices.concat(result.debug_info.notices);
        }

        // Collect feature errors if any
        if (result.debug_info?.feature_errors?.length > 0) {
          featureErrors = featureErrors.concat(result.debug_info.feature_errors);
        }

        // Update import log with progress
        await supabase.rpc('update_import_progress', {
          p_import_log_id: importLogId,
          p_imported_count: totalImported,
          p_failed_count: totalFailed,
          p_collection_id: collectionId,
          p_layer_id: layerId,
          p_metadata: {
            notices,
            featureErrors,
            debug_info: {
              repaired_count: result.debug_info?.repaired_count || 0,
              cleaned_count: result.debug_info?.cleaned_count || 0,
              skipped_count: result.debug_info?.skipped_count || 0,
              repair_summary: result.debug_info?.repair_summary,
              skipped_summary: result.debug_info?.skipped_summary
            }
          }
        });

        // Stream progress event
        await writeToStream({
          type: 'progress',
          importedCount: totalImported,
          failedCount: totalFailed,
          collectionId,
          layerId,
          notices,
          featureErrors
        });
      }

      // If this is the final batch, send the completion event
      if (batchIndex === totalBatches - 1) {
        logger.info('Import process completed', {
          totalFeatures,
          totalImported,
          totalFailed,
          expectedFeatureCount: features.length,
          collectionId,
          layerId
        });

        // Update import log with completion status
        await supabase.rpc('update_import_progress', {
          p_import_log_id: importLogId,
          p_imported_count: totalImported,
          p_failed_count: totalFailed,
          p_collection_id: collectionId,
          p_layer_id: layerId,
          p_metadata: {
            notices,
            featureErrors,
            completedAt: new Date().toISOString(),
            debug_info: {
              repaired_count: batchResults[0]?.debug_info?.repaired_count || 0,
              cleaned_count: batchResults[0]?.debug_info?.cleaned_count || 0,
              skipped_count: batchResults[0]?.debug_info?.skipped_count || 0,
              repair_summary: batchResults[0]?.debug_info?.repair_summary,
              skipped_summary: batchResults[0]?.debug_info?.skipped_summary
            }
          }
        });

        // Send completion event
        await writeToStream({
          type: 'complete',
          finalStats: {
            totalImported,
            totalFailed,
            collectionId,
            layerId
          },
          notices,
          featureErrors
        });
      }

      // Add a small delay between batches to allow for stream processing
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return await closeStreamAndReturn();

  } catch (error) {
    const supabase = await createClient();
    const requestBody = await req.clone().json().catch(() => ({}));
    
    const errorData = error instanceof Error 
      ? { message: error.message, stack: error.stack, name: error.name }
      : { message: String(error) };
    
    logger.error('Request error', errorData);

    // Update import log with error
    if (requestBody?.importLogId) {
      await supabase.from('realtime_import_logs')
        .update({
          status: 'failed',
          metadata: {
            error: errorData.message,
            stack: errorData.stack
          }
        })
        .eq('id', requestBody.importLogId);
    }

    await writeToStream({
      type: 'error',
      message: errorData.message || 'Import failed'
    });

    return await closeStreamAndReturn();
  }
} 