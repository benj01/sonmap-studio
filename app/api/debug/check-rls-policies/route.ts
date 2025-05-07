import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { dbLogger } from '@/utils/logging/dbLogger';

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const featureId = searchParams.get('featureId');

  if (!featureId) {
    return NextResponse.json({ error: 'Feature ID is required' }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    
    // First check if feature exists
    const { data: featureData, error: featureError } = await supabase.rpc(
      'debug_check_feature_existence',
      { p_feature_id: featureId }
    );

    if (featureError) {
      await dbLogger.error('Error checking feature existence', { error: featureError, featureId });
      return NextResponse.json({ error: 'Error checking feature existence', details: featureError }, { status: 500 });
    }

    // Get RLS policies
    const { data: rlsData, error: rlsError } = await supabase.rpc('debug_rls_policies');

    if (rlsError) {
      await dbLogger.error('Error checking RLS policies', { error: rlsError, featureId });
      return NextResponse.json({ error: 'Error checking RLS policies', details: rlsError }, { status: 500 });
    }

    // Attempt test update
    const { data: testUpdateData, error: testUpdateError } = await supabase.rpc(
      'test_update_feature_height',
      { 
        p_feature_id: featureId,
        p_height_mode: 'ORTHOMETRIC', // Test value
        p_base_elevation_ellipsoidal: 100.0 // Test value
      }
    );

    if (testUpdateError) {
      await dbLogger.error('Error in test update', { error: testUpdateError, featureId });
    }

    // Compile all debug info
    const debugInfo = {
      feature: featureData,
      rlsPolicies: rlsData,
      testUpdate: testUpdateError ? { error: testUpdateError } : testUpdateData
    };

    await dbLogger.info('Debug info compiled', { featureId });
    
    return NextResponse.json(debugInfo);
  } catch (error) {
    await dbLogger.error('Unexpected error in RLS debug endpoint', { error, featureId });
    return NextResponse.json({ error: 'Unexpected error', details: error }, { status: 500 });
  }
} 