import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { LogManager } from '@/core/logging/log-manager';

const SOURCE = 'api/height-transformation/update-feature';
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

export async function POST(req: NextRequest) {
  try {
    const requestBody = await req.json();
    const { featureId, batchId, transformedData } = requestBody;
    
    // Validate required parameters
    if (!featureId) {
      logger.warn('Missing required parameter: featureId');
      return NextResponse.json(
        { error: 'Missing required parameter: featureId' },
        { status: 400 }
      );
    }
    
    if (!transformedData) {
      logger.warn('Missing required parameter: transformedData');
      return NextResponse.json(
        { error: 'Missing required parameter: transformedData' },
        { status: 400 }
      );
    }
    
    // Extract transformed values
    const { 
      base_elevation_ellipsoidal, 
      height_mode
    } = transformedData;
    
    logger.info('Updating feature with transformed height data', { 
      featureId, 
      batchId,
      transformedData: {
        base_elevation_ellipsoidal, 
        height_mode
      }
    });
    
    // Create Supabase client
    const supabase = createRouteHandlerClient({ cookies });
    
    // Use the RLS bypass function directly
    const { data, error } = await supabase.rpc(
      'update_feature_height_bypass_rls',
      { 
        p_feature_id: featureId,
        p_base_elevation_ellipsoidal: base_elevation_ellipsoidal,
        p_height_mode: height_mode,
        p_batch_id: batchId
      }
    );

    if (error) {
      logger.error('Failed to update feature with bypass function', { 
        error,
        featureId,
        batchId
      });
      return NextResponse.json(
        { error: error.message || 'Failed to update feature height' },
        { status: 500 }
      );
    }

    // Update batch progress if batch ID is provided
    if (batchId) {
      try {
        await updateBatchProgress(supabase, batchId, featureId);
      } catch (batchError) {
        logger.warn('Failed to update batch progress', {
          error: batchError,
          batchId,
          featureId
        });
        // Don't fail the request if batch progress update fails
      }
    }

    return NextResponse.json({
      success: true,
      featureId,
      data
    });
  } catch (error) {
    logger.error('Error in height transformation update', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function getLayerIdFromBatchId(supabase: any, batchId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('height_transformation_batches')
      .select('layer_id')
      .eq('id', batchId)
      .single();
      
    if (error || !data) {
      return null;
    }
    
    return data.layer_id;
  } catch (error) {
    return null;
  }
}

async function updateBatchProgress(supabase: any, batchId: string, featureId: string) {
  try {
    // Get current counts
    const { data: batchData, error: batchError } = await supabase
      .from('height_transformation_batches')
      .select('processed_features, failed_features, total_features')
      .eq('id', batchId)
      .single();
    
    if (!batchError && batchData) {
      // Increment processed count
      const processedFeatures = (batchData.processed_features || 0) + 1;
      const isComplete = processedFeatures + (batchData.failed_features || 0) >= batchData.total_features;
      
      // Update batch progress
      await supabase.rpc('update_height_transformation_progress', {
        p_batch_id: batchId,
        p_processed: processedFeatures,
        p_failed: batchData.failed_features || 0
      });
      
      logger.info('Updated batch progress', { 
        batchId, 
        processedFeatures, 
        totalFeatures: batchData.total_features,
        isComplete
      });
    } else {
      logger.warn('Failed to update batch progress', { error: batchError, batchId });
    }
  } catch (error) {
    logger.error('Error updating batch progress', { error, batchId, featureId });
  }
} 