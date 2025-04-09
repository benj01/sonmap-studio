
-- Drop the existing transform function if it exists (handling potential signature changes)
DROP FUNCTION IF EXISTS public.transform_swiss_coords_swisstopo(float, float, float);

-- Create the corrected transform_swiss_coords_swisstopo function (NO AWAIT)
CREATE OR REPLACE FUNCTION public.transform_swiss_coords_swisstopo(
  easting_lv95 float,
  northing_lv95 float,
  lhn95_height float
) RETURNS jsonb
LANGUAGE plv8
STABLE -- Use STABLE as it depends on external service but is deterministic for same inputs within transaction
AS $$
  const besselEndpoint = 'https://geodesy.geo.admin.ch/reframe/lhn95tobessel';
  const wgs84Endpoint = 'https://geodesy.geo.admin.ch/reframe/lv95towgs84';

  // Basic input validation
  if (easting_lv95 === null || northing_lv95 === null || lhn95_height === null ||
      typeof easting_lv95 !== 'number' || typeof northing_lv95 !== 'number' || typeof lhn95_height !== 'number') {
    plv8.elog(WARNING, `Invalid input to transform_swiss_coords_swisstopo: E=${easting_lv95}, N=${northing_lv95}, H=${lhn95_height}`);
    return null;
  }

  try {
    // Step 1: Transform LHN95 to Bessel Ellipsoidal Height
    const besselResponse = plv8.fetch(
      `${besselEndpoint}?easting=${easting_lv95}&northing=${northing_lv95}&altitude=${lhn95_height}&format=json`
    );

    // Check response status directly (fetch API standard)
    if (!besselResponse.ok) {
      let errorBody = '';
      try { errorBody = besselResponse.text(); } catch(e) { /* ignore */ }
      plv8.elog(WARNING, `Failed to transform height to Bessel: ${besselResponse.status} ${besselResponse.statusText}. Endpoint: ${besselEndpoint} Body: ${errorBody}`);
      return null;
    }

    const besselResult = besselResponse.json();

    if (!besselResult || besselResult.altitude === undefined || besselResult.altitude === null) {
       plv8.elog(WARNING, `Bessel API response missing altitude. Response: ${JSON.stringify(besselResult)}`);
       return null;
    }
    const besselHeight = parseFloat(besselResult.altitude);
    if (isNaN(besselHeight)) {
       plv8.elog(WARNING, `Failed to parse Bessel height from API response: ${besselResult.altitude}`);
       return null;
    }

    // Step 2: Transform LV95 + Bessel Height to WGS84
    const wgs84Response = plv8.fetch(
      `${wgs84Endpoint}?easting=${easting_lv95}&northing=${northing_lv95}&altitude=${besselHeight}&format=json`
    );

    if (!wgs84Response.ok) {
      let errorBody = '';
      try { errorBody = wgs84Response.text(); } catch(e) { /* ignore */ }
      plv8.elog(WARNING, `Failed to transform coordinates to WGS84: ${wgs84Response.status} ${wgs84Response.statusText}. Endpoint: ${wgs84Endpoint} Body: ${errorBody}`);
      return null;
    }

    const wgs84Result = wgs84Response.json();

    if (!wgs84Result || wgs84Result.easting === undefined || wgs84Result.easting === null ||
        wgs84Result.northing === undefined || wgs84Result.northing === null ||
        wgs84Result.altitude === undefined || wgs84Result.altitude === null) {
      plv8.elog(WARNING, `WGS84 API response missing expected fields. Response: ${JSON.stringify(wgs84Result)}`);
      return null;
    }

    const lon = parseFloat(wgs84Result.easting);
    const lat = parseFloat(wgs84Result.northing);
    const ellHeight = parseFloat(wgs84Result.altitude);

    if (isNaN(lon) || isNaN(lat) || isNaN(ellHeight)) {
       plv8.elog(WARNING, `Failed to parse WGS84 results from API. Lon: ${wgs84Result.easting}, Lat: ${wgs84Result.northing}, Height: ${wgs84Result.altitude}`);
       return null;
    }

    return JSON.stringify({  // Ensure returning valid JSON text for jsonb conversion
      lon: lon,
      lat: lat,
      ell_height: ellHeight
    });
  } catch (error) {
    plv8.elog(ERROR, 'Error in transform_swiss_coords_swisstopo: ' + (error.message || error) + (error.stack ? '\nStack: ' + error.stack : ''));
    return null; // Return null on error
  }
