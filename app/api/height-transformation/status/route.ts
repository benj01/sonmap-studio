import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { LogManager } from '@/core/logging/log-manager';

const SOURCE = 'api/height-transformation/status';
const logManager = LogManager.getInstance();

/**
 * Retrieves the status of a height transformation process for a layer
 * GET /api/height-transformation/status?layerId={layerId}
 */
export async function GET(req: NextRequest) {
  const logger = {
    info: (message: string, data?: any) => logManager.info(SOURCE, message, data),
    error: (message: string, error?: any) => logManager.error(SOURCE, message, error),
    debug: (message: string, data?: any) => logManager.debug(SOURCE, message, data)
  };

  try {
    // Get the layerId from query parameters
    const searchParams = req.nextUrl.searchParams;
    const layerId = searchParams.get('layerId');

    logger.debug('Retrieving height transformation status', { layerId });

    // Validate required parameters
    if (!layerId) {
      return NextResponse.json(
        { error: 'Missing required parameter: layerId' },
        { status: 400 }
      );
    }

    // Create Supabase client
    const supabase = createRouteHandlerClient({ cookies });

    // Call the get_height_transformation_status function
    const { data, error } = await supabase.rpc('get_height_transformation_status', {
      p_layer_id: layerId
    });

    if (error) {
      logger.error('Failed to retrieve height transformation status', { error, layerId });
      return NextResponse.json(
        { error: error.message || 'Failed to retrieve height transformation status' },
        { status: 500 }
      );
    }

    logger.info('Height transformation status retrieved successfully', { layerId });
    
    return NextResponse.json(data);
  } catch (error) {
    logger.error('Unexpected error retrieving height transformation status', error);
    return NextResponse.json(
      { error: 'Unexpected error retrieving height transformation status' },
      { status: 500 }
    );
  }
} 