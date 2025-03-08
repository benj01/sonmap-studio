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
  v_batch_features JSONB[];
  v_batch_size INTEGER;
  v_batch_count INTEGER;
  v_current_batch INTEGER;
  v_notices JSONB := '[]'::JSONB;
  v_debug_info JSONB;
BEGIN
  -- Get total feature count and log start
  v_total_features := jsonb_array_length(p_features);
  v_batch_size := LEAST(p_batch_size, 100); -- Ensure reasonable batch size
  v_batch_count := CEIL(v_total_features::float / v_batch_size);
  v_current_batch := 0;
  
  RAISE NOTICE 'Starting import of % features with SRID % in % batches', 
    v_total_features, p_source_srid, v_batch_count;
  
  -- Create collection and layer
  INSERT INTO feature_collections (name, project_file_id)
  VALUES (p_collection_name, p_project_file_id)
  RETURNING id INTO v_collection_id;
  
  INSERT INTO layers (name, collection_id, type)
  VALUES (p_collection_name, v_collection_id, 'vector')
  RETURNING id INTO v_layer_id;

  RAISE NOTICE 'Created collection % and layer %', v_collection_id, v_layer_id;

  -- Add initial notice
  v_notices := v_notices || jsonb_build_object(
    'level', 'info',
    'message', 'Starting import process'
  );

  -- Process features in batches
  FOR v_current_batch IN 0..v_batch_count-1 LOOP
    -- Extract current batch of features
    v_batch_features := ARRAY(
      SELECT value 
      FROM jsonb_array_elements(p_features) WITH ORDINALITY AS t(value, idx)
      WHERE idx > v_current_batch * v_batch_size 
        AND idx <= (v_current_batch + 1) * v_batch_size
    );

    -- Process each feature in the current batch
    FOR v_feature IN SELECT jsonb_array_elements(jsonb_build_array(v_batch_features))
    LOOP
      v_start_time := clock_timestamp();
      
      -- Get geometry type
      v_geom_type := v_feature->'geometry'->>'type';
      RAISE NOTICE 'Processing feature with type %', v_geom_type;
      
      -- Use ST_GeomFromGeoJSON for initial parsing
      BEGIN
        v_raw_geometry := ST_GeomFromGeoJSON(v_feature->'geometry');
        
        -- First clean duplicate vertices
        v_cleaned_geometry := ST_RemoveRepeatedPoints(v_raw_geometry);
        IF NOT ST_Equals(v_cleaned_geometry, v_raw_geometry) THEN
          v_cleaned_count := v_cleaned_count + 1;
          v_raw_geometry := v_cleaned_geometry;
          RAISE NOTICE 'Cleaned duplicate vertices';
        END IF;
        
        -- Check if geometry is valid
        IF NOT ST_IsValid(v_raw_geometry) THEN
          RAISE NOTICE 'Invalid geometry detected: %', ST_IsValidReason(v_raw_geometry);
          
          BEGIN
            -- First try a zero buffer to fix minor self-intersections
            v_geometry := ST_Buffer(v_raw_geometry, 0.0);
            IF NOT ST_IsValid(v_geometry) THEN
              -- If still invalid, use ST_MakeValid
              v_geometry := ST_MakeValid(v_raw_geometry);
              RAISE NOTICE 'Used ST_MakeValid to repair geometry';
            ELSE
              RAISE NOTICE 'Used ST_Buffer(0) to repair geometry';
            END IF;
            
            v_geometry := ST_Transform(
              ST_SetSRID(v_geometry, p_source_srid),
              4326
            );
            v_repaired_count := v_repaired_count + 1;
            RAISE NOTICE 'Transformed geometry to SRID 4326';
          EXCEPTION WHEN OTHERS THEN
            -- Log detailed error including self-intersection reason
            v_skipped_count := v_skipped_count + 1;
            v_feature_errors := v_feature_errors || jsonb_build_object(
              'feature_index', v_imported_count + v_failed_count,
              'error', SQLERRM,
              'error_state', SQLSTATE,
              'invalid_reason', ST_IsValidReason(v_raw_geometry)
            );
            RAISE NOTICE 'Failed to repair geometry: %', SQLERRM;
            CONTINUE;
          END;
        ELSE
          -- Transform valid geometry
          v_geometry := ST_Transform(
            ST_SetSRID(v_raw_geometry, p_source_srid),
            4326
          );
          RAISE NOTICE 'Geometry is valid, transformed to SRID 4326';
        END IF;

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
        RAISE NOTICE 'Successfully imported feature % of %', v_imported_count, v_total_features;

      EXCEPTION WHEN OTHERS THEN
        v_failed_count := v_failed_count + 1;
        v_last_error := SQLERRM;
        v_last_state := SQLSTATE;
        
        -- Record specific feature errors
        v_feature_errors := v_feature_errors || jsonb_build_object(
          'feature_index', v_imported_count + v_failed_count,
          'error', v_last_error,
          'error_state', v_last_state
        );
        RAISE NOTICE 'Failed to process feature: %', v_last_error;
      END;
    END LOOP;

    -- Add batch completion notice
    v_notices := v_notices || jsonb_build_object(
      'level', 'info',
      'message', format('Processed batch %s of %s', v_current_batch + 1, v_batch_count)
    );

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

  RAISE NOTICE 'Import complete. Imported: %, Failed: %, Repaired: %, Cleaned: %, Skipped: %',
    v_imported_count, v_failed_count, v_repaired_count, v_cleaned_count, v_skipped_count;

  -- Add final completion notice
  v_notices := v_notices || jsonb_build_object(
    'level', 'info',
    'message', 'Import complete'
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