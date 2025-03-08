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
  v_timeout_seconds INTEGER := 60; -- Increased to 60 seconds for complex repairs
  v_feature_errors JSONB := '[]'::JSONB;
  v_total_features INTEGER;
BEGIN
  -- Get total feature count and log start
  v_total_features := jsonb_array_length(p_features);
  RAISE NOTICE 'Starting import of % features with SRID %', v_total_features, p_source_srid;
  
  -- Create collection and layer
  INSERT INTO feature_collections (name, project_file_id)
  VALUES (p_collection_name, p_project_file_id)
  RETURNING id INTO v_collection_id;
  
  INSERT INTO layers (name, collection_id, type)
  VALUES (p_collection_name, v_collection_id, 'vector')
  RETURNING id INTO v_layer_id;
  
  RAISE NOTICE 'Created collection % and layer %', v_collection_id, v_layer_id;

  -- Process all features
  FOR v_feature IN SELECT * FROM jsonb_array_elements(p_features)
  LOOP
    BEGIN
      v_start_time := clock_timestamp();
      
      -- Get geometry type
      v_geom_type := v_feature->'geometry'->>'type';
      RAISE NOTICE 'Processing feature with type %', v_geom_type;
      
      -- Use ST_GeomFromGeoJSON for initial parsing
      BEGIN
        v_raw_geometry := ST_GeomFromGeoJSON(v_feature->'geometry');
        RAISE NOTICE 'Parsed GeoJSON geometry: %', ST_AsText(v_raw_geometry);
        
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
          -- Set a higher timeout for small datasets
          PERFORM set_config('statement_timeout', (v_timeout_seconds * 1000)::text, true);
          
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
            
            -- Check geometry type after repair (ST_MakeValid might return MULTIPOLYGON)
            IF ST_GeometryType(v_geometry) = 'ST_MultiPolygon' THEN
              -- Extract the largest polygon if it's a MULTIPOLYGON
              v_geometry := (
                SELECT geom
                FROM (
                  SELECT (ST_Dump(v_geometry)).geom AS geom,
                         ST_Area((ST_Dump(v_geometry)).geom) AS area
                ) sub
                ORDER BY area DESC
                LIMIT 1
              );
              RAISE NOTICE 'Extracted largest polygon from MultiPolygon';
            END IF;
            
            -- Transform to 3D and target SRID
            v_geometry := ST_Force3D(
              ST_Transform(
                ST_SetSRID(v_geometry, p_source_srid),
                4326
              )
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
              'invalid_reason', ST_IsValidReason(v_raw_geometry),
              'geometry_type_after_repair', ST_GeometryType(v_raw_geometry)
            );
            RAISE NOTICE 'Failed to repair geometry: %', SQLERRM;
            PERFORM set_config('statement_timeout', '0', true);
            CONTINUE;
          END;
          
          -- Reset timeout
          PERFORM set_config('statement_timeout', '0', true);
        ELSE
          -- Transform valid geometry
          v_geometry := ST_Force3D(
            ST_Transform(
              ST_SetSRID(v_raw_geometry, p_source_srid),
              4326
            )
          );
          RAISE NOTICE 'Geometry is valid, transformed to SRID 4326';
        END IF;

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
    END;
  END LOOP;

  -- Create spatial index with a safe name
  v_index_name := 'idx_' || replace(v_layer_id::text, '-', '_') || '_geom';
  
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I ON geo_features USING GIST (geometry) WHERE layer_id = %L',
    v_index_name,
    v_layer_id
  );
  
  RAISE NOTICE 'Import complete. Imported: %, Failed: %, Repaired: %, Cleaned: %, Skipped: %',
    v_imported_count, v_failed_count, v_repaired_count, v_cleaned_count, v_skipped_count;

  -- Return results
  RETURN QUERY SELECT 
    v_collection_id,
    v_layer_id,
    v_imported_count,
    v_failed_count,
    jsonb_build_object(
      'repaired_count', v_repaired_count,
      'cleaned_count', v_cleaned_count,
      'skipped_count', v_skipped_count,
      'feature_errors', v_feature_errors,
      'repair_summary', format('%s geometries were repaired during import', v_repaired_count),
      'skipped_summary', format('%s features were skipped due to errors', v_skipped_count)
    ) as debug_info;
END;
$$;