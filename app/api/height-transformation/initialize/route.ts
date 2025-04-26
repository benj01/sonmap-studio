import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { LogManager } from '@/core/logging/log-manager';

const SOURCE = 'api/height-transformation/initialize';
const logManager = LogManager.getInstance();

/**
 * Initializes a height transformation process for a layer
 * POST /api/height-transformation/initialize
 */
export async function POST(req: NextRequest) {
  const logger = {
    info: (message: string, data?: any) => logManager.info(SOURCE, message, data),
    error: (message: string, error?: any) => logManager.error(SOURCE, message, error),
    debug: (message: string, data?: any) => logManager.debug(SOURCE, message, data),
    warn: (message: string, data?: any) => logManager.warn(SOURCE, message, data)
  };

  try {
    // Parse request body
    const body = await req.json();
    const { layerId, heightSourceType, heightSourceAttribute } = body;

    logger.debug('Initializing height transformation', { layerId, heightSourceType, heightSourceAttribute });

    // Validate required parameters
    if (!layerId) {
      return NextResponse.json(
        { error: 'Missing required parameter: layerId' },
        { status: 400 }
      );
    }

    if (!heightSourceType || !['z_coord', 'attribute', 'none'].includes(heightSourceType)) {
      return NextResponse.json(
        { error: 'Invalid height source type. Must be one of: z_coord, attribute, none' },
        { status: 400 }
      );
    }

    // Attribute name is required if type is 'attribute'
    if (heightSourceType === 'attribute' && !heightSourceAttribute) {
      return NextResponse.json(
        { error: 'Height source attribute is required when type is "attribute"' },
        { status: 400 }
      );
    }

    // Create Supabase client
    const supabase = createRouteHandlerClient({ cookies });
    
    // Check if layer has features before initializing transformation
    const { count, error: countError } = await supabase
      .from('geo_features')
      .select('id', { count: 'exact', head: true })
      .eq('layer_id', layerId);
    
    if (countError) {
      logger.error('Failed to check feature count', { error: countError, layerId });
      return NextResponse.json(
        { error: countError.message || 'Failed to check feature count' },
        { status: 500 }
      );
    }
    
    if (count === 0) {
      // Run a more detailed query to check if the layer exists at all
      const { data: layerCheckData, error: layerCheckError } = await supabase
        .from('layers')
        .select('id, name')
        .eq('id', layerId)
        .maybeSingle();
        
      if (layerCheckError) {
        logger.error('Failed to check if layer exists', { error: layerCheckError, layerId });
      }
      
      // Try to query directly by SQL to see if there's any permissions issue
      const { data: directCheckData, error: directCheckError } = await supabase.rpc(
        'count_layer_features',
        { p_layer_id: layerId }
      );
      
      logger.warn('No features found in layer', { 
        layerId,
        layerExists: !!layerCheckData,
        layerName: layerCheckData?.name,
        directCheckCount: directCheckData || 0,
        directCheckError: directCheckError?.message
      });
      
      return NextResponse.json(
        { error: `No features found in layer ${layerId}` },
        { status: 404 }
      );
    }

    // Call the initialize_height_transformation function
    const { data, error } = await supabase.rpc('initialize_height_transformation', {
      p_layer_id: layerId,
      p_height_source_type: heightSourceType,
      p_height_source_attribute: heightSourceAttribute || null
    });

    if (error) {
      logger.error('Failed to initialize height transformation', { error, layerId });
      return NextResponse.json(
        { error: error.message || 'Failed to initialize height transformation' },
        { status: 500 }
      );
    }

    logger.info('Height transformation initialized successfully', { batchId: data, layerId });
    
    return NextResponse.json({
      success: true,
      batchId: data
    });
  } catch (error) {
    logger.error('Unexpected error initializing height transformation', error);
    return NextResponse.json(
      { error: 'Unexpected error initializing height transformation' },
      { status: 500 }
    );
  }
} 