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

interface Notice {
  level: 'info' | 'warning' | 'error' | 'debug';
  message: string;
}

interface FeatureError {
  feature_index: number;
  error: string;
  error_state: string;
  invalid_reason?: string;
  geometry_type_after_repair?: string;
}

interface DebugInfo {
  repaired_count: number;
  cleaned_count: number;
  skipped_count: number;
  feature_errors: FeatureError[];
  notices: Notice[];
  repair_summary: string;
  skipped_summary: string;
}

interface BatchResult {
  collection_id: string;
  layer_id: string;
  imported_count: number;
  failed_count: number;
  debug_info: DebugInfo;
}

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
    const body = await req.json();
    
    const { 
      fileId, 
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
      batchSize
    });

    let collectionId: string | undefined;
    let layerId: string | undefined;
    let totalImported = 0;
    let totalFailed = 0;

    // Process each batch
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const start = batchIndex * batchSize;
      const end = Math.min(start + batchSize, totalFeatures);
      const batchFeatures = features.slice(start, end);

      logger.info(`Processing batch ${batchIndex + 1}/${totalBatches}`, {
        start,
        end,
        featureCount: batchFeatures.length,
        sampleFeature: {
          type: batchFeatures[0].type,
          geometry: {
            type: batchFeatures[0].geometry.type
          }
        }
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

      logger.info(`Batch ${batchIndex + 1} response:`, {
        hasError: !!batchError,
        errorMessage: batchError?.message,
        hasResults: !!batchResults,
        resultsLength: Array.isArray(batchResults) ? batchResults.length : 0
      });

      if (batchError) {
        logger.error('Batch import error', {
          error: batchError,
          batchIndex,
          start,
          end
        });

        await writeToStream({
          type: 'error',
          message: batchError.message,
          error: batchError
        });

        return await closeStreamAndReturn();
      }

      if (!batchResults || !Array.isArray(batchResults) || batchResults.length === 0) {
        logger.error('No batch results returned', {
          batchIndex,
          start,
          end,
          resultsReceived: batchResults
        });
        await writeToStream({
          type: 'error',
          message: 'No results returned from import function'
        });
        return await closeStreamAndReturn();
      }

      const batchResult = batchResults[0];
      logger.info(`Batch ${batchIndex + 1} result:`, {
        importedCount: batchResult.imported_count,
        failedCount: batchResult.failed_count,
        hasDebugInfo: !!batchResult.debug_info
      });

      // Store collection and layer IDs from first batch
      if (batchIndex === 0) {
        collectionId = batchResult.collection_id;
        layerId = batchResult.layer_id;
      }

      totalImported += batchResult.imported_count;
      totalFailed += batchResult.failed_count;

      // Stream notices and debug info
      if (batchResult.debug_info?.notices) {
        for (const notice of batchResult.debug_info.notices) {
          await writeToStream({
            type: 'notice',
            level: notice.level,
            message: notice.message
          });
        }
      }

      // Stream feature errors if any
      if (batchResult.debug_info?.feature_errors?.length > 0) {
        await writeToStream({
          type: 'feature_errors',
          errors: batchResult.debug_info.feature_errors
        });
      }

      // Stream batch completion
      await writeToStream({
        type: 'batch_complete',
        batchIndex,
        totalBatches,
        importedCount: batchResult.imported_count,
        failedCount: batchResult.failed_count,
        collectionId: batchResult.collection_id,
        layerId: batchResult.layer_id,
        debug_info: {
          repaired_count: batchResult.debug_info?.repaired_count || 0,
          cleaned_count: batchResult.debug_info?.cleaned_count || 0,
          skipped_count: batchResult.debug_info?.skipped_count || 0,
          repair_summary: batchResult.debug_info?.repair_summary,
          skipped_summary: batchResult.debug_info?.skipped_summary
        }
      });

      // Add a small delay between batches to prevent overwhelming the connection
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Send final completion message with actual counts
    await writeToStream({
      type: 'import_complete',
      totalBatches,
      finalStats: {
        totalImported,
        totalFailed,
        collectionId,
        layerId,
        actualFeatureCount: totalImported + totalFailed
      }
    });

    logger.info('Import completed', {
      totalFeatures,
      totalImported,
      totalFailed,
      actualFeatureCount: totalImported + totalFailed,
      expectedFeatureCount: features.length
    });

    return await closeStreamAndReturn();

  } catch (error) {
    logger.error('Request error', {
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : 'Unknown error'
    });

    await writeToStream({
      type: 'error',
      message: 'Import failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    return await closeStreamAndReturn();
  }
} 