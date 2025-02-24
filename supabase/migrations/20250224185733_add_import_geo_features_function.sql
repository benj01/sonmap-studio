-- Add import_geo_features function
CREATE OR REPLACE FUNCTION import_geo_features(
  p_project_file_id UUID,
  p_collection_name TEXT,
  p_features JSONB,
  p_source_srid INTEGER,
  p_target_srid INTEGER DEFAULT 4326
)
RETURNS TABLE (
  collection_id UUID,
  layer_id UUID,
  imported_count INTEGER,
  failed_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_collection_id UUID;
  v_layer_id UUID;
  v_imported INTEGER := 0;
  v_failed INTEGER := 0;
  v_feature JSONB;
  v_geometry GEOMETRY;
BEGIN
  -- Validate input parameters
  IF p_project_file_id IS NULL THEN
    RAISE EXCEPTION 'project_file_id cannot be null';
  END IF;

  IF p_features IS NULL OR jsonb_array_length(p_features) = 0 THEN
    RAISE EXCEPTION 'features array cannot be null or empty';
  END IF;

  -- Create feature collection with explicit error handling
  BEGIN
    INSERT INTO feature_collections (project_file_id, name)
    VALUES (p_project_file_id, p_collection_name)
    RETURNING id INTO v_collection_id;

    IF v_collection_id IS NULL THEN
      RAISE EXCEPTION 'Failed to create feature collection';
    END IF;

    RAISE NOTICE 'Created feature collection with ID: %', v_collection_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Error creating feature collection: %', SQLERRM;
  END;

  -- Create layer with explicit error handling
  BEGIN
    INSERT INTO layers (collection_id, name, type)
    VALUES (v_collection_id, 'Default Layer', 'auto')
    RETURNING id INTO v_layer_id;

    IF v_layer_id IS NULL THEN
      RAISE EXCEPTION 'Failed to create layer';
    END IF;

    RAISE NOTICE 'Created layer with ID: %', v_layer_id;
  EXCEPTION WHEN OTHERS THEN
    -- Clean up the feature collection if layer creation fails
    DELETE FROM feature_collections WHERE id = v_collection_id;
    RAISE EXCEPTION 'Error creating layer: %', SQLERRM;
  END;

  -- Process each feature
  FOR v_feature IN SELECT * FROM jsonb_array_elements(p_features)
  LOOP
    BEGIN
      -- Validate feature geometry
      IF v_feature->>'geometry' IS NULL THEN
        RAISE WARNING 'Skipping feature with null geometry';
        v_failed := v_failed + 1;
        CONTINUE;
      END IF;

      -- Convert GeoJSON geometry to PostGIS geometry and transform to target SRID
      v_geometry := ST_Transform(
        ST_SetSRID(
          ST_GeomFromGeoJSON(v_feature->>'geometry'),
          p_source_srid
        ),
        p_target_srid
      );

      -- Validate transformed geometry
      IF v_geometry IS NULL THEN
        RAISE WARNING 'Failed to transform geometry';
        v_failed := v_failed + 1;
        CONTINUE;
      END IF;

      -- Insert feature
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
        p_target_srid
      );

      v_imported := v_imported + 1;
      
      -- Log progress every 100 features
      IF v_imported % 100 = 0 THEN
        RAISE NOTICE 'Imported % features', v_imported;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      RAISE WARNING 'Failed to import feature: %', SQLERRM;
    END;
  END LOOP;

  -- Verify we have imported at least one feature
  IF v_imported = 0 THEN
    -- Clean up if no features were imported
    DELETE FROM layers WHERE id = v_layer_id;
    DELETE FROM feature_collections WHERE id = v_collection_id;
    RAISE EXCEPTION 'No features were successfully imported';
  END IF;

  RAISE NOTICE 'Import completed: % features imported, % failed', v_imported, v_failed;

  RETURN QUERY SELECT 
    v_collection_id,
    v_layer_id,
    v_imported,
    v_failed;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION import_geo_features TO authenticated;
