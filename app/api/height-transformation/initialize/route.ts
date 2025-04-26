import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { LogManager } from '@/core/logging/log-manager';
import { v4 as uuidv4 } from 'uuid';

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
    const { layerId, heightSourceType, heightSourceAttribute, featureCollection } = body;

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
    
    // Log request details
    logger.info('Height transformation batch initialization request', {
      layerId,
      heightSourceType,
      heightSourceAttribute,
      hasFeatureCollection: !!featureCollection
    });

    // If featureCollection provided directly, use it instead of querying database
    if (featureCollection && featureCollection.features && featureCollection.features.length > 0) {
      logger.info('Using provided feature collection', { 
        featureCount: featureCollection.features.length 
      });
      
      // Generate a batch ID
      const batchId = uuidv4();
      
      // Create batch record
      try {
        // Insert batch record
        const { data: batchData, error: batchError } = await supabase
          .from('height_transformation_batches')
          .insert({
            id: batchId,
            layer_id: layerId,
            status: 'pending',
            height_source_type: heightSourceType,
            height_source_attribute: heightSourceAttribute,
            total_features: featureCollection.features.length,
            processed_features: 0,
            failed_features: 0
          })
          .select();
          
        if (batchError) {
          logger.error('Failed to create transformation batch', { 
            layerId, 
            error: batchError 
          });
          return NextResponse.json({ 
            error: 'Failed to create transformation batch' 
          }, { status: 500 });
        }
        
        logger.info('Transformation batch created successfully', { 
          layerId, 
          batchId,
          featureCount: featureCollection.features.length
        });
        
        return NextResponse.json({ 
          success: true, 
          batchId,
          featureCount: featureCollection.features.length
        });
      } catch (error) {
        logger.error('Error creating transformation batch with feature collection', { 
          layerId, 
          error 
        });
        return NextResponse.json({ 
          error: 'Internal server error' 
        }, { status: 500 });
      }
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