$$;


-- Drop the existing import function if it exists (handling potential signature changes)
DROP FUNCTION IF EXISTS public.import_geo_features_with_transform(uuid, text, jsonb, integer, integer, integer);

-- Update the import function with improved height handling and complete declarations
CREATE OR REPLACE FUNCTION public.import_geo_features_with_transform(
  p_project_file_id uuid,
  p_collection_name text,
  p_features jsonb,
  p_source_srid integer,
  p_target_srid integer, -- Target SRID for the 'srid' column, geometry_2d is always 4326
  p_batch_size integer DEFAULT 1000
) RETURNS TABLE (
  collection_id uuid,
  layer_id uuid,
  imported_count integer,
  failed_count integer,
  debug_info jsonb
) LANGUAGE plpgsql
AS $$
DECLARE
  -- IDs and Counters
  v_collection_id UUID;
  v_layer_id UUID;
  v_imported_count INTEGER := 0;
  v_failed_count INTEGER := 0;
  v_repaired_count INTEGER := 0;
  v_cleaned_count INTEGER := 0;
  v_skipped_count INTEGER := 0; -- Counter for skipped features (e.g., no geometry)

  -- Feature Processing Variables
  v_feature JSONB;
  v_properties JSONB;
  v_raw_geometry GEOMETRY;          -- Geometry directly from GeoJSON
  v_validated_geometry GEOMETRY;    -- Geometry after cleaning/validation (still in original SRID)
  v_geometry_2d GEOMETRY;           -- Final 2D geometry in WGS84 (EPSG:4326)
  v_representative_point GEOMETRY;  -- Representative point in original SRID (LV95) for API call
  lv95_easting FLOAT;               -- Easting of representative point
  lv95_northing FLOAT;              -- Northing of representative point

  -- Height related Variables
  v_lhn95_height FLOAT := NULL;              -- Base height in LHN95 (from Z or attribute)
  v_base_elevation_ellipsoidal FLOAT := NULL;-- Final calculated WGS84 ellipsoidal height
  v_object_height FLOAT := NULL;             -- Height of the object itself (from attribute)
  v_height_mode TEXT := NULL;                -- e.g., 'absolute_ellipsoidal'
  v_height_source TEXT := NULL;              -- e.g., 'z_coord', 'attribute:H_MEAN'
  v_vertical_datum_source TEXT := NULL;      -- e.g., 'LHN95', 'WGS84', 'unknown'
  v_coords JSONB;                          -- Result from transform_swiss_coords_swisstopo

  -- Loop and Batching Variables
  v_total_features INTEGER;
  v_batch_start INTEGER;
  v_batch_end INTEGER;
  v_batch_count INTEGER;
  v_current_batch INTEGER;

  -- Logging and Debugging Variables
  v_feature_errors JSONB := '[]'::JSONB;
  v_notices JSONB := '[]'::JSONB;
  v_debug_info JSONB;
  v_start_time TIMESTAMPTZ;

