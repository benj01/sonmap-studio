-- Update the import_geo_features_with_transform function to use realtime_import_logs
CREATE OR REPLACE FUNCTION import_geo_features_with_transform(
  p_project_file_id UUID,
  p_collection_name TEXT,
  p_features JSONB,
  p_source_srid INTEGER DEFAULT 2056,
  p_batch_size INTEGER DEFAULT 600
)
RETURNS TABLE(
  collection_id UUID,
  layer_id UUID,
  imported_count INTEGER,
  failed_count INTEGER,
  debug_info JSONB
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_collection_id UUID;
  v_layer_id UUID;
  v_imported_count INTEGER := 0;
  v_failed_count INTEGER := 0;
  v_repaired_count INTEGER := 0;
  v_cleaned_count INTEGER := 0;
  v_skipped_count INTEGER := 0;
  v_feature JSONB;
  v_geometry GEOMETRY;
  v_raw_geometry GEOMETRY;
  v_cleaned_geometry GEOMETRY;
  v_debug JSONB;
  v_last_error TEXT;
  v_last_state TEXT;
  v_index_name TEXT;
  v_geom_type TEXT;
  v_start_time TIMESTAMPTZ;
  v_timeout_seconds INTEGER := 60;
  v_feature_errors JSONB := '[]'::JSONB;
  v_total_features INTEGER;
  v_batch_start INTEGER;
  v_batch_end INTEGER;
  v_batch_size INTEGER;
  v_batch_count INTEGER;
  v_current_batch INTEGER;
  v_notices JSONB := '[]'::JSONB;
  v_debug_info JSONB;
  v_target_dims INTEGER;
BEGIN
  -- Get total feature count and log start
  v_total_features := jsonb_array_length(p_features);
  v_batch_size := p_batch_size; -- Use the provided batch size without capping
  v_batch_count := CEIL(v_total_features::float / v_batch_size);
  v_current_batch := 0;
  
  RAISE WARNING 'Starting import of % features with SRID % in % batches', 
    v_total_features, p_source_srid, v_batch_count;

  -- Add initial notice
  v_notices := v_notices || jsonb_build_object(
    'level', 'info',
    'message', format('Starting import of %s features with SRID %s in %s batches',
      v_total_features, p_source_srid, v_batch_count),
    'details', jsonb_build_object(
      'total_features', v_total_features,
      'source_srid', p_source_srid,
      'batch_count', v_batch_count
    )
  );

  -- Debug: Log the first feature to see its structure
  IF v_total_features > 0 THEN
    RAISE WARNING 'First feature structure: %', p_features->0;
    v_notices := v_notices || jsonb_build_object(
      'level', 'debug',
      'message', 'First feature structure received',
      'details', jsonb_build_object('feature', p_features->0)
    );
  END IF;
  
  -- Create collection and layer
  INSERT INTO feature_collections (name, project_file_id)
  VALUES (p_collection_name, p_project_file_id)
  RETURNING id INTO v_collection_id;
  
  INSERT INTO layers (name, collection_id, type)
  VALUES (p_collection_name, v_collection_id, 'vector')
  RETURNING id INTO v_layer_id;

  -- Get target dimension from geo_features table
  SELECT ST_NDims(geometry) INTO v_target_dims 
  FROM geo_features 
  LIMIT 1;

  IF v_target_dims IS NULL THEN
    -- If table is empty, assume 3D
    v_target_dims := 3;
  END IF;

  RAISE WARNING 'Created collection % and layer %. Target geometry dimensions: %', 
    v_collection_id, v_layer_id, v_target_dims;

  v_notices := v_notices || jsonb_build_object(
    'level', 'info',
    'message', format('Created collection and layer. Target dimensions: %s', v_target_dims),
    'details', jsonb_build_object(
      'collection_id', v_collection_id,
      'layer_id', v_layer_id,
      'target_dims', v_target_dims
    )
  );

  -- Process features in batches
  FOR v_current_batch IN 0..v_batch_count-1 LOOP
    v_batch_start := v_current_batch * v_batch_size;
    v_batch_end := LEAST(v_batch_start + v_batch_size, v_total_features);

    RAISE WARNING 'Processing batch % of % (features % to %)', 
      v_current_batch + 1, v_batch_count, v_batch_start, v_batch_end - 1;

    v_notices := v_notices || jsonb_build_object(
      'level', 'info',
      'message', format('Processing batch %s of %s', v_current_batch + 1, v_batch_count),
      'details', jsonb_build_object(
        'batch_number', v_current_batch + 1,
        'total_batches', v_batch_count,
        'start_index', v_batch_start,
        'end_index', v_batch_end - 1
      )
    );

    -- Process each feature in the current batch
    FOR i IN v_batch_start..v_batch_end-1 LOOP
      v_start_time := clock_timestamp();
      v_feature := p_features->i;
      
      -- Get geometry type and debug the geometry object
      RAISE WARNING 'Processing feature % - Full feature: %', i + 1, v_feature;
      
      -- Use ST_GeomFromGeoJSON for initial parsing
      BEGIN
        -- Debug: Check if we have valid GeoJSON geometry
        IF v_feature->'geometry' IS NULL THEN
          RAISE WARNING 'Feature % has no geometry object', i + 1;
          v_notices := v_notices || jsonb_build_object(
            'level', 'warning',
            'message', format('Feature %s has no geometry object', i + 1),
            'details', jsonb_build_object('feature_index', i)
          );
          CONTINUE;
        END IF;

        v_raw_geometry := ST_GeomFromGeoJSON(v_feature->'geometry');
        
        IF v_raw_geometry IS NULL THEN
          RAISE WARNING 'ST_GeomFromGeoJSON returned NULL for feature %', i + 1;
          v_notices := v_notices || jsonb_build_object(
            'level', 'error',
            'message', format('Failed to parse geometry for feature %s', i + 1),
            'details', jsonb_build_object(
              'feature_index', i,
              'geometry', v_feature->'geometry'
            )
          );
          CONTINUE;
        END IF;

        RAISE WARNING 'Successfully parsed geometry for feature %: %', i + 1, ST_AsText(v_raw_geometry);
        
        -- First clean duplicate vertices
        v_cleaned_geometry := ST_RemoveRepeatedPoints(v_raw_geometry);
        IF NOT ST_Equals(v_cleaned_geometry, v_raw_geometry) THEN
          v_cleaned_count := v_cleaned_count + 1;
          v_raw_geometry := v_cleaned_geometry;
          RAISE WARNING 'Cleaned duplicate vertices for feature %', i + 1;
          v_notices := v_notices || jsonb_build_object(
            'level', 'info',
            'message', format('Cleaned duplicate vertices for feature %s', i + 1),
            'details', jsonb_build_object('feature_index', i)
          );
        END IF;
        
        -- Check if geometry is valid
        IF NOT ST_IsValid(v_raw_geometry) THEN
          RAISE WARNING 'Invalid geometry detected for feature %: %', 
            i + 1, ST_IsValidReason(v_raw_geometry);
          
          v_notices := v_notices || jsonb_build_object(
            'level', 'warning',
            'message', format('Invalid geometry detected for feature %s', i + 1),
            'details', jsonb_build_object(
              'feature_index', i,
              'reason', ST_IsValidReason(v_raw_geometry)
            )
          );
          
          BEGIN
            -- First try a zero buffer to fix minor self-intersections
            v_geometry := ST_Buffer(v_raw_geometry, 0.0);
            IF NOT ST_IsValid(v_geometry) THEN
              -- If still invalid, use ST_MakeValid
              v_geometry := ST_MakeValid(v_raw_geometry);
              RAISE WARNING 'Used ST_MakeValid to repair geometry for feature %', i + 1;
              v_notices := v_notices || jsonb_build_object(
                'level', 'info',
                'message', format('Repaired geometry using ST_MakeValid for feature %s', i + 1),
                'details', jsonb_build_object('feature_index', i)
              );
            ELSE
              RAISE WARNING 'Used ST_Buffer(0) to repair geometry for feature %', i + 1;
              v_notices := v_notices || jsonb_build_object(
                'level', 'info',
                'message', format('Repaired geometry using ST_Buffer(0) for feature %s', i + 1),
                'details', jsonb_build_object('feature_index', i)
              );
            END IF;
            
            v_geometry := ST_Transform(
              ST_SetSRID(v_geometry, p_source_srid),
              4326
            );
            v_repaired_count := v_repaired_count + 1;
            RAISE WARNING 'Transformed geometry to SRID 4326 for feature %', i + 1;
          EXCEPTION WHEN OTHERS THEN
            -- Log detailed error including self-intersection reason
            v_skipped_count := v_skipped_count + 1;
            v_feature_errors := v_feature_errors || jsonb_build_object(
              'feature_index', i,
              'error', SQLERRM,
              'error_state', SQLSTATE,
              'invalid_reason', ST_IsValidReason(v_raw_geometry)
            );
            RAISE WARNING 'Failed to repair geometry for feature %: %', i + 1, SQLERRM;
            v_notices := v_notices || jsonb_build_object(
              'level', 'error',
              'message', format('Failed to repair geometry for feature %s', i + 1),
              'details', jsonb_build_object(
                'feature_index', i,
                'error', SQLERRM,
                'error_state', SQLSTATE,
                'invalid_reason', ST_IsValidReason(v_raw_geometry)
              )
            );
            CONTINUE;
          END;
        ELSE
          -- Transform valid geometry
          v_geometry := ST_Transform(
            ST_SetSRID(v_raw_geometry, p_source_srid),
            4326
          );
          RAISE WARNING 'Geometry is valid, transformed to SRID 4326 for feature %', i + 1;
        END IF;

        -- Debug: Check final geometry before insert
        IF v_geometry IS NULL THEN
          RAISE WARNING 'Final geometry is NULL for feature % before insert', i + 1;
          v_notices := v_notices || jsonb_build_object(
            'level', 'error',
            'message', format('Final geometry is NULL for feature %s', i + 1),
            'details', jsonb_build_object('feature_index', i)
          );
          CONTINUE;
        END IF;

        -- Ensure geometry has correct dimensions
        IF ST_NDims(v_geometry) < v_target_dims THEN
          RAISE WARNING 'Adding Z coordinate (0) to geometry for feature %', i + 1;
          v_geometry := ST_Force3D(v_geometry);
          v_notices := v_notices || jsonb_build_object(
            'level', 'info',
            'message', format('Added Z coordinate to geometry for feature %s', i + 1),
            'details', jsonb_build_object('feature_index', i)
          );
        END IF;

        RAISE WARNING 'Final geometry for feature % (dims: %): %', 
          i + 1, ST_NDims(v_geometry), ST_AsText(v_geometry);

        -- Insert the feature
        INSERT INTO geo_features (
          layer_id,
          geometry,
          properties,
          srid
        )
        VALUES (
          v_layer_id,
          v_geometry,
          COALESCE(v_feature->'properties', '{}'::jsonb),
          4326  -- We transform all geometries to WGS84
        );
        
        v_imported_count := v_imported_count + 1;
        RAISE WARNING 'Successfully imported feature % of %', v_imported_count, v_total_features;
        v_notices := v_notices || jsonb_build_object(
          'level', 'info',
          'message', format('Successfully imported feature %s of %s', v_imported_count, v_total_features),
          'details', jsonb_build_object(
            'feature_index', i,
            'total_features', v_total_features,
            'geometry_type', ST_GeometryType(v_geometry)
          )
        );

      EXCEPTION WHEN OTHERS THEN
        v_failed_count := v_failed_count + 1;
        v_last_error := SQLERRM;
        v_last_state := SQLSTATE;
        
        -- Record specific feature errors
        v_feature_errors := v_feature_errors || jsonb_build_object(
          'feature_index', i,
          'error', v_last_error,
          'error_state', v_last_state
        );
        RAISE WARNING 'Failed to process feature %: % (State: %)', i + 1, v_last_error, v_last_state;
        v_notices := v_notices || jsonb_build_object(
          'level', 'error',
          'message', format('Failed to process feature %s', i + 1),
          'details', jsonb_build_object(
            'feature_index', i,
            'error', v_last_error,
            'error_state', v_last_state
          )
        );
      END;
    END LOOP;

    -- Build debug info for this batch
    v_debug_info := jsonb_build_object(
      'repaired_count', v_repaired_count,
      'cleaned_count', v_cleaned_count,
      'skipped_count', v_skipped_count,
      'feature_errors', v_feature_errors,
      'notices', v_notices,
      'repair_summary', format('%s geometries were repaired during import', v_repaired_count),
      'skipped_summary', format('%s features were skipped due to errors', v_skipped_count)
    );

    -- Return intermediate result for this batch
    collection_id := v_collection_id;
    layer_id := v_layer_id;
    imported_count := v_imported_count;
    failed_count := v_failed_count;
    debug_info := v_debug_info;
    RETURN NEXT;
  END LOOP;

  -- Create spatial index
  v_index_name := 'idx_' || replace(v_layer_id::text, '-', '_') || '_geom';
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I ON geo_features USING GIST (geometry) WHERE layer_id = %L',
    v_index_name,
    v_layer_id
  );

  RAISE WARNING 'Import complete. Imported: %, Failed: %, Repaired: %, Cleaned: %, Skipped: %',
    v_imported_count, v_failed_count, v_repaired_count, v_cleaned_count, v_skipped_count;

  v_notices := v_notices || jsonb_build_object(
    'level', 'info',
    'message', 'Import complete',
    'details', jsonb_build_object(
      'imported_count', v_imported_count,
      'failed_count', v_failed_count,
      'repaired_count', v_repaired_count,
      'cleaned_count', v_cleaned_count,
      'skipped_count', v_skipped_count,
      'collection_id', v_collection_id,
      'layer_id', v_layer_id
    )
  );

  -- Build final debug info
  v_debug_info := jsonb_build_object(
    'repaired_count', v_repaired_count,
    'cleaned_count', v_cleaned_count,
    'skipped_count', v_skipped_count,
    'feature_errors', v_feature_errors,
    'notices', v_notices,
    'repair_summary', format('%s geometries were repaired during import', v_repaired_count),
    'skipped_summary', format('%s features were skipped due to errors', v_skipped_count)
  );

  -- Return final result
  collection_id := v_collection_id;
  layer_id := v_layer_id;
  imported_count := v_imported_count;
  failed_count := v_failed_count;
  debug_info := v_debug_info;
  RETURN NEXT;
END;
$$; 