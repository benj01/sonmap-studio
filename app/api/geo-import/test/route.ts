import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { dbLogger } from '@/utils/logging/dbLogger';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { session }, error: authError } = await supabase.auth.getSession();
    if (authError || !session) {
      await dbLogger.error('Authentication failed', { error: authError });
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await req.json();
    const { projectId, layerName, geometry, properties, sourceSrid = 2056 } = body;

    await dbLogger.info('Testing import with single feature', {
      projectId,
      layerName,
      sourceSrid,
      geometry: JSON.stringify(geometry).substring(0, 100) + '...'
    });

    // Call the test import function
    const { data, error } = await supabase.rpc('import_geo_features_test', {
      p_project_id: projectId,
      p_layer_name: layerName,
      p_geometry: geometry,
      p_properties: properties || {},
      p_source_srid: sourceSrid,
      p_target_srid: 4326
    });

    if (error) {
      await dbLogger.error('Import test failed', { error });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await dbLogger.info('Import test successful', { layerId: data });
    return NextResponse.json({ success: true, layerId: data });

  } catch (error: unknown) {
    await dbLogger.error('Request error', {
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : 'Unknown error'
    });

    return NextResponse.json(
      { error: 'Import test failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 