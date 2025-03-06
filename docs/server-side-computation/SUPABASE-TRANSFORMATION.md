Implementation Plan: Client to Server-Side Coordinate Transformation
Based on your codebase, I'll outline a comprehensive plan to move coordinate transformations from the client to the server side. This will solve your memory issues when importing large shapefiles with many features.
1. Create a Server-Side Transformation Function
First, let's create a PostgreSQL function that will handle coordinate transformations on the server:

-- Create a new PostgreSQL function for server-side coordinate transformation
CREATE OR REPLACE FUNCTION import_geo_features_with_transform(
  p_project_file_id UUID,
  p_collection_name TEXT,
  p_features JSONB,
  p_source_srid INTEGER DEFAULT 2056,
  p_batch_size INTEGER DEFAULT 100
)
RETURNS TABLE(
  collection_id UUID,
  layer_id UUID,
  imported_count INTEGER,
  failed_count INTEGER
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_collection_id UUID;
  v_layer_id UUID;
  v_imported_count INTEGER := 0;
  v_failed_count INTEGER := 0;
  v_feature JSONB;
  v_geometry GEOMETRY;
  v_batch_counter INTEGER := 0;
  v_total_features INTEGER;
BEGIN
  -- Get total feature count
  v_total_features := jsonb_array_length(p_features);
  
  -- Create collection and layer
  INSERT INTO feature_collections (name, project_file_id)
  VALUES (p_collection_name, p_project_file_id)
  RETURNING id INTO v_collection_id;
  
  INSERT INTO layers (name, collection_id, type)
  VALUES (p_collection_name, v_collection_id, 'vector')
  RETURNING id INTO v_layer_id;
  
  -- Process features in batches
  FOR v_feature IN SELECT jsonb_array_elements(p_features)
  LOOP
    BEGIN
      -- Let PostGIS handle the transformation
      v_geometry := ST_Transform(
        ST_SetSRID(
          ST_GeomFromGeoJSON(v_feature->'geometry'),
          p_source_srid
        ),
        4326  -- WGS84
      );
      
      -- Insert the feature
      INSERT INTO geo_features (
        geometry, 
        properties, 
        srid, 
        layer_id
      )
      VALUES (
        v_geometry,
        COALESCE(v_feature->'properties', '{}'::jsonb),
        4326,
        v_layer_id
      );
      
      v_imported_count := v_imported_count + 1;
      
      -- Commit every batch_size features to avoid long transactions
      v_batch_counter := v_batch_counter + 1;
      IF v_batch_counter >= p_batch_size THEN
        COMMIT;
        -- Start a new transaction
        BEGIN;
        v_batch_counter := 0;
      END IF;
      
    EXCEPTION WHEN OTHERS THEN
      -- Log error and continue with next feature
      RAISE NOTICE 'Error importing feature: %', SQLERRM;
      v_failed_count := v_failed_count + 1;
    END;
  END LOOP;
  
  -- Return results
  RETURN QUERY SELECT v_collection_id, v_layer_id, v_imported_count, v_failed_count;
END;
$$;

-- Set a longer timeout for this function
ALTER FUNCTION import_geo_features_with_transform(UUID, TEXT, JSONB, INTEGER, INTEGER) 
SET statement_timeout = '1800000';  -- 30 minutes

2. Modify the Shapefile Parser
Update your shapefile-parser.ts to skip client-side coordinate transformation:
// In shapefile-parser.ts
export class ShapefileParser extends BaseGeoDataParser {
  async parse(
    mainFile: ArrayBuffer,
    companionFiles?: Record<string, ArrayBuffer>,
    options?: ParserOptions,
    onProgress?: (event: ParserProgressEvent) => void
  ): Promise<FullDataset> {
    try {
      // ... existing code ...
      
      // Parse shapefile
      logger.info('Reading shapefile data...');
      const result = await read(mainFile, companionFiles['.dbf']);
      const geojson = result.features ? result : result.geojson;
      
      logger.info('Shapefile parsed', {
        featureCount: geojson.features.length
      });
      
      // Detect SRID but DON'T transform coordinates
      if (!this.srid && geojson.features.length > 0) {
        // ... existing SRID detection code ...
      }
      
      // Skip coordinate transformation, just convert to our format
      const features = geojson.features.map((feature, index) => ({
        id: index,
        geometry: feature.geometry,
        properties: feature.properties || {},
        originalIndex: index
      }));
      
      // Calculate metadata
      const featureCollection: FeatureCollection = {
        type: 'FeatureCollection',
        features: features.map(f => ({
          type: 'Feature',
          geometry: f.geometry,
          properties: f.properties
        }))
      };
      
      // For preview, we'll still transform a small subset
      let previewFeatures = features.slice(0, 100);
      if (this.srid !== undefined && this.srid !== 4326) {
        previewFeatures = await Promise.all(previewFeatures.map(async feature => ({
          ...feature,
          geometry: await transformGeometry(feature.geometry, this.srid!)
        })));
      }
      
      // ... rest of the code ...
      
      return {
        sourceFile: options?.filename || 'unknown.shp',
        fileType: 'shapefile',
        features,
        previewFeatures,
        metadata: {
          featureCount: features.length,
          bounds,
          geometryTypes: Array.from(geometryTypes) as any[],
          properties,
          srid: this.srid
        }
      };
    } catch (error) {
      // ... error handling ...
    }
  }
}

3. Update the Import Handler
Modify your handleImport function in geo-import-dialog.tsx:
const handleImport = async () => {
  if (!importSession?.fullDataset) {
    logger.error('No import session or dataset available');
    return;
  }

  try {
    setIsProcessing(true);
    logger.info('Starting import process', { 
      selectedCount: selectedFeatureIds.length,
      fileId: importSession.fileId,
      fileName: fileInfo?.name,
      metadata: importSession.fullDataset.metadata
    });
    
    // Show starting toast
    toast({
      title: 'Starting Import',
      description: `Importing ${selectedFeatureIds.length} features...`,
      duration: 3000,
    });
    
    // Filter the full dataset based on selected feature IDs
    const selectedFeatures = importSession.fullDataset.features.filter(f => 
      selectedFeatureIds.includes(f.originalIndex || f.id)
    );

    logger.debug('Selected features prepared', {
      count: selectedFeatures.length,
      firstFeature: selectedFeatures[0],
      srid: importSession.fullDataset.metadata?.srid || 2056
    });

    // Call our new server-side transformation function
    const supabase = createClient();
    const importParams = {
      p_project_file_id: importSession.fileId,
      p_collection_name: fileInfo?.name || 'Imported Features',
      p_features: JSON.stringify(selectedFeatures.map(f => ({
        type: 'Feature',
        geometry: f.geometry,
        properties: f.properties
      }))),
      p_source_srid: importSession.fullDataset.metadata?.srid || 2056,
      p_batch_size: 100
    };

    logger.debug('Calling import_geo_features_with_transform with params', {
      fileId: importParams.p_project_file_id,
      collectionName: importParams.p_collection_name,
      featureCount: selectedFeatures.length,
      sourceSrid: importParams.p_source_srid,
      sampleFeature: selectedFeatures[0]
    });

    const { data: importResults, error } = await supabase.rpc(
      'import_geo_features_with_transform', 
      importParams
    );

    // Rest of your existing code...
  } catch (error) {
    // Error handling...
  }
};

4. Create a Streaming Import API (Optional Enhancement)
For very large files, consider implementing a streaming approach:
// app/api/geo-import/stream/route.ts
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
      { error: 'Import batch failed', details: error.message },
      { status: 500 }
    );
  }
}

