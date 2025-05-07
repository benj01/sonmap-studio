import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { dbLogger } from '@/utils/logging/dbLogger';
import { v4 as uuidv4 } from 'uuid';
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';

const SOURCE = 'api/height-transformation/update-feature';

interface UpdateFeatureHeightResponse {
  success: boolean;
  featureId: string;
  data: unknown;
}

export async function POST(req: NextRequest) {
  const requestId = uuidv4();
  let featureId: string | undefined = undefined;
  let batchId: string | undefined = undefined;
  try {
    const requestBody = await req.json();
    featureId = requestBody.featureId;
    batchId = requestBody.batchId;
    const transformedData = requestBody.transformedData;
    
    // Validate required parameters
    if (!featureId) {
      await dbLogger.warn('Missing required parameter: featureId', { SOURCE, requestId });
      return NextResponse.json(
        { error: 'Missing required parameter: featureId' },
        { status: 400 }
      );
    }
    
    if (!transformedData) {
      await dbLogger.warn('Missing required parameter: transformedData', { SOURCE, requestId, featureId });
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
    
    await dbLogger.info('Updating feature with transformed height data', { 
      SOURCE,
      requestId,
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
    const { data, error }: { data: unknown; error: PostgrestError | null } = await supabase.rpc(
      'update_feature_height_bypass_rls',
      { 
        p_feature_id: featureId,
        p_base_elevation_ellipsoidal: base_elevation_ellipsoidal,
        p_height_mode: height_mode,
        p_batch_id: batchId
      }
    );

    if (error) {
      await dbLogger.error('Failed to update feature with bypass function', { 
        SOURCE,
        requestId,
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
        await updateBatchProgress(supabase, batchId, featureId, requestId);
      } catch (batchError) {
        await dbLogger.warn('Failed to update batch progress', {
          SOURCE,
          requestId,
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
    } as UpdateFeatureHeightResponse);
  } catch (error) {
    await dbLogger.error('Error in height transformation update', { SOURCE, requestId, error, featureId, batchId });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function updateBatchProgress(
  supabase: SupabaseClient,
  batchId: string,
  featureId: string,
  requestId: string
) {
  try {
    // Get current counts
    const { data: batchData, error: batchError }: { data: { processed_features: number; failed_features: number; total_features: number } | null; error: PostgrestError | null } = await supabase
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
      
      await dbLogger.info('Updated batch progress', { 
        SOURCE,
        requestId,
        batchId, 
        processedFeatures, 
        totalFeatures: batchData.total_features,
        isComplete
      });
    } else {
      await dbLogger.warn('Failed to update batch progress', { SOURCE, requestId, error: batchError, batchId });
    }
  } catch (error) {
    await dbLogger.error('Error updating batch progress', { SOURCE, requestId, error, batchId, featureId });
  }
} 