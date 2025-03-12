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
  console.log("==== ROUTE.TS HANDLER EXECUTING ====");
  
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

  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { session }, error: authError } = await supabase.auth.getSession();
    if (authError || !session) {
      logger.error('Authentication failed', { error: authError });
      await writeToStream({ type: 'error', message: 'Authentication required' });
      writer.close();
      return new Response(stream.readable, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        }
      });
    }

    const body = await req.json();
    
    const { 
      fileId,
      importLogId,
      collectionName, 
      features, 
      sourceSrid,
      batchSize = 50
    } = body;

    logger.info('Starting import stream', {
      fileId,
      importLogId,
      collectionName,
      totalFeatures: features.length,
      sourceSrid,
      batchSize
    });

    // Get or create import log
    let importLog;
    if (importLogId) {
      const { data, error } = await supabase
        .from('realtime_import_logs')
        .select()
        .eq('id', importLogId)
        .single();
        
      if (error) {
        throw new Error(`Failed to get import log: ${error.message}`);
      }
      importLog = data;
    } else {
      const { data, error } = await supabase
        .from('realtime_import_logs')
        .insert({
          project_file_id: fileId,
          status: 'processing',
          total_features: features.length,
          imported_count: 0,
          failed_count: 0
        })
        .select()
        .single();
        
      if (error) {
        throw new Error(`Failed to create import log: ${error.message}`);
      }
      importLog = data;
    }

    // Calculate batches
    const totalFeatures = features.length;
    const totalBatches = Math.ceil(totalFeatures / batchSize);
    let totalImported = 0;
    let totalFailed = 0;
    let collectionId;
    let layerId;
    let allNotices = [];
    let allDebugInfo = {
      repaired_count: 0,
      cleaned_count: 0,
      skipped_count: 0,
      repair_summary: {},
      skipped_summary: {}
    };

    // Process each batch
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const start = batchIndex * batchSize;
      const end = Math.min(start + batchSize, totalFeatures);
      const batchFeatures = features.slice(start, end);

      logger.info(`Processing batch ${batchIndex + 1} of ${totalBatches}`, {
        batchIndex,
        start,
        end,
        featureCount: batchFeatures.length
      });

      // Call the import function
      const { data: result, error } = await supabase.rpc(
        'import_geo_features_with_transform',
        {
          p_project_file_id: fileId,
          p_collection_name: collectionName,
          p_features: batchFeatures,
          p_source_srid: sourceSrid,
          p_batch_size: batchFeatures.length
        }
      );

      if (error) {
        logger.error('Batch import failed', {
          error,
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
              error: error.message,
              details: error.details,
              batchIndex,
              start,
              end
            }
          })
          .eq('id', importLog.id);

        await writeToStream({
          type: 'error',
          message: error.message,
          details: error.details
        });
        
        writer.close();
        return new Response(stream.readable, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
          }
        });
      }

      if (!result || !Array.isArray(result) || result.length === 0) {
        const errorMsg = 'No results returned from import function';
        logger.error(errorMsg, {
          batchIndex,
          start,
          end
        });

        await supabase
          .from('realtime_import_logs')
          .update({
            status: 'failed',
            metadata: {
              error: errorMsg,
              batchIndex,
              start,
              end
            }
          })
          .eq('id', importLog.id);

        await writeToStream({
          type: 'error',
          message: errorMsg
        });
        
        writer.close();
        return new Response(stream.readable, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
          }
        });
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

        // Update totals
        totalImported += imported_count;
        totalFailed += failed_count;

        // Store IDs from first successful result
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

          // Handle summaries
          if (debug_info.repair_summary) {
            if (typeof debug_info.repair_summary === 'string') {
              allDebugInfo.repair_summary = debug_info.repair_summary;
            } else if (typeof debug_info.repair_summary === 'object') {
              allDebugInfo.repair_summary = {
                ...allDebugInfo.repair_summary,
                ...debug_info.repair_summary
              };
            }
          }

          if (debug_info.skipped_summary) {
            if (typeof debug_info.skipped_summary === 'string') {
              allDebugInfo.skipped_summary = debug_info.skipped_summary;
            } else if (typeof debug_info.skipped_summary === 'object') {
              allDebugInfo.skipped_summary = {
                ...allDebugInfo.skipped_summary,
                ...debug_info.skipped_summary
              };
            }
          }

          // Collect notices
          if (debug_info.notices) {
            allNotices = allNotices.concat(debug_info.notices);
          }
        }
      }

      // Update import log
      await supabase
        .from('realtime_import_logs')
        .update({
          imported_count: totalImported,
          failed_count: totalFailed,
          collection_id: collectionId,
          layer_id: layerId,
          metadata: {
            progress: {
              current_batch: batchIndex + 1,
              total_batches: totalBatches,
              features_processed: end,
              total_features: totalFeatures
            },
            notices: allNotices,
            debug_info: allDebugInfo
          },
          status: batchIndex === totalBatches - 1 ? 'completed' : 'processing'
        })
        .eq('id', importLog.id);

      // Send progress event
      await writeToStream({
        type: 'progress',
        importedCount: totalImported,
        failedCount: totalFailed,
        collectionId,
        layerId,
        progress: {
          currentBatch: batchIndex + 1,
          totalBatches,
          featuresProcessed: end,
          totalFeatures
        },
        debug_info: allDebugInfo
      });

      // Small delay between batches
      if (batchIndex < totalBatches - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Send completion event
    await writeToStream({
      type: 'complete',
      finalStats: {
        totalImported,
        totalFailed,
        collectionId,
        layerId
      }
    });

    writer.close();
    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });
  } catch (error) {
    logger.error('Import stream error', {
      error
    });

    await writeToStream({
      type: 'error',
      message: error instanceof Error ? error.message : 'Import failed'
    });

    writer.close();
    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });
  }
}