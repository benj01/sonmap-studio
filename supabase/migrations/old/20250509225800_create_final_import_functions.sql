DROP FUNCTION IF EXISTS public.transform_swiss_coords_swisstopo(float, float, float);

-- Drop the existing import function if it exists (handling potential signature changes)
-- Note: Using types for more specific dropping
DROP FUNCTION IF EXISTS public.import_geo_features_with_transform(uuid, text, jsonb, integer, integer, integer);

-- Create the FINAL import function with schema qualification and correct logic
CREATE OR REPLACE FUNCTION public.import_geo_features_with_transform(
  p_project_file_id uuid,
  p_collection_name text,
  p_features jsonb,
  p_source_srid integer,
  p_target_srid integer,
  p_height_attribute_key text,
  p_batch_size integer DEFAULT 1000
) RETURNS TABLE (
  collection_id uuid,
  layer_id uuid,
  imported_count integer,
  failed_count integer,
  debug_info jsonb
) LANGUAGE plpgsql -- Removed SECURITY DEFINER and SET search_path
AS $$
DECLARE
  -- IDs and Counters
  v_collection_id UUID;
  v_layer_id UUID;
  v_imported_count INTEGER := 0;
  v_failed_count INTEGER := 0;
  v_repaired_count INTEGER := 0;
  v_cleaned_count INTEGER := 0;
  v_skipped_count INTEGER := 0;

  -- Feature Processing Variables
  v_feature JSONB;
  v_properties JSONB;
  v_raw_geometry GEOMETRY;
  v_cleaned_geometry GEOMETRY;
  v_validated_geometry GEOMETRY;
  v_geometry_2d GEOMETRY;
  v_representative_point GEOMETRY;
  lv95_easting FLOAT;
  lv95_northing FLOAT;

  -- Height related Variables
  v_lhn95_height FLOAT := NULL;
  v_base_elevation_ellipsoidal FLOAT := NULL;
  v_object_height FLOAT := NULL;
  v_height_mode TEXT := NULL;
  v_height_source TEXT := NULL;
  v_vertical_datum_source TEXT := NULL;

  -- Loop and Batching Variables
  v_total_features INTEGER;
  v_batch_start INTEGER;
  v_batch_end INTEGER;
  v_batch_count INTEGER;
  v_current_batch INTEGER;

  -- Logging and Debugging Variables
  v_feature_errors JSONB := '[]'::jsonb;
  v_notices JSONB := '[]'::jsonb;
  v_debug_info JSONB;
  v_start_time TIMESTAMPTZ;

BEGIN
  RAISE LOG '[IMPORT_FUNC] Starting execution for project_file_id: %', p_project_file_id;
  -- Get total feature count and log start
  v_total_features := jsonb_array_length(p_features);
  v_batch_count := CEIL(v_total_features::float / p_batch_size);
  v_current_batch := 0;
  RAISE LOG '[IMPORT_FUNC] Total features: %, Batch Count: %, Batch Size: %', v_total_features, v_batch_count, p_batch_size;

  RAISE NOTICE 'Starting import of % features with Source SRID % into Target SRID % in % batches of size %',
    v_total_features, p_source_srid, p_target_srid, v_batch_count, p_batch_size;

  v_notices := v_notices || jsonb_build_object(
    'level', 'info',
    'message', format('Starting import of %s features with SRID %s in %s batches',
      v_total_features, p_source_srid, v_batch_count),
    'details', jsonb_build_object(
      'total_features', v_total_features, 'source_srid', p_source_srid, 'target_srid', p_target_srid,
      'batch_count', v_batch_count, 'batch_size', p_batch_size
    )
  );

  -- Create collection and layer
  INSERT INTO public.feature_collections (name, project_file_id)
  VALUES (p_collection_name, p_project_file_id)
  RETURNING id INTO v_collection_id;

  INSERT INTO public.layers (name, collection_id, type)
  VALUES (p_collection_name, v_collection_id, 'vector')
  RETURNING id INTO v_layer_id;

  RAISE NOTICE 'Created collection % and layer %.', v_collection_id, v_layer_id;
  v_notices := v_notices || jsonb_build_object(
    'level', 'info', 'message', 'Created collection and layer.',
    'details', jsonb_build_object('collection_id', v_collection_id, 'layer_id', v_layer_id)
  );

  -- Process features in batches
  FOR v_current_batch IN 0..v_batch_count-1 LOOP
    v_batch_start := v_current_batch * p_batch_size;
    v_batch_end := LEAST(v_batch_start + p_batch_size, v_total_features);
    RAISE LOG 'Processing batch % of % (features % to %)',
      v_current_batch + 1, v_batch_count, v_batch_start, v_batch_end - 1;

    FOR i IN v_batch_start..v_batch_end-1 LOOP
      RAISE LOG '[IMPORT_FUNC] Processing feature index %', i;
      v_start_time := clock_timestamp();
      v_feature := p_features->i;
      v_properties := COALESCE(v_feature->'properties', '{}'::jsonb);

      -- Reset feature-specific variables
      v_lhn95_height := NULL; v_base_elevation_ellipsoidal := NULL; v_object_height := NULL;
      v_height_mode := NULL; v_height_source := NULL; v_vertical_datum_source := NULL;
      v_raw_geometry := NULL; v_cleaned_geometry := NULL; v_validated_geometry := NULL;
      v_geometry_2d := NULL; v_representative_point := NULL; lv95_easting := NULL; lv95_northing := NULL;

      IF v_feature->'geometry' IS NULL OR jsonb_typeof(v_feature->'geometry') = 'null' THEN
        RAISE WARNING 'Feature index % has null or missing geometry object. Skipping.', i;
        v_notices := v_notices || jsonb_build_object('level', 'warning', 'message', format('Feature index %s has null or missing geometry. Skipping.', i), 'details', jsonb_build_object('feature_index', i));
        v_skipped_count := v_skipped_count + 1;
        CONTINUE;
      END IF;

      BEGIN -- Start block for individual feature processing

        -- 1. Parse geometry
        v_raw_geometry := ST_GeomFromGeoJSON(v_feature->'geometry');
        IF v_raw_geometry IS NULL THEN
          RAISE WARNING 'ST_GeomFromGeoJSON returned NULL for feature index %. Skipping.', i;
          v_notices := v_notices || jsonb_build_object('level', 'error', 'message', format('Failed to parse geometry for feature index %s. Skipping.', i), 'details', jsonb_build_object('feature_index', i, 'geometry_json', v_feature->'geometry'));
          v_failed_count := v_failed_count + 1; CONTINUE;
        END IF;
        v_raw_geometry := ST_SetSRID(v_raw_geometry, p_source_srid);

        -- Before ST_SetSRID
        RAISE LOG '[Feature %] Raw geometry before ST_SetSRID: %', i, substring(ST_AsText(v_raw_geometry) from 1 for 200) || CASE WHEN length(ST_AsText(v_raw_geometry)) > 200 THEN '...' ELSE '' END;

        -- 2. Clean and Validate geometry
        v_cleaned_geometry := ST_RemoveRepeatedPoints(v_raw_geometry, 0.0);
        IF NOT ST_Equals(v_cleaned_geometry, v_raw_geometry) THEN v_cleaned_count := v_cleaned_count + 1; END IF;

        IF NOT ST_IsValid(v_cleaned_geometry) THEN
           RAISE NOTICE 'Feature index % invalid geometry, attempting repair. Reason: %', i, ST_IsValidReason(v_cleaned_geometry);
          BEGIN
            v_validated_geometry := ST_CollectionExtract(ST_MakeValid(ST_Buffer(v_cleaned_geometry, 0.0)), ST_Dimension(v_cleaned_geometry) + 1);
            IF v_validated_geometry IS NULL OR ST_IsEmpty(v_validated_geometry) OR NOT ST_IsValid(v_validated_geometry) THEN
               RAISE WARNING 'Failed to repair invalid geometry for feature index %. Skipping.', i; v_failed_count := v_failed_count + 1;
               v_feature_errors := v_feature_errors || jsonb_build_object('feature_index', i, 'error', 'Failed to repair invalid geometry', 'invalid_reason', ST_IsValidReason(v_cleaned_geometry));
               CONTINUE;
            END IF;
            v_repaired_count := v_repaired_count + 1; RAISE NOTICE 'Feature index % geometry repaired.', i;
          EXCEPTION WHEN OTHERS THEN
             RAISE WARNING 'Exception during geometry repair for feature index %: %. Skipping.', i, SQLERRM; v_failed_count := v_failed_count + 1;
             v_feature_errors := v_feature_errors || jsonb_build_object('feature_index', i, 'error', 'Exception during geometry repair: ' || SQLERRM, 'error_state', SQLSTATE, 'invalid_reason', ST_IsValidReason(v_cleaned_geometry));
             CONTINUE;
          END;
        ELSE
          v_validated_geometry := v_cleaned_geometry;
        END IF;

        -- After cleaning/validation
        RAISE LOG '[Feature %] Geometry after cleaning/validation: %', i, substring(ST_AsText(v_validated_geometry) from 1 for 200) || CASE WHEN length(ST_AsText(v_validated_geometry)) > 200 THEN '...' ELSE '' END;

        -- 3. Extract Height Information (from validated geometry in original SRID)
        v_vertical_datum_source := CASE WHEN p_source_srid = 2056 THEN 'LHN95' WHEN p_source_srid = 4326 THEN 'WGS84' ELSE 'EPSG:' || p_source_srid::TEXT END;

        IF ST_CoordDim(v_validated_geometry) >= 3 THEN
          v_height_source := 'z_coord (failed extraction)';
          BEGIN
            IF GeometryType(v_validated_geometry) = 'POINT' THEN v_lhn95_height := ST_Z(v_validated_geometry); v_height_source := 'z_coord';
            ELSIF GeometryType(v_validated_geometry) LIKE '%LINESTRING' THEN v_lhn95_height := ST_Z(ST_StartPoint(v_validated_geometry)); v_height_source := 'z_coord';
            ELSIF GeometryType(v_validated_geometry) LIKE '%POLYGON' THEN v_lhn95_height := ST_Z(ST_PointN(ST_ExteriorRing(v_validated_geometry), 1)); v_height_source := 'z_coord';
            END IF;
            RAISE LOG '[Feature %] Successfully extracted Z coordinate: %', i, v_lhn95_height;
          EXCEPTION WHEN OTHERS THEN 
            RAISE WARNING 'Could not extract Z coordinate for feature index %: %', i, SQLERRM; 
            v_lhn95_height := NULL;
          END;
          IF v_lhn95_height IS NULL THEN v_height_source := NULL; END IF;
        END IF;

        IF v_lhn95_height IS NULL AND p_height_attribute_key IS NOT NULL AND p_height_attribute_key <> '' AND p_height_attribute_key <> '_none' THEN
          DECLARE
            attr_value_text TEXT;
            attr_value_float FLOAT;
          BEGIN
            attr_value_text := v_properties->>p_height_attribute_key;
            RAISE LOG '[Feature % Height] Checking user attribute "%": Value "%"', i, p_height_attribute_key, attr_value_text;
            IF attr_value_text IS NOT NULL THEN
              BEGIN
                attr_value_float := attr_value_text::FLOAT;
                v_lhn95_height := attr_value_float;
                v_height_source := 'attribute:' || p_height_attribute_key;
                RAISE LOG '[Feature % Height] Used attribute "%": %', i, p_height_attribute_key, v_lhn95_height;
              EXCEPTION WHEN OTHERS THEN
                RAISE WARNING '[Feature % Height] Could not cast attribute "%" value "%" to FLOAT: %', i, p_height_attribute_key, attr_value_text, SQLERRM;
              END;
            END IF;
          EXCEPTION WHEN OTHERS THEN
            RAISE WARNING '[Feature % Height] Error accessing attribute "%": %', i, p_height_attribute_key, SQLERRM;
          END;
        END IF;

        -- Check for 'height' field in properties which might be added by client
        IF v_lhn95_height IS NULL AND v_properties ? 'height' AND p_height_attribute_key = 'z' THEN
          BEGIN
            v_lhn95_height := (v_properties->>'height')::float;
            IF v_lhn95_height IS NOT NULL THEN
              v_height_source := 'properties:height';
              RAISE LOG '[Feature % Height] Used explicit height property: %', i, v_lhn95_height;
            END IF;
          EXCEPTION WHEN OTHERS THEN
            RAISE WARNING '[Feature % Height] Could not use height property: %', i, SQLERRM;
          END;
        END IF;

        v_object_height := COALESCE( (v_properties->>'object_height')::float, (v_properties->>'obj_height')::float, (v_properties->>'OBJ_HOEHE')::float );
         IF v_object_height IS NULL AND v_height_source != 'attribute:HEIGHT' AND v_height_source != 'attribute:height' THEN v_object_height := (v_properties->>'HEIGHT')::float; END IF;

        -- 4. Get Representative Point (in original SRID) for API call if needed
        IF p_source_srid = 2056 AND v_lhn95_height IS NOT NULL THEN
            BEGIN
                v_representative_point := ST_PointOnSurface(v_validated_geometry);
                IF v_representative_point IS NULL THEN
                   RAISE WARNING 'Could not get representative point (ST_PointOnSurface failed) for feature index %. Using centroid.', i;
                   v_representative_point := ST_Centroid(v_validated_geometry);
                END IF;
                lv95_easting := ST_X(v_representative_point);
                lv95_northing := ST_Y(v_representative_point);
            EXCEPTION WHEN OTHERS THEN
                RAISE WARNING 'Exception getting representative point for feature index %: %. Cannot transform height.', i, SQLERRM; lv95_easting := NULL; lv95_northing := NULL;
            END;
        END IF;

        -- 5. Transform Footprint to WGS84 2D (EPSG:4326)
        -- Note: We use ST_Force2D because geometry_2d column is 2D, but we've already extracted Z value
        BEGIN
          v_geometry_2d := ST_Force2D(ST_Transform(v_validated_geometry, 4326));
        EXCEPTION WHEN OTHERS THEN
           RAISE WARNING 'Exception during ST_Transform for feature index %: %. Skipping.', i, SQLERRM; v_failed_count := v_failed_count + 1;
           v_feature_errors := v_feature_errors || jsonb_build_object('feature_index', i, 'error', 'Exception during ST_Transform: ' || SQLERRM, 'error_state', SQLSTATE);
           CONTINUE;
        END;
        IF v_geometry_2d IS NULL OR ST_IsEmpty(v_geometry_2d) THEN
          RAISE WARNING 'ST_Transform resulted in NULL or empty geometry for feature index %. Skipping.', i; v_failed_count := v_failed_count + 1;
          v_feature_errors := v_feature_errors || jsonb_build_object('feature_index', i, 'error', 'ST_Transform resulted in NULL or empty geometry');
          CONTINUE;
        END IF;

        -- Before ST_Transform
        RAISE LOG '[Feature %] Geometry before ST_Transform (SRID: %): %', i, ST_SRID(v_validated_geometry), substring(ST_AsText(v_validated_geometry) from 1 for 200) || CASE WHEN length(ST_AsText(v_validated_geometry)) > 200 THEN '...' ELSE '' END;

        -- 6. Set height values directly for WGS84, or set LV95 coords for later client-side transformation
        IF p_source_srid = 4326 AND v_lhn95_height IS NOT NULL THEN
            v_base_elevation_ellipsoidal := v_lhn95_height;
            v_height_mode := 'absolute_ellipsoidal';
            RAISE LOG '[Feature %] Setting WGS84 height directly: %', i, v_base_elevation_ellipsoidal;
        ELSIF p_source_srid = 2056 AND v_lhn95_height IS NOT NULL THEN
            -- Store original LV95 coordinates for client-side transformation
            v_properties := v_properties || jsonb_build_object(
              'lv95_easting', lv95_easting,
              'lv95_northing', lv95_northing,
              'lv95_height', v_lhn95_height
            );
            v_height_mode := 'lv95_stored';
            RAISE LOG '[Feature %] Storing LV95 height in properties: %', i, v_lhn95_height;
        END IF;

        -- Also store the original height in original_height_values for reference/debugging
        DECLARE
            v_original_height_values JSONB := '{}'::jsonb;
        BEGIN
            IF v_lhn95_height IS NOT NULL THEN
                v_original_height_values := jsonb_build_object(
                    'source', v_height_source,
                    'value', v_lhn95_height,
                    'datum', v_vertical_datum_source,
                    'srid', p_source_srid
                );
            END IF;
        END;

        -- After ST_Transform
        RAISE LOG '[Feature %] Geometry after ST_Transform (SRID: %): %', i, ST_SRID(v_geometry_2d), substring(ST_AsText(v_geometry_2d) from 1 for 200) || CASE WHEN length(ST_AsText(v_geometry_2d)) > 200 THEN '...' ELSE '' END;

        -- 7. Insert feature with calculated values
        INSERT INTO public.geo_features ( 
            layer_id, 
            collection_id, 
            properties, 
            srid, 
            geometry_2d, 
            base_elevation_ellipsoidal, 
            object_height, 
            height_mode, 
            height_source, 
            vertical_datum_source 
        )
        VALUES ( 
            v_layer_id, 
            v_collection_id, 
            v_properties, 
            p_target_srid, 
            v_geometry_2d, 
            v_base_elevation_ellipsoidal, 
            v_object_height, 
            v_height_mode, 
            v_height_source, 
            v_vertical_datum_source 
        );
        v_imported_count := v_imported_count + 1;

        -- On successful transformation
        RAISE LOG '[Feature %] Transformation success: Source SRID % -> Target SRID %, Sample: %', i, p_source_srid, 4326, substring(ST_AsText(ST_PointN(ST_GeometryN(v_geometry_2d, 1), 1)) from 1 for 200) || CASE WHEN length(ST_AsText(ST_PointN(ST_GeometryN(v_geometry_2d, 1), 1))) > 200 THEN '...' ELSE '' END;

      EXCEPTION WHEN OTHERS THEN
        v_failed_count := v_failed_count + 1; RAISE WARNING '[Feature % Error] % (State: %)', i, SQLERRM, SQLSTATE;
        v_feature_errors := v_feature_errors || jsonb_build_object('feature_index', i, 'error', SQLERRM, 'error_state', SQLSTATE);
      END; -- End block for individual feature processing
    END LOOP; -- End loop for features in batch
  END LOOP; -- End loop for batches

  -- Prepare debug info
  v_debug_info := jsonb_build_object(
    'repaired_count', v_repaired_count, 'cleaned_count', v_cleaned_count, 'skipped_count', v_skipped_count,
    'feature_errors', v_feature_errors, 'notices', v_notices
  );
  RAISE NOTICE 'Import finished. Imported: %, Failed: %, Repaired: %, Cleaned: %, Skipped: %',
     v_imported_count, v_failed_count, v_repaired_count, v_cleaned_count, v_skipped_count;

  -- Return results
  RETURN QUERY SELECT v_collection_id, v_layer_id, v_imported_count, v_failed_count, v_debug_info;
  RAISE LOG '[IMPORT_FUNC] Finishing execution. Imported: %, Failed: %', v_imported_count, v_failed_count;
END;
$$;