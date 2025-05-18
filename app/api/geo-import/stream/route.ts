import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { dbLogger } from '@/utils/logging/dbLogger';
import { v4 as uuidv4 } from 'uuid';

// Environment variables for Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Check if we have the required environment variables
if (!supabaseUrl || !supabaseServiceKey) {
  await dbLogger.error('Missing Supabase environment variables', undefined, { source: 'GeoImportStreamRoute' });
}

export async function POST(request: NextRequest) {
  const requestId = uuidv4();
  let userId: string | undefined = undefined;
  try {
    // Get the authorization header from the request for user verification
    const authHeader = request.headers.get('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      await dbLogger.error('Missing or invalid Authorization header', { requestId }, { source: 'GeoImportStreamRoute' });
      return NextResponse.json(
        { error: 'Missing or invalid Authorization header' },
        { status: 401 }
      );
    }
    
    const token = authHeader.replace('Bearer ', '');
    
    // Create a service role client for database operations
    // This bypasses RLS but requires the service role key
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
      },
    });
    
    // Verify the user token
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      await dbLogger.error('Authentication error', { requestId, error: userError }, { source: 'GeoImportStreamRoute' });
      return NextResponse.json(
        { error: 'Authentication error', details: userError },
        { status: 401 }
      );
    }
    
    userId = user.id;
    await dbLogger.info('Authenticated user', { requestId, userId }, { source: 'GeoImportStreamRoute' });
    
    // Parse request body
    let requestBody;
    try {
      requestBody = await request.json();
    } catch (jsonError) {
      await dbLogger.error('Invalid JSON in request body', { requestId, userId, error: jsonError }, { source: 'GeoImportStreamRoute' });
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }
    
    const { 
      projectFileId, 
      collectionName, 
      features, 
      sourceSrid, 
      targetSrid,
      batchSize
    } = requestBody;
    
    // Validate required parameters
    if (!projectFileId || !features || !Array.isArray(features) || !collectionName) {
      await dbLogger.warn('Missing required parameters', { requestId, userId, projectFileId, collectionName }, { source: 'GeoImportStreamRoute' });
      return NextResponse.json(
        {
          error: 'Missing required parameters',
          details: {
            hasProjectFileId: !!projectFileId,
            hasFeatures: !!features,
            isFeaturesArray: Array.isArray(features),
            hasCollectionName: !!collectionName
          }
        },
        { status: 400 }
      );
    }
    
    // Create import log
    const { data: importLog, error: logError } = await supabase
      .from('realtime_import_logs')
      .insert({
        project_file_id: projectFileId,
        status: 'started',
        total_features: features.length,
        imported_count: 0,
        failed_count: 0
      })
      .select()
      .single();
      
    if (logError) {
      await dbLogger.error('Failed to create import log', { requestId, userId, error: logError, projectFileId }, { source: 'GeoImportStreamRoute' });
      return NextResponse.json(
        { error: 'Failed to create import log', details: logError },
        { status: 500 }
      );
    }
    
    await dbLogger.info('Starting import', {
      requestId,
      userId,
      importLogId: importLog.id,
      featureCount: features.length,
      batchSize
    }, { source: 'GeoImportStreamRoute' });
    
    // Call the same RPC function used by test import
    const { data, error } = await supabase.rpc(
      'import_geo_features_with_transform',
      {
        p_project_file_id: projectFileId,
        p_collection_name: collectionName,
        p_features: features,
        p_source_srid: sourceSrid,
        p_target_srid: targetSrid,
        p_batch_size: batchSize || 1000
      }
    );
    
    if (error) {
      await dbLogger.error('Import failed', { requestId, userId, error, importLogId: importLog.id }, { source: 'GeoImportStreamRoute' });
      
      // Update import log with error
      await supabase
        .from('realtime_import_logs')
        .update({
          status: 'failed',
          metadata: { 
            error: error.message,
            details: error.details,
            timestamp: new Date().toISOString()
          }
        })
        .eq('id', importLog.id);
        
      return NextResponse.json(
        { error: 'Import failed', details: error },
        { status: 500 }
      );
    }
    
    if (!data || !Array.isArray(data) || data.length === 0) {
      await dbLogger.error('No results returned from import function', { requestId, userId, importLogId: importLog.id }, { source: 'GeoImportStreamRoute' });
      
      // Update import log with error
      await supabase
        .from('realtime_import_logs')
        .update({
          status: 'failed',
          metadata: { 
            error: 'No results returned from import function',
            timestamp: new Date().toISOString()
          }
        })
        .eq('id', importLog.id);
        
      return NextResponse.json(
        { error: 'No results returned from import function' },
        { status: 500 }
      );
    }
    
    const result = data[0];
    await dbLogger.info('Import successful', {
      requestId,
      userId,
      importLogId: importLog.id,
      importedCount: result.imported_count,
      failedCount: result.failed_count,
      collectionId: result.collection_id,
      layerId: result.layer_id
    }, { source: 'GeoImportStreamRoute' });
    
    // Update import log with success
    await supabase
      .from('realtime_import_logs')
      .update({
        status: 'completed',
        imported_count: result.imported_count,
        failed_count: result.failed_count,
        collection_id: result.collection_id,
        layer_id: result.layer_id,
        metadata: { debug_info: result.debug_info }
      })
      .eq('id', importLog.id);
    
    // Update project_files table to mark the file as imported and add import metadata
    const importMetadata = {
      collection_id: result.collection_id,
      layer_id: result.layer_id,
      imported_count: result.imported_count,
      failed_count: result.failed_count,
      imported_at: new Date().toISOString()
    };
    
    const { error: updateError } = await supabase
      .from('project_files')
      .update({
        is_imported: true,
        import_metadata: importMetadata
      })
      .eq('id', projectFileId);
    
    if (updateError) {
      await dbLogger.warn('Failed to update project_files record', {
        requestId,
        userId,
        error: updateError,
        projectFileId
      }, { source: 'GeoImportStreamRoute' });
      // Continue anyway as the import was successful
    } else {
      await dbLogger.info('Updated project_files record', {
        requestId,
        userId,
        projectFileId,
        is_imported: true,
        import_metadata: importMetadata
      }, { source: 'GeoImportStreamRoute' });
    }
    
    return NextResponse.json({
      success: true,
      importLogId: importLog.id,
      result: {
        collection_id: result.collection_id,
        layer_id: result.layer_id,
        imported_count: result.imported_count,
        failed_count: result.failed_count,
        debug_info: result.debug_info
      }
    });
    
  } catch (error) {
    await dbLogger.error('Unhandled import error', {
      requestId,
      userId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, { source: 'GeoImportStreamRoute' });
    
    return NextResponse.json(
      { 
        error: 'Import process failed', 
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}