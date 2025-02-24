-- Function to import GeoJSON features into PostGIS
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
  -- Create feature collection
  INSERT INTO feature_collections (project_file_id, name)
  VALUES (p_project_file_id, p_collection_name)
  RETURNING id INTO v_collection_id;

  -- Create layer
  INSERT INTO layers (collection_id, name, type)
  VALUES (v_collection_id, 'Default Layer', 'auto')
  RETURNING id INTO v_layer_id;

  -- Process each feature
  FOR v_feature IN SELECT * FROM jsonb_array_elements(p_features)
  LOOP
    BEGIN
      -- Convert GeoJSON geometry to PostGIS geometry and transform to target SRID
      v_geometry := ST_Transform(
        ST_SetSRID(
          ST_GeomFromGeoJSON(v_feature->>'geometry'),
          p_source_srid
        ),
        p_target_srid
      );

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
        v_feature->'properties',
        p_target_srid
      );

      v_imported := v_imported + 1;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      -- Log error but continue processing
      RAISE WARNING 'Failed to import feature: %', SQLERRM;
    END;
  END LOOP;

  RETURN QUERY SELECT 
    v_collection_id,
    v_layer_id,
    v_imported,
    v_failed;
END;
$$; 