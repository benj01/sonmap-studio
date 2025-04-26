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
      height_mode,
      height_transformed,
      height_transformed_at
    } = transformedData;
    
    logger.info('Updating feature with transformed height data', { 
      featureId, 
      batchId,
      transformedData: {
        base_elevation_ellipsoidal, 
        height_mode,
        height_transformed,
        height_transformed_at
      }
    });
    
    // Create Supabase client
    const supabase = createRouteHandlerClient({ cookies });
    
    // Store original values for reference in case we need to rollback later
    const { data: originalFeature, error: getError } = await supabase
      .from('geo_features')
      .select('properties, height_mode, base_elevation_ellipsoidal')
      .eq('id', featureId)
      .single();
    
    if (getError) {
      logger.error('Failed to retrieve original feature data', { 
        error: getError, 
        featureId 
      });
      return NextResponse.json(
        { error: getError.message || 'Failed to retrieve original feature data' },
        { status: 500 }
      );
    }
    
    // Prepare original values to store for potential rollback
    const originalValues = {
      height_mode: originalFeature.height_mode,
      base_elevation_ellipsoidal: originalFeature.base_elevation_ellipsoidal,
      lv95_data: {
        easting: originalFeature.properties?.lv95_easting,
        northing: originalFeature.properties?.lv95_northing,
        height: originalFeature.properties?.lv95_height
      }
    };
    
    // Update the feature with transformed values
    let updateQuery = supabase
      .from('geo_features')
      .update({
        height_mode,
        base_elevation_ellipsoidal,
        height_transformation_status: 'complete',
        height_transformed_at: new Date().toISOString(),
        original_height_values: originalValues
      })
      .eq('id', featureId);
    
    // Add batch ID if provided
    if (batchId) {
      updateQuery = updateQuery.eq('height_transformation_batch_id', batchId);
    }
    
    const { error: updateError } = await updateQuery;
    
    if (updateError) {
      logger.error('Failed to update feature with transformed height', { 
        error: updateError, 
        featureId, 
        batchId 
      });
      return NextResponse.json(
        { error: updateError.message || 'Failed to update feature with transformed height' },
        { status: 500 }
      );
    }
    
    // If a batch ID is provided, update the batch progress
    if (batchId) {
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
    }
    
    logger.info('Feature updated successfully with transformed height', { 
      featureId, 
      height_mode, 
      base_elevation_ellipsoidal 
    });
    
    return NextResponse.json({
      success: true,
      featureId,
      updated: {
        height_mode,
        base_elevation_ellipsoidal
      }
    });
  } catch (error) {
    logger.error('Unexpected error updating feature height', error);
    return NextResponse.json(
      { error: 'Unexpected error updating feature height' },
      { status: 500 }
    );
  }
} 