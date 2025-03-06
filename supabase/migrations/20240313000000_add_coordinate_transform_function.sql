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
  v_feature JSONB;
  v_geometry GEOMETRY;
  v_debug JSONB;
  v_last_error TEXT;
  v_last_state TEXT;
  v_index_name TEXT;
BEGIN
  -- Create collection and layer
  INSERT INTO feature_collections (name, project_file_id)
  VALUES (p_collection_name, p_project_file_id)
  RETURNING id INTO v_collection_id;
  
  INSERT INTO layers (name, collection_id, type)
  VALUES (p_collection_name, v_collection_id, 'vector')
  RETURNING id INTO v_layer_id;

  -- Process all features
  FOR v_feature IN SELECT * FROM jsonb_array_elements(p_features)
  LOOP
    BEGIN
      -- Extract coordinates and create geometry in steps
      WITH 
      coords AS (
        SELECT 
          (point->0)::float8 as x,
          (point->1)::float8 as y
        FROM jsonb_array_elements((v_feature->'geometry'->'coordinates')) as t(point)
      ),
      points AS (
        SELECT ST_MakePoint(x, y) as geom
        FROM coords
      )
      SELECT ST_Force3D(                    -- Force 3D with Z=0 for missing Z values
        ST_Transform(
          ST_SetSRID(
            ST_MakeLine(array_agg(geom)),
            p_source_srid
          ),
          4326
        )
      ) INTO v_geometry
      FROM points;

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
      
    EXCEPTION WHEN OTHERS THEN
      v_failed_count := v_failed_count + 1;
      v_last_error := SQLERRM;
      v_last_state := SQLSTATE;
    END;
  END LOOP;

  -- Create spatial index with a safe name
  v_index_name := 'idx_' || replace(v_layer_id::text, '-', '_') || '_geom';
  
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I ON geo_features USING GIST (geometry) WHERE layer_id = %L',
    v_index_name,
    v_layer_id
  );

  -- Prepare final debug info
  v_debug := jsonb_build_object(
    'stage', CASE 
      WHEN v_failed_count = 0 THEN 'success'
      WHEN v_imported_count = 0 THEN 'complete_failure'
      ELSE 'partial_success'
    END,
    'total_features', jsonb_array_length(p_features),
    'last_error', v_last_error,
    'last_error_state', v_last_state,
    'index_name', v_index_name
  );

  -- Return results with debug info
  RETURN QUERY SELECT v_collection_id, v_layer_id, v_imported_count, v_failed_count, v_debug;
END;
$$;