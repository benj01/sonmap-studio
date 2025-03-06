-- Drop existing functions first
DROP FUNCTION IF EXISTS import_geo_features_with_transform(UUID, TEXT, JSONB, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS import_geo_features_with_transform(UUID, TEXT, TEXT, INTEGER, INTEGER);

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
  v_total_features INTEGER;
BEGIN
  -- Set work_mem higher for this operation
  SET LOCAL work_mem = '64MB';
  
  -- Get total feature count
  v_total_features := jsonb_array_length(p_features);
  
  -- Create collection and layer
  INSERT INTO feature_collections (name, project_file_id)
  VALUES (p_collection_name, p_project_file_id)
  RETURNING id INTO v_collection_id;
  
  INSERT INTO layers (name, collection_id, type)
  VALUES (p_collection_name, v_collection_id, 'vector')
  RETURNING id INTO v_layer_id;
  
  -- Create temporary table for bulk operations
  CREATE TEMP TABLE temp_features (
    geom_json JSONB,
    properties JSONB
  ) ON COMMIT DROP;
  
  -- Bulk insert into temp table
  INSERT INTO temp_features
  SELECT 
    (feature->'geometry') as geom_json,
    COALESCE((feature->'properties')::JSONB, '{}'::JSONB) as properties
  FROM jsonb_array_elements(p_features) as feature
  WHERE feature ? 'geometry' AND feature->>'type' = 'Feature';
  
  -- Process features from temp table
  FOR v_feature IN 
    SELECT jsonb_build_object(
      'type', 'Feature',
      'geometry', geom_json,
      'properties', COALESCE(properties, '{}'::jsonb)
    )::jsonb AS feature 
    FROM temp_features
  LOOP
    BEGIN
      -- Validate geometry
      IF NOT (v_feature->'geometry' ? 'type' AND v_feature->'geometry' ? 'coordinates') THEN
        RAISE NOTICE 'Invalid geometry format: %', v_feature->'geometry';
        v_failed_count := v_failed_count + 1;
        CONTINUE;
      END IF;

      -- Let PostGIS handle the transformation
      BEGIN
        RAISE NOTICE 'Processing geometry: %', v_feature->'geometry';
        v_geometry := ST_Transform(
          ST_SetSRID(
            ST_GeomFromGeoJSON(v_feature->'geometry'::text),
            p_source_srid
          ),
          4326  -- WGS84
        );
        RAISE NOTICE 'Transformed geometry: %', ST_AsText(v_geometry);
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Failed to transform geometry: % - %', SQLERRM, v_feature->'geometry';
        v_failed_count := v_failed_count + 1;
        CONTINUE;
      END;
      
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
      
      -- Add progress reporting (optional)
      IF v_imported_count % 500 = 0 THEN
        RAISE NOTICE 'Imported % of % features (%.1f%%)', 
          v_imported_count, 
          v_total_features, 
          (v_imported_count::float / v_total_features) * 100;
      END IF;
      
    EXCEPTION WHEN OTHERS THEN
      -- Log error and continue with next feature
      RAISE NOTICE 'Error importing feature: %', SQLERRM;
      v_failed_count := v_failed_count + 1;
    END;
  END LOOP;
  
  -- Create spatial index on the newly imported features
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_geom ON geo_features USING GIST (geometry) WHERE layer_id = %L', 
    v_layer_id, 
    v_layer_id
  );
  
  -- Return results
  RETURN QUERY SELECT v_collection_id, v_layer_id, v_imported_count, v_failed_count;
END;
$$;

-- Set a longer timeout for this function
ALTER FUNCTION import_geo_features_with_transform(UUID, TEXT, JSONB, INTEGER, INTEGER) 
SET statement_timeout = '1800000';  -- 30 minutes

-- Create helper function for single feature import
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