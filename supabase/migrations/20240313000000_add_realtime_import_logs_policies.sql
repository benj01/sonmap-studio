-- Drop all versions of the function first to ensure clean slate
DROP FUNCTION IF EXISTS import_geo_features_with_transform(uuid, text, jsonb, integer, integer, integer);
DROP FUNCTION IF EXISTS import_geo_features_with_transform(uuid, text, jsonb, integer, integer);
DROP FUNCTION IF EXISTS import_geo_features_with_transform(uuid, text, jsonb, integer);

-- Recreate the function with the correct columns
CREATE OR REPLACE FUNCTION import_geo_features_with_transform(
  p_project_file_id UUID,
  p_collection_name TEXT,
  p_features JSONB,
  p_source_srid INTEGER,
  p_target_srid INTEGER DEFAULT 4326,
  p_batch_size INTEGER DEFAULT 100
) RETURNS TABLE (
  collection_id UUID,
  layer_id UUID,
  imported_count INTEGER,
  failed_count INTEGER,
  debug_info JSONB
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  v_dimension_fixes INTEGER := 0;
BEGIN
  -- Get total feature count and log start
  v_total_features := jsonb_array_length(p_features);
  v_batch_size := p_batch_size;
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
      
      -- Skip features without geometry
      IF v_feature->'geometry' IS NULL THEN
        RAISE WARNING 'Feature % has no geometry object', i + 1;
        v_notices := v_notices || jsonb_build_object(
          'level', 'warning',
          'message', format('Feature %s has no geometry object', i + 1),
          'details', jsonb_build_object('feature_index', i)
        );
        CONTINUE;
      END IF;

      BEGIN
        -- Parse geometry
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

        -- Clean and validate geometry
        v_cleaned_geometry := ST_RemoveRepeatedPoints(v_raw_geometry);
        IF NOT ST_Equals(v_cleaned_geometry, v_raw_geometry) THEN
          v_cleaned_count := v_cleaned_count + 1;
          v_raw_geometry := v_cleaned_geometry;
        END IF;
        
        -- Handle invalid geometries
        IF NOT ST_IsValid(v_raw_geometry) THEN
          BEGIN
            -- Try to repair
            v_geometry := COALESCE(
              ST_Buffer(v_raw_geometry, 0.0),
              ST_MakeValid(v_raw_geometry)
            );
            
            IF v_geometry IS NULL OR NOT ST_IsValid(v_geometry) THEN
              RAISE EXCEPTION 'Failed to repair invalid geometry';
            END IF;
            
            v_repaired_count := v_repaired_count + 1;
          EXCEPTION WHEN OTHERS THEN
            v_skipped_count := v_skipped_count + 1;
            v_feature_errors := v_feature_errors || jsonb_build_object(
              'feature_index', i,
              'error', SQLERRM,
              'error_state', SQLSTATE,
              'invalid_reason', ST_IsValidReason(v_raw_geometry)
            );
            CONTINUE;
          END;
        ELSE
          v_geometry := v_raw_geometry;
        END IF;

        -- Transform coordinates
        v_geometry := ST_Transform(ST_SetSRID(v_geometry, p_source_srid), p_target_srid);

        -- Handle dimensions
        IF ST_NDims(v_geometry) < v_target_dims THEN
          v_geometry := ST_Force3D(v_geometry);
          v_dimension_fixes := v_dimension_fixes + 1;
        END IF;

        -- Insert feature with correct columns
        INSERT INTO geo_features (
          layer_id,
          geometry,
          properties,
          srid
        ) VALUES (
          v_layer_id,
          v_geometry,
          COALESCE(v_feature->'properties', '{}'::jsonb),
          p_target_srid
        );

        v_imported_count := v_imported_count + 1;

      EXCEPTION WHEN OTHERS THEN
        v_failed_count := v_failed_count + 1;
        v_feature_errors := v_feature_errors || jsonb_build_object(
          'feature_index', i,
          'error', SQLERRM,
          'error_state', SQLSTATE
        );
      END;
    END LOOP;
  END LOOP;

  -- Prepare debug info
  v_debug_info := jsonb_build_object(
    'repaired_count', v_repaired_count,
    'cleaned_count', v_cleaned_count,
    'skipped_count', v_skipped_count,
    'dimension_fixes', v_dimension_fixes,
    'feature_errors', v_feature_errors,
    'notices', v_notices
  );

  -- Return results
  RETURN QUERY SELECT 
    v_collection_id,
    v_layer_id,
    v_imported_count,
    v_failed_count,
    v_debug_info;
END;
$$;