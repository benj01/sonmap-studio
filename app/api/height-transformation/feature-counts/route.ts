import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { dbLogger } from '@/utils/logging/dbLogger';

/**
 * Gets feature counts by height mode for a layer
 * GET /api/height-transformation/feature-counts?layerId=uuid
 */
export async function GET(req: NextRequest) {
  try {
    // Get query parameters
    const url = new URL(req.url);
    const layerId = url.searchParams.get('layerId');
    await dbLogger.debug('Getting feature counts by height mode', { layerId });
    // Validate required parameters
    if (!layerId) {
      return NextResponse.json(
        { error: 'Missing required parameter: layerId' },
        { status: 400 }
      );
    }
    // Create Supabase client
    const supabase = createRouteHandlerClient({ cookies });
    // Check if layer exists
    const { data: layer, error: layerError } = await supabase
      .from('layers')
      .select('id, name')
      .eq('id', layerId)
      .maybeSingle();
    if (layerError) {
      await dbLogger.error('Failed to get layer', { error: layerError, layerId });
      return NextResponse.json(
        { error: layerError.message || 'Failed to get layer' },
        { status: 500 }
      );
    }
    if (!layer) {
      await dbLogger.warn('Layer not found', { layerId });
      return NextResponse.json(
        { error: `Layer with ID ${layerId} not found` },
        { status: 404 }
      );
    }
    // Get total feature count
    const { data: totalCount, error: totalCountError } = await supabase.rpc(
      'count_layer_features',
      { p_layer_id: layerId }
    );
    if (totalCountError) {
      await dbLogger.error('Failed to count features', { error: totalCountError, layerId });
      return NextResponse.json(
        { error: totalCountError.message || 'Failed to count features' },
        { status: 500 }
      );
    }
    // Get LV95 feature count
    const { data: lv95Count, error: lv95CountError } = await supabase.rpc(
      'count_lv95_features',
      { p_layer_id: layerId }
    );
    if (lv95CountError) {
      await dbLogger.error('Failed to count LV95 features', { error: lv95CountError, layerId });
      return NextResponse.json(
        { error: lv95CountError.message || 'Failed to count LV95 features' },
        { status: 500 }
      );
    }
    // Get counts for specific height modes
    const heightModes = ['absolute_ellipsoidal', 'relative_ellipsoidal', 'lv95_stored', 'none'];
    const heightModeCounts: Record<string, number> = {};
    for (const mode of heightModes) {
      const { data: count, error: countError } = await supabase.rpc(
        'count_features_by_height_mode',
        { 
          p_layer_id: layerId,
          p_height_mode: mode
        }
      );
      if (countError) {
        await dbLogger.warn('Failed to count features by height mode', { error: countError, heightMode: mode });
        heightModeCounts[mode] = -1; // Indicate error
      } else {
        heightModeCounts[mode] = count || 0;
      }
    }
    // Get counts by direct query (for redundancy and diagnostics)
    const { data: queryData, error: queryError } = await supabase
      .rpc('get_height_mode_distribution', { p_layer_id: layerId });
    if (queryError) {
      await dbLogger.warn('Failed to query features by height mode', { error: queryError });
    }
    const result = {
      layer_id: layerId,
      layer_name: layer.name,
      total_features: totalCount,
      lv95_stored_features: lv95Count,
      height_mode_counts: heightModeCounts,
      direct_query_results: queryData || []
    };
    await dbLogger.info('Feature counts retrieved successfully', { 
      layerId, 
      totalCount, 
      lv95Count
    });
    return NextResponse.json(result);
  } catch (error: unknown) {
    await dbLogger.error('Unexpected error getting feature counts', {
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : error
    });
    return NextResponse.json(
      { error: 'Unexpected error getting feature counts' },
      { status: 500 }
    );
  }
} 