import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { LogManager } from '@/core/logging/log-manager';

const SOURCE = 'StreamImportEndpoint';
const logManager = LogManager.getInstance();

const logger = {
  info: (message: string, data?: any) => {
    logManager.info(SOURCE, message, data);
  },
  error: (message: string, error?: any) => {
    logManager.error(SOURCE, message, error);
  }
};

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const body = await request.json();
    
    const { 
      fileId, 
      collectionName, 
      features, 
      sourceSrid, 
      batchIndex, 
      totalBatches 
    } = body;
    
    logger.info('Processing batch', { 
      batchIndex, 
      totalBatches, 
      featureCount: features.length 
    });
    
    // First batch - create collection and layer
    let collectionId, layerId;
    
    if (batchIndex === 0) {
      // Create collection
      const { data: collection, error: collectionError } = await supabase
        .from('feature_collections')
        .insert({ name: collectionName, project_file_id: fileId })
        .select()
        .single();
        
      if (collectionError) throw collectionError;
      collectionId = collection.id;
      
      // Create layer
      const { data: layer, error: layerError } = await supabase
        .from('layers')
        .insert({ name: collectionName, collection_id: collectionId, type: 'vector' })
        .select()
        .single();
        
      if (layerError) throw layerError;
      layerId = layer.id;
    } else {
      // Get existing collection and layer
      const { data: file, error: fileError } = await supabase
        .from('project_files')
        .select('feature_collections(id, layers(id))')
        .eq('id', fileId)
        .single();
        
      if (fileError) throw fileError;
      collectionId = file.feature_collections[0].id;
      layerId = file.feature_collections[0].layers[0].id;
    }
    
    // Process features in this batch
    let importedCount = 0;
    let failedCount = 0;
    
    for (const feature of features) {
      try {
        const { error: featureError } = await supabase.rpc('import_single_feature', {
          p_layer_id: layerId,
          p_geometry: feature.geometry,
          p_properties: feature.properties,
          p_source_srid: sourceSrid
        });
        
        if (featureError) {
          failedCount++;
          logger.error('Feature import error', featureError);
        } else {
          importedCount++;
        }
      } catch (error) {
        failedCount++;
        logger.error('Feature processing error', error);
      }
    }
    
    return NextResponse.json({
      success: true,
      batchIndex,
      totalBatches,
      importedCount,
      failedCount,
      collectionId,
      layerId
    });
    
  } catch (error) {
    logger.error('Batch import error', error);
    return NextResponse.json(
      { error: 'Import batch failed', details: (error as Error).message || 'Unknown error' },
      { status: 500 }
    );
  }
} 