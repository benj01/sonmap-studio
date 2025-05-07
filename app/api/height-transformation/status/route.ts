import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { dbLogger } from '@/utils/logging/dbLogger';
import { v4 as uuidv4 } from 'uuid';
import type { PostgrestError } from '@supabase/supabase-js';

const SOURCE = 'api/height-transformation/status';

interface HeightTransformationStatus {
  layer_id: string;
  latest_batch: {
    id: string;
    status: string;
    height_source_type: string;
    height_source_attribute: string | null;
    total_features: number;
    processed_features: number;
    failed_features: number;
    started_at: string | null;
    completed_at: string | null;
  } | null;
  feature_status: {
    total: number;
    pending: number;
    in_progress: number;
    complete: number;
    failed: number;
  };
}

/**
 * Retrieves the status of a height transformation process for a layer
 * GET /api/height-transformation/status?layerId={layerId}
 */
export async function GET(req: NextRequest) {
  const requestId = uuidv4();
  let layerId: string | null = null;
  try {
    // Get the layerId from query parameters
    const searchParams = req.nextUrl.searchParams;
    layerId = searchParams.get('layerId');

    await dbLogger.debug('Retrieving height transformation status', { SOURCE, layerId, requestId });

    // Validate required parameters
    if (!layerId) {
      await dbLogger.error('Missing required parameter: layerId', { SOURCE, requestId });
      return NextResponse.json(
        { error: 'Missing required parameter: layerId' },
        { status: 400 }
      );
    }

    // Create Supabase client
    const supabase = createRouteHandlerClient({ cookies });

    // Call the get_height_transformation_status function
    const { data, error }: { data: HeightTransformationStatus | null; error: PostgrestError | null } = await supabase.rpc('get_height_transformation_status', {
      p_layer_id: layerId
    });

    if (error) {
      await dbLogger.error('Failed to retrieve height transformation status', { SOURCE, error, layerId, requestId });
      return NextResponse.json(
        { error: error.message || 'Failed to retrieve height transformation status' },
        { status: 500 }
      );
    }

    await dbLogger.info('Height transformation status retrieved successfully', { SOURCE, layerId, requestId });
    return NextResponse.json(data);
  } catch (error) {
    await dbLogger.error('Unexpected error retrieving height transformation status', { SOURCE, error, layerId, requestId });
    return NextResponse.json(
      { error: 'Unexpected error retrieving height transformation status' },
      { status: 500 }
    );
  }
} 