5. Create a Helper Function for Single Feature Import
-- Function to import a single feature
CREATE OR REPLACE FUNCTION import_single_feature(
  p_layer_id UUID,
  p_geometry JSONB,
  p_properties JSONB,
  p_source_srid INTEGER DEFAULT 2056
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_geometry GEOMETRY;
BEGIN
  -- Transform the geometry
  v_geometry := ST_Transform(
    ST_SetSRID(
      ST_GeomFromGeoJSON(p_geometry),
      p_source_srid
    ),
    4326  -- WGS84
  );
  
  -- Insert the feature
  INSERT INTO geo_features (
    geometry, 
    properties, 
    srid, 
    layer_id
  )
  VALUES (
    v_geometry,
    COALESCE(p_properties, '{}'::jsonb),
    4326,
    p_layer_id
  );
  
  RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
  RETURN FALSE;
END;
$$;

6. Implement Chunked Client-Side Processing
For very large files, implement a chunking strategy in your client code:
// Add this to your geo-import-dialog.tsx
const handleImportLargeFile = async () => {
  if (!importSession?.fullDataset) {
    logger.error('No import session or dataset available');
    return;
  }

  try {
    setIsProcessing(true);
    
    // Filter the full dataset based on selected feature IDs
    const selectedFeatures = importSession.fullDataset.features.filter(f => 
      selectedFeatureIds.includes(f.originalIndex || f.id)
    );
    
    // Show starting toast
    toast({
      title: 'Starting Import',
      description: `Importing ${selectedFeatures.length} features in batches...`,
      duration: 3000,
    });
    
    // Determine batch size based on feature count
    const BATCH_SIZE = selectedFeatures.length > 1000 ? 100 : 500;
    const totalBatches = Math.ceil(selectedFeatures.length / BATCH_SIZE);
    
    let totalImported = 0;
    let totalFailed = 0;
    let collectionId, layerId;
    
    // Process in batches
    for (let i = 0; i < totalBatches; i++) {
      const startIdx = i * BATCH_SIZE;
      const endIdx = Math.min(startIdx + BATCH_SIZE, selectedFeatures.length);
      const batchFeatures = selectedFeatures.slice(startIdx, endIdx);
      
      // Update progress
      setProgress(Math.round((i / totalBatches) * 100));
      setProgressMessage(`Processing batch ${i+1}/${totalBatches} (${batchFeatures.length} features)`);
      
      // Call the streaming API
      const response = await fetch('/api/geo-import/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileId: importSession.fileId,
          collectionName: fileInfo?.name || 'Imported Features',
          features: batchFeatures.map(f => ({
            type: 'Feature',
            geometry: f.geometry,
            properties: f.properties
          })),
          sourceSrid: importSession.fullDataset.metadata?.srid || 2056,
          batchIndex: i,
          totalBatches
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Batch ${i+1} failed: ${errorData.error}`);
      }
      
      const result = await response.json();
      totalImported += result.importedCount;
      totalFailed += result.failedCount;
      
      // Store collection and layer IDs from first batch
      if (i === 0) {
        collectionId = result.collectionId;
        layerId = result.layerId;
      }
      
      // Allow UI to update
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    // Final update
    setProgress(100);
    setProgressMessage('Import complete');
    
    // Update the project_files record
    const importMetadata = {
      collection_id: collectionId,
      layer_id: layerId,
      imported_count: totalImported,
      failed_count: totalFailed,
      imported_at: new Date().toISOString()
    };
    
    // Rest of your existing code to update metadata...
    
    toast({
      title: 'Import Complete',
      description: `Successfully imported ${totalImported} features (${totalFailed} failed)`,
      duration: 5000,
    });
    
    onOpenChange(false);
    
  } catch (error) {
    // Error handling...
  } finally {
    setIsProcessing(false);
  }
};

7. Add a Feature Size Detection and Routing Logic
// Add this to your geo-import-dialog.tsx
const handleImportWithSizeDetection = async () => {
  if (!importSession?.fullDataset) return;
  
  const selectedFeatures = importSession.fullDataset.features.filter(f => 
    selectedFeatureIds.includes(f.originalIndex || f.id)
  );
  
  // Determine which import method to use based on feature count and complexity
  const featureCount = selectedFeatures.length;
  const isComplex = selectedFeatures.some(f => 
    f.geometry.type === 'MultiPolygon' || 
    (f.geometry.type === 'Polygon' && JSON.stringify(f.geometry).length > 10000)
  );
  
  if (featureCount > 1000 || (featureCount > 500 && isComplex)) {
    // Use chunked approach for large datasets
    await handleImportLargeFile();
  } else {
    // Use single-call approach for smaller datasets
    await handleImport();
  }
};

8. Update Your Import Button
<Button 
  onClick={handleImportWithSizeDetection} 
  disabled={isProcessing || selectedFeatureIds.length === 0}
>
  {isProcessing ? (
    <>
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      Importing...
    </>
  ) : (
    <>Import Selected Features</>
  )}
</Button>

9. Optimize the PostgreSQL Function
For better performance, add these optimizations to your PostgreSQL function:
-- Add this to your import_geo_features_with_transform function
-- At the beginning of the function:

-- Set work_mem higher for this operation
SET LOCAL work_mem = '64MB';

-- Use a temporary table for bulk operations
CREATE TEMP TABLE temp_features (
  geom_json JSONB,
  properties JSONB
) ON COMMIT DROP;

-- Bulk insert into temp table
INSERT INTO temp_features
SELECT 
  (jsonb_array_elements(p_features)->>'geometry')::JSONB,
  COALESCE((jsonb_array_elements(p_features)->'properties')::JSONB, '{}'::JSONB);

-- Then process in batches from the temp table

Implementation Strategy
Start with the PostgreSQL Function: Implement the server-side transformation function first.
Test with Small Datasets: Verify it works with a small number of features.
3. Modify the Import Handler: Update your client code to use the new function.
Add Batch Processing: Implement the chunking strategy for large files.
Test with Progressively Larger Files: Verify performance with increasingly large datasets.
Monitor Memory Usage: Check both client and server memory consumption.
Fine-tune Batch Sizes: Adjust batch sizes based on performance testing.
This approach will move the coordinate transformation workload from the browser to the PostgreSQL server, which is much better equipped to handle large datasets efficiently.