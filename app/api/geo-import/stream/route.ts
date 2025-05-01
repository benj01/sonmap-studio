import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createLogger } from '@/utils/logger';

const logger = createLogger('GeoImportAPI');

// Environment variables for Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Check if we have the required environment variables
if (!supabaseUrl || !supabaseServiceKey) {
  logger.error('Missing Supabase environment variables');
}

export async function POST(request: NextRequest) {
  try {
    // Get the authorization header from the request for user verification
    const authHeader = request.headers.get('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.error('Missing or invalid Authorization header');
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
      logger.error('Authentication error', { error: userError });
      return NextResponse.json(
        { error: 'Authentication error', details: userError },
        { status: 401 }
      );
    }
    
    logger.info('Authenticated user', { userId: user.id });
    
    // Parse request body
    let requestBody;
    try {
      requestBody = await request.json();
    } catch (jsonError) {
      logger.error('Invalid JSON in request body', { error: jsonError });
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
      logger.error('Failed to create import log', { error: logError });
      return NextResponse.json(
        { error: 'Failed to create import log', details: logError },
        { status: 500 }
      );
    }
    
    logger.info('Starting import', { 
      importLogId: importLog.id,
      featureCount: features.length,
      batchSize
    });
    
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
      logger.error('Import failed', { error, importLogId: importLog.id });
      
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
      logger.error('No results returned from import function', { importLogId: importLog.id });
      
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
    logger.info('Import successful', { 
      importLogId: importLog.id,
      importedCount: result.imported_count,
      failedCount: result.failed_count,
      collectionId: result.collection_id,
      layerId: result.layer_id
    });
    
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
      logger.warn('Failed to update project_files record', { 
        error: updateError, 
        projectFileId 
      });
      // Continue anyway as the import was successful
    } else {
      logger.info('Updated project_files record', { 
        projectFileId,
        is_imported: true,
        import_metadata: importMetadata
      });
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
    logger.error('Unhandled import error', { 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    
    return NextResponse.json(
      { 
        error: 'Import process failed', 
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}