BEGIN
  -- Get total feature count and log start
  v_total_features := jsonb_array_length(p_features);
  v_batch_count := CEIL(v_total_features::float / p_batch_size); -- Use p_batch_size argument
  v_current_batch := 0;

  RAISE NOTICE 'Starting import of % features with Source SRID % into Target SRID % in % batches of size %',
    v_total_features, p_source_srid, p_target_srid, v_batch_count, p_batch_size;

  -- Add initial notice
  v_notices := v_notices || jsonb_build_object(
    'level', 'info',
    'message', format('Starting import of %s features with SRID %s in %s batches',
      v_total_features, p_source_srid, v_batch_count),
    'details', jsonb_build_object(
      'total_features', v_total_features,
      'source_srid', p_source_srid,
      'target_srid', p_target_srid,
      'batch_count', v_batch_count,
      'batch_size', p_batch_size
    )
  );

  -- Create collection and layer
  INSERT INTO feature_collections (name, project_file_id)
  VALUES (p_collection_name, p_project_file_id)
  RETURNING id INTO v_collection_id;

  INSERT INTO layers (name, collection_id, type)
  VALUES (p_collection_name, v_collection_id, 'vector')
  RETURNING id INTO v_layer_id;

  RAISE NOTICE 'Created collection % and layer %.', v_collection_id, v_layer_id;

  v_notices := v_notices || jsonb_build_object(
    'level', 'info',
    'message', 'Created collection and layer.',
    'details', jsonb_build_object(
      'collection_id', v_collection_id,
      'layer_id', v_layer_id
    )
  );

  -- Process features in batches
  FOR v_current_batch IN 0..v_batch_count-1 LOOP
    v_batch_start := v_current_batch * p_batch_size;
    v_batch_end := LEAST(v_batch_start + p_batch_size, v_total_features);

    RAISE NOTICE 'Processing batch % of % (features % to %)',
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
      v_properties := COALESCE(v_feature->'properties', '{}'::jsonb);

      -- Reset feature-specific variables
      v_lhn95_height := NULL;
      v_base_elevation_ellipsoidal := NULL;
      v_object_height := NULL;
      v_height_mode := NULL;
      v_height_source := NULL;
      v_vertical_datum_source := NULL;
      v_coords := NULL;
      v_raw_geometry := NULL;
      v_validated_geometry := NULL;
      v_geometry_2d := NULL;
      v_representative_point := NULL;
      lv95_easting := NULL;
      lv95_northing := NULL;

      -- Skip features without geometry
      IF v_feature->'geometry' IS NULL OR jsonb_typeof(v_feature->'geometry') = 'null' THEN
        RAISE WARNING 'Feature index % has null or missing geometry object. Skipping.', i;
        v_notices := v_notices || jsonb_build_object(
          'level', 'warning',
          'message', format('Feature index %s has null or missing geometry. Skipping.', i),
          'details', jsonb_build_object('feature_index', i)
        );
        v_skipped_count := v_skipped_count + 1;
        CONTINUE;
      END IF;

      BEGIN -- Start block for individual feature processing with exception handling

        -- 1. Parse geometry
        v_raw_geometry := ST_GeomFromGeoJSON(v_feature->'geometry');

        IF v_raw_geometry IS NULL THEN
          RAISE WARNING 'ST_GeomFromGeoJSON returned NULL for feature index %. Skipping.', i;
          v_notices := v_notices || jsonb_build_object(
            'level', 'error',
            'message', format('Failed to parse geometry for feature index %s. Skipping.', i),
            'details', jsonb_build_object(
              'feature_index', i,
              'geometry_json', v_feature->'geometry'
            )
          );
          v_failed_count := v_failed_count + 1; -- Count as failed
          CONTINUE;
        END IF;

        -- Set SRID on the raw geometry before validation uses it
        v_raw_geometry := ST_SetSRID(v_raw_geometry, p_source_srid);

        -- 2. Clean and Validate geometry
        -- Use ST_RemoveRepeatedPoints first, maybe slightly safer
        v_cleaned_geometry := ST_RemoveRepeatedPoints(v_raw_geometry, 0.0); -- Tolerance 0 removes only identical consecutive points
        IF NOT ST_Equals(v_cleaned_geometry, v_raw_geometry) THEN
          v_cleaned_count := v_cleaned_count + 1;
        END IF;

        IF NOT ST_IsValid(v_cleaned_geometry) THEN
           RAISE NOTICE 'Feature index % has invalid geometry, attempting repair. Reason: %', i, ST_IsValidReason(v_cleaned_geometry);
          BEGIN
            -- Try to repair using buffer(0) then MakeValid
            v_validated_geometry := ST_CollectionExtract(ST_MakeValid(ST_Buffer(v_cleaned_geometry, 0.0)), ST_Dimension(v_cleaned_geometry) + 1);

            IF v_validated_geometry IS NULL OR ST_IsEmpty(v_validated_geometry) OR NOT ST_IsValid(v_validated_geometry) THEN
              -- If still invalid or empty after repair, fail this feature
               RAISE WARNING 'Failed to repair invalid geometry for feature index %. Skipping.', i;
               v_failed_count := v_failed_count + 1;
               v_feature_errors := v_feature_errors || jsonb_build_object(
                 'feature_index', i,
                 'error', 'Failed to repair invalid geometry',
                 'invalid_reason', ST_IsValidReason(v_cleaned_geometry)
               );
               CONTINUE; -- Skip to next feature
            END IF;
            v_repaired_count := v_repaired_count + 1;
            RAISE NOTICE 'Feature index % geometry repaired.', i;
          EXCEPTION WHEN OTHERS THEN
            -- Catch errors during repair itself
             RAISE WARNING 'Exception during geometry repair for feature index %: %. Skipping.', i, SQLERRM;
             v_failed_count := v_failed_count + 1;
             v_feature_errors := v_feature_errors || jsonb_build_object(
               'feature_index', i,
               'error', 'Exception during geometry repair: ' || SQLERRM,
               'error_state', SQLSTATE,
               'invalid_reason', ST_IsValidReason(v_cleaned_geometry)
             );
             CONTINUE; -- Skip to next feature
          END;
        ELSE
          v_validated_geometry := v_cleaned_geometry; -- Use the cleaned geometry if it was valid
        END IF;


        -- 3. Extract Height Information (from validated geometry in original SRID)
        v_vertical_datum_source := CASE
          WHEN p_source_srid = 2056 THEN 'LHN95'
          WHEN p_source_srid = 4326 THEN 'WGS84' -- Assuming input 4326 Z is ellipsoidal
          -- Add other known source SRIDs and their vertical datums if needed
          ELSE 'EPSG:' || p_source_srid::TEXT -- Mark as unknown if SRID doesn't imply datum
        END;

        -- Try Z coordinate first if geometry is 3D
        IF ST_Is3D(v_validated_geometry) THEN
          v_height_source := 'z_coord (failed extraction)'; -- Default assumption
          BEGIN
            IF GeometryType(v_validated_geometry) = 'POINT' THEN
              v_lhn95_height := ST_Z(v_validated_geometry);
              v_height_source := 'z_coord';
            ELSIF GeometryType(v_validated_geometry) LIKE '%LINESTRING' THEN
              v_lhn95_height := ST_Z(ST_StartPoint(v_validated_geometry));
              v_height_source := 'z_coord';
            ELSIF GeometryType(v_validated_geometry) LIKE '%POLYGON' THEN
              v_lhn95_height := ST_Z(ST_PointN(ST_ExteriorRing(v_validated_geometry), 1));
              v_height_source := 'z_coord';
            END IF;
            -- Handle Multi geometries if necessary, might need ST_GeometryN
          EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Could not extract Z coordinate for feature index %: %', i, SQLERRM;
            v_lhn95_height := NULL;
          END;
          IF v_lhn95_height IS NULL THEN v_height_source := NULL; END IF; -- Reset source if extraction failed
        END IF;

        -- If no height from Z, try attributes
        IF v_lhn95_height IS NULL THEN
           DECLARE
             h_mean FLOAT := (v_properties->>'H_MEAN')::FLOAT;
             hoehe FLOAT  := (v_properties->>'HOEHE')::FLOAT;
             z_val FLOAT  := (v_properties->>'Z_Value')::FLOAT;
             alt FLOAT    := (v_properties->>'Altitude')::FLOAT;
             -- Height/height are more likely object height, check last
             height FLOAT := (v_properties->>'height')::FLOAT;
             height_uc FLOAT := (v_properties->>'HEIGHT')::FLOAT;
           BEGIN
              v_lhn95_height := COALESCE(h_mean, hoehe, z_val, alt, height, height_uc);

              IF v_lhn95_height IS NOT NULL THEN
                 -- Determine which attribute succeeded
                 IF h_mean IS NOT NULL THEN v_height_source := 'attribute:H_MEAN';
                 ELSIF hoehe IS NOT NULL THEN v_height_source := 'attribute:HOEHE';
                 ELSIF z_val IS NOT NULL THEN v_height_source := 'attribute:Z_Value';
                 ELSIF alt IS NOT NULL THEN v_height_source := 'attribute:Altitude';
                 ELSIF height IS NOT NULL THEN v_height_source := 'attribute:height';
                 ELSIF height_uc IS NOT NULL THEN v_height_source := 'attribute:HEIGHT';
                 ELSE v_height_source := 'attribute:unknown'; -- Should not happen if v_lhn95_height is not null
                 END IF;
              END IF;
           END;
        END IF;

        -- Extract object height from properties (use different attributes potentially)
        v_object_height := COALESCE(
           (v_properties->>'object_height')::float,
           (v_properties->>'obj_height')::float,
           (v_properties->>'OBJ_HOEHE')::float,
           (v_properties->>'height')::float, -- lowercase 'height' often object height
           (v_properties->>'HEIGHT')::float -- uppercase 'HEIGHT' might be base or object depending on source
           -- Add other potential attribute names for object height
        );
        -- If base height source was Z or an attribute like H_MEAN, and object_height is null,
        -- check if 'HEIGHT' attribute might contain object height
         IF v_object_height IS NULL AND v_height_source != 'attribute:HEIGHT' AND v_height_source != 'attribute:height' THEN
            v_object_height := (v_properties->>'HEIGHT')::float;
         END IF;


        -- 4. Get Representative Point (in original SRID) for API call if needed
        IF p_source_srid = 2056 AND v_lhn95_height IS NOT NULL THEN
            BEGIN
                -- Using ST_PointOnSurface ensures point is within polygon/multipolygon
                v_representative_point := ST_PointOnSurface(v_validated_geometry);
                IF v_representative_point IS NULL THEN
                   RAISE WARNING 'Could not get representative point (ST_PointOnSurface failed) for feature index %. Using centroid.', i;
                   v_representative_point := ST_Centroid(v_validated_geometry);
                END IF;
                lv95_easting := ST_X(v_representative_point);
                lv95_northing := ST_Y(v_representative_point);
            EXCEPTION WHEN OTHERS THEN
                RAISE WARNING 'Exception getting representative point for feature index %: %. Cannot transform height.', i, SQLERRM;
                lv95_easting := NULL;
                lv95_northing := NULL;
            END;
        END IF;


        -- 5. Transform Footprint to WGS84 2D (EPSG:4326)
        BEGIN
          v_geometry_2d := ST_Force2D(ST_Transform(v_validated_geometry, 4326));
        EXCEPTION WHEN OTHERS THEN
           RAISE WARNING 'Exception during ST_Transform for feature index %: %. Skipping.', i, SQLERRM;
           v_failed_count := v_failed_count + 1;
           v_feature_errors := v_feature_errors || jsonb_build_object(
             'feature_index', i,
             'error', 'Exception during ST_Transform: ' || SQLERRM,
             'error_state', SQLSTATE
           );
           CONTINUE; -- Skip to next feature
        END;

        IF v_geometry_2d IS NULL OR ST_IsEmpty(v_geometry_2d) THEN
          RAISE WARNING 'ST_Transform resulted in NULL or empty geometry for feature index %. Skipping.', i;
           v_failed_count := v_failed_count + 1;
           v_feature_errors := v_feature_errors || jsonb_build_object(
             'feature_index', i,
             'error', 'ST_Transform resulted in NULL or empty geometry'
           );
           CONTINUE; -- Skip to next feature
        END IF;


        -- 6. Calculate WGS84 Ellipsoidal Height via API if applicable
        IF p_source_srid = 2056 AND v_lhn95_height IS NOT NULL AND lv95_easting IS NOT NULL AND lv95_northing IS NOT NULL THEN
          RAISE NOTICE 'Calling Swisstopo API for feature index % (E:%, N:%, H:%)', i, lv95_easting, lv95_northing, v_lhn95_height;
          v_coords := public.transform_swiss_coords_swisstopo(lv95_easting, lv95_northing, v_lhn95_height);

          IF v_coords IS NOT NULL AND jsonb_typeof(v_coords) = 'object' AND v_coords ? 'ell_height' THEN
            v_base_elevation_ellipsoidal := (v_coords->>'ell_height')::float;
            -- Optionally verify lon/lat match the transformed geometry's point?
            -- lon_api := (v_coords->>'lon')::float; lat_api := (v_coords->>'lat')::float;
            -- rep_point_wgs84 := ST_Transform(v_representative_point, 4326);
            -- IF ST_Distance(ST_MakePoint(lon_api, lat_api), rep_point_wgs84) > 0.001 THEN ... WARN ... END IF;
            v_height_mode := 'absolute_ellipsoidal';
            RAISE NOTICE 'API success for feature index %. Ellipsoidal Height: %', i, v_base_elevation_ellipsoidal;
          ELSE
            RAISE WARNING 'Swisstopo API call failed or returned invalid data for feature index %. Result: %', i, v_coords;
            -- Keep v_base_elevation_ellipsoidal as NULL, height_mode remains NULL
            v_height_source := v_height_source || ' (API Failed)'; -- Append failure info
          END IF;
        ELSIF v_lhn95_height IS NOT NULL AND v_vertical_datum_source = 'WGS84' THEN
           -- Input was likely WGS84 3D, assume Z was ellipsoidal height
           v_base_elevation_ellipsoidal := v_lhn95_height; -- Use the extracted Z value directly
           v_height_mode := 'absolute_ellipsoidal';
        ELSIF v_lhn95_height IS NOT NULL THEN
           -- Height found, but datum unknown or not transformable by this function
            RAISE NOTICE 'Feature index % has height % from source % but datum % is not configured for transformation.', i, v_lhn95_height, v_height_source, v_vertical_datum_source;
            -- Store the height value but leave mode null? Or maybe store it anyway? For now, leave null.
            -- v_base_elevation_ellipsoidal := v_lhn95_height;
            -- v_height_mode := 'unknown_datum';
        END IF;


        -- 7. Insert feature with calculated values
        INSERT INTO public.geo_features (
          layer_id,
          collection_id, -- Make sure collection_id is in the table if needed
          properties,
          srid, -- Store the target SRID used for properties/context
          geometry_2d,
          base_elevation_ellipsoidal,
          object_height,
          height_mode,
          height_source,
          vertical_datum_source
        ) VALUES (
          v_layer_id,
          v_collection_id,
          v_properties,
          p_target_srid, -- Store the requested target SRID
          v_geometry_2d,
          v_base_elevation_ellipsoidal,
          v_object_height,
          v_height_mode,
          v_height_source,
          v_vertical_datum_source
        );

        v_imported_count := v_imported_count + 1;

      EXCEPTION WHEN OTHERS THEN
        -- Catch any unexpected error during the processing of this feature
        v_failed_count := v_failed_count + 1;
        RAISE WARNING '[Feature % Error] % (State: %)', i, SQLERRM, SQLSTATE;
        v_feature_errors := v_feature_errors || jsonb_build_object(
          'feature_index', i,
          'error', SQLERRM,
          'error_state', SQLSTATE
          -- Add more context here if possible, e.g., properties
        );
      END; -- End block for individual feature processing
    END LOOP; -- End loop for features in batch
  END LOOP; -- End loop for batches

  -- Prepare debug info
  v_debug_info := jsonb_build_object(
    'repaired_count', v_repaired_count,
    'cleaned_count', v_cleaned_count,
    'skipped_count', v_skipped_count,
    -- 'dimension_fixes', v_dimension_fixes, -- Obsolete counter
    'feature_errors', v_feature_errors,
    'notices', v_notices
  );

  RAISE NOTICE 'Import finished. Imported: %, Failed: %, Repaired: %, Cleaned: %, Skipped: %',
     v_imported_count, v_failed_count, v_repaired_count, v_cleaned_count, v_skipped_count;

  -- Return results
  RETURN QUERY SELECT
    v_collection_id,
    v_layer_id,
    v_imported_count,
    v_failed_count,
    v_debug_info;
END;
$$;