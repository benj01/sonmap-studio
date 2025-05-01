-- Create trigger_set_timestamp function
CREATE OR REPLACE FUNCTION public.trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create handle_new_user function for Supabase auth trigger
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public -- Ensure it can find public.profiles
    AS $$
begin
    insert into public.profiles (id)
    values (new.id);
    return new;
end;
$$;

-- Create set_uploaded_by function for project files
CREATE OR REPLACE FUNCTION public.set_uploaded_by() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER -- Needs definer to access auth.uid() reliably in triggers
    AS $$
BEGIN
  NEW.uploaded_by = auth.uid();
  RETURN NEW;
END;
$$;

-- Create delete_shapefile_companions function
CREATE OR REPLACE FUNCTION public.delete_shapefile_companions() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Delete all companion files referencing the deleted main file
    DELETE FROM public.project_files
    WHERE main_file_id = OLD.id;

    RETURN OLD; -- Required for AFTER DELETE trigger
END;
$$;

-- Create update_project_storage function
CREATE OR REPLACE FUNCTION public.update_project_storage() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER -- Use definer if RLS might block direct update by user
    SET search_path = public -- Ensure visibility of projects and project_files
    AS $$
DECLARE
  v_project_id uuid;
BEGIN
  -- Determine project_id based on INSERT or DELETE
  IF TG_OP = 'INSERT' THEN
    v_project_id := NEW.project_id;
  ELSIF TG_OP = 'DELETE' THEN
    v_project_id := OLD.project_id;
  ELSE -- Should not happen for INSERT/DELETE triggers
    RAISE WARNING 'update_project_storage trigger called for unhandled TG_OP: %', TG_OP;
    RETURN NULL;
  END IF;

  -- Update the projects table with the new total storage
  UPDATE public.projects
  SET storage_used = COALESCE((
      SELECT SUM(pf.size)
      FROM public.project_files pf
      WHERE pf.project_id = v_project_id
    ), 0) -- Ensure storage is 0 if no files remain
  WHERE id = v_project_id;

  -- Return appropriate value based on operation
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NULL; -- Should not be reached
END;
$$;

-- Create process_feature_geometry function (Corrected - No GOTO)
CREATE OR REPLACE FUNCTION public.process_feature_geometry(
    p_feature_id uuid,
    p_target_ellipsoidal_height double precision,
    p_display_object_height double precision,
    p_display_height_mode text,
    p_calculation_log_entry jsonb,
    p_status text,
    p_error_message text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_geometry_original geometry;
    v_geometry_wgs84 geometry := NULL; -- Initialize to NULL
    v_transformed_xy geometry;
    v_final_z double precision;
    v_current_status text := p_status; -- Use a local variable for status changes
    v_current_error text := p_error_message;
BEGIN
    -- Only attempt geometry processing if the incoming status is not 'failed'
    IF v_current_status != 'failed' THEN
        -- Fetch original geometry
        SELECT geometry_original INTO v_geometry_original
        FROM public.geo_features
        WHERE id = p_feature_id;

        -- Check if original geometry exists
        IF v_geometry_original IS NULL THEN
            v_current_status := 'failed';
            v_current_error := 'Original geometry not found';
        ELSE
            -- Perform horizontal transformation
            BEGIN
                v_transformed_xy := ST_Transform(v_geometry_original, 4326);
            EXCEPTION WHEN OTHERS THEN
                v_current_status := 'failed';
                v_current_error := 'ST_Transform failed: ' || SQLERRM;
            END;

            -- Proceed only if transform succeeded
            IF v_current_status != 'failed' THEN
                -- Determine final Z value based on mode
                IF p_display_height_mode = 'clamp_to_ground' THEN
                    v_final_z := 0.0;
                ELSE
                    -- Use provided target height, default to 0 if NULL for absolute/relative
                    v_final_z := COALESCE(p_target_ellipsoidal_height, 0.0);
                END IF;

                -- Create final 3D WGS84 geometry
                BEGIN
                    -- Ensure transformed_xy is not null before forcing 3D
                    IF v_transformed_xy IS NOT NULL THEN
                         v_geometry_wgs84 := ST_Force3D(v_transformed_xy, v_final_z);
                    ELSE
                         -- This case should ideally be caught by ST_Transform exception,
                         -- but adding safety check.
                         RAISE EXCEPTION 'Transformed XY geometry is NULL after successful ST_Transform';
                    END IF;
                EXCEPTION WHEN OTHERS THEN
                    v_current_status := 'failed';
                    v_current_error := 'ST_Force3D failed: ' || SQLERRM;
                    v_geometry_wgs84 := NULL; -- Ensure geom is null on failure
                END;

                 -- If we reached here without errors, mark as complete
                IF v_current_status != 'failed' THEN
                     v_current_status := 'complete';
                     v_current_error := NULL; -- Clear error if completed successfully
                END IF;

            END IF; -- End if transform succeeded
        END IF; -- End if original geometry exists
    END IF; -- End if incoming status was not 'failed'

    -- Always Update feature record with final status and geometry (which might be NULL)
    UPDATE public.geo_features
    SET
        geometry_wgs84 = v_geometry_wgs84, -- Will be NULL if any processing step failed
        display_base_elevation = CASE WHEN v_current_status = 'complete' THEN p_target_ellipsoidal_height ELSE NULL END,
        display_object_height = p_display_object_height,
        display_height_mode = p_display_height_mode,
        height_calculation_log = COALESCE(p_calculation_log_entry, '{}'::jsonb),
        height_transformation_status = v_current_status,
        height_transformation_error = v_current_error,
        height_transformed_at = timezone('utc', now())
    WHERE id = p_feature_id;

END;
$$;

-- Create import_geo_features_with_transform function
CREATE OR REPLACE FUNCTION public.import_geo_features_with_transform(
    p_project_file_id uuid,
    p_collection_name text,
    p_features jsonb,
    p_source_srid integer,
    p_target_srid integer DEFAULT 4326, -- Note: p_target_srid is unused here, kept for signature consistency maybe
    p_batch_size integer DEFAULT 1000
) RETURNS TABLE(
    collection_id uuid,
    layer_id uuid,
    imported_count integer,
    failed_count integer,
    debug_info jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_collection_id uuid;
    v_layer_id uuid;
    v_imported_count integer := 0;
    v_failed_count integer := 0;
    v_feature jsonb;
    v_geometry geometry; -- Holds original geometry during processing
    v_original_vertical_datum_id uuid;
    v_original_has_z boolean;
    v_feature_errors jsonb := '[]'::jsonb;
    v_notices jsonb := '[]'::jsonb;
    v_debug_info jsonb;
    v_total_features integer;
    v_batch_start integer;
    v_batch_end integer;
    -- Removed v_batch_size local, using p_batch_size directly
    v_batch_count integer;
    v_current_batch integer;
    v_vertical_datum_name text;
BEGIN
    -- Validate input parameters
    IF p_project_file_id IS NULL THEN
        RAISE EXCEPTION 'project_file_id cannot be null';
    END IF;

    IF p_features IS NULL OR jsonb_array_length(p_features) = 0 THEN
        RAISE EXCEPTION 'features array cannot be null or empty';
    END IF;

    -- Get total feature count and log start
    v_total_features := jsonb_array_length(p_features);
    v_batch_count := CEIL(v_total_features::float / p_batch_size);
    v_current_batch := 0;

    RAISE NOTICE 'Starting import of % features with SRID % in % batches',
        v_total_features, p_source_srid, v_batch_count;

    -- Create collection and layer
    BEGIN
        INSERT INTO public.feature_collections (name, project_file_id)
        VALUES (p_collection_name, p_project_file_id)
        RETURNING id INTO v_collection_id;

        INSERT INTO public.layers (name, collection_id, type)
        VALUES (p_collection_name, v_collection_id, 'vector') -- Assuming vector for now
        RETURNING id INTO v_layer_id;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Failed to create collection/layer: % (State: %)', SQLERRM, SQLSTATE;
    END;

    -- Process features in batches
    FOR v_current_batch IN 0..v_batch_count-1 LOOP
        v_batch_start := v_current_batch * p_batch_size;
        v_batch_end := LEAST(v_batch_start + p_batch_size, v_total_features); -- Corrected batch end logic

        FOR i IN v_batch_start..v_batch_end-1 LOOP
            v_feature := p_features->i;
            v_original_vertical_datum_id := NULL; -- Reset for each feature
            v_vertical_datum_name := NULL; -- Reset for each feature

            BEGIN
                -- Process geometry
                v_geometry := ST_GeomFromGeoJSON(v_feature->>'geometry');
                IF v_geometry IS NULL THEN
                    RAISE EXCEPTION 'Failed to create geometry from GeoJSON';
                END IF;

                -- Set source SRID
                v_geometry := ST_SetSRID(v_geometry, p_source_srid);

                -- Clean geometry (optional but good practice)
                -- v_geometry := ST_MakeValid(ST_RemoveRepeatedPoints(v_geometry));
                -- Consider adding ST_MakeValid if needed, but be aware of potential geometry changes

                -- Check if geometry has Z values
                v_original_has_z := ST_NDims(v_geometry) = 3;

                -- Determine vertical datum based on source SRID and EPSG code
                IF v_original_has_z THEN
                    -- First try to find a vertical datum by EPSG code
                    SELECT id, name INTO v_original_vertical_datum_id, v_vertical_datum_name
                    FROM public.vertical_datums
                    WHERE epsg_code = p_source_srid;

                    -- If no match by EPSG code, try to infer from common SRIDs
                    IF v_original_vertical_datum_id IS NULL THEN
                        SELECT id, name INTO v_original_vertical_datum_id, v_vertical_datum_name
                        FROM public.vertical_datums
                        WHERE CASE
                            WHEN p_source_srid = 2056 THEN name = 'LHN95'
                            WHEN p_source_srid = 4326 THEN name = 'WGS84 Ellipsoid'
                            WHEN p_source_srid BETWEEN 32601 AND 32660 THEN name = 'EGM2008 Geoid' -- Assuming EGM2008 for UTM N
                            WHEN p_source_srid BETWEEN 32701 AND 32760 THEN name = 'EGM2008 Geoid' -- Assuming EGM2008 for UTM S
                            -- Add more cases as needed
                            ELSE NULL
                        END;
                    END IF;

                    -- Log if we couldn't determine the vertical datum
                    IF v_original_vertical_datum_id IS NULL THEN
                         -- Store notice instead of raising warning which might interrupt transaction
                         v_notices := v_notices || jsonb_build_object(
                            'level', 'warning',
                            'message', format('Could not determine vertical datum for feature %s with SRID %s', i, p_source_srid),
                            'feature_index', i
                         );
                    END IF;
                END IF; -- End if v_original_has_z

                -- Insert feature using the NEW schema
                INSERT INTO public.geo_features (
                    layer_id,
                    collection_id,
                    geometry_original, -- Store original geometry
                    original_srid,
                    original_has_z,
                    original_vertical_datum_id,
                    attributes, -- Store properties/attributes here
                    height_transformation_status -- Set initial status
                    -- geometry_wgs84, display_*, etc. are left NULL/default
                ) VALUES (
                    v_layer_id,
                    v_collection_id,
                    v_geometry, -- The original geometry with original SRID
                    p_source_srid,
                    v_original_has_z,
                    v_original_vertical_datum_id,
                    COALESCE(v_feature->'properties', '{}'::jsonb), -- Use 'attributes' key if sent, else 'properties'
                    'pending'
                );

                v_imported_count := v_imported_count + 1;

            EXCEPTION WHEN OTHERS THEN
                v_failed_count := v_failed_count + 1;
                v_feature_errors := v_feature_errors || jsonb_build_object(
                    'feature_index', i,
                    'error', SQLERRM,
                    'error_state', SQLSTATE
                );
            END; -- End BEGIN block for single feature processing
        END LOOP; -- End loop for features in batch
    END LOOP; -- End loop for batches

    -- Verify we have imported at least one feature (check moved outside loop)
    IF v_imported_count = 0 AND v_total_features > 0 THEN
        -- Clean up if no features were imported but some were expected
        -- Note: This runs even if some failed; only deletes if ZERO succeeded.
        DELETE FROM public.layers WHERE id = v_layer_id;
        DELETE FROM public.feature_collections WHERE id = v_collection_id;
        RAISE EXCEPTION 'No features were successfully imported. Failed count: %. Last error: %',
            v_failed_count,
            (SELECT error FROM jsonb_array_elements(v_feature_errors) ORDER BY (value->>'feature_index')::int DESC LIMIT 1);
    END IF;

    -- Prepare debug info
    v_debug_info := jsonb_build_object(
        'feature_errors', v_feature_errors,
        'notices', v_notices,
        'source_srid', p_source_srid,
        'target_srid', p_target_srid, -- Include target SRID for info, even if unused here
        'total_features', v_total_features,
        'imported_count', v_imported_count,
        'failed_count', v_failed_count
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

-- Function to get features as a single GeoJSON FeatureCollection
CREATE OR REPLACE FUNCTION public.get_layer_features_geojson(p_layer_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
DECLARE
    v_features jsonb;
    v_feature_count integer;
BEGIN
    -- First check if the layer exists and has features
    SELECT COUNT(*) INTO v_feature_count
    FROM public.geo_features gf
    WHERE gf.layer_id = p_layer_id;

    -- If no features found, return empty FeatureCollection
    IF v_feature_count = 0 THEN
        RETURN jsonb_build_object(
            'type', 'FeatureCollection',
            'features', '[]'::jsonb
        );
    END IF;

    -- Build the FeatureCollection with safety checks
    SELECT jsonb_build_object(
        'type', 'FeatureCollection',
        'features', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'type', 'Feature',
                    'id', gf.id,
                    'geometry', COALESCE(ST_AsGeoJSON(gf.geometry_wgs84)::jsonb, 'null'::jsonb),
                    'properties', COALESCE(gf.attributes, '{}'::jsonb) -- Ensure properties is never null
                ) ORDER BY gf.id
            ) FILTER (WHERE gf.id IS NOT NULL), -- Filter out any null features
            '[]'::jsonb
        )
    )
    INTO v_features
    FROM public.geo_features gf
    WHERE gf.layer_id = p_layer_id;

    -- Ensure we always return a valid FeatureCollection
    RETURN COALESCE(v_features, jsonb_build_object(
        'type', 'FeatureCollection',
        'features', '[]'::jsonb
    ));
END;
$$;

-- Function to get features as individual rows
CREATE OR REPLACE FUNCTION public.get_layer_features(p_layer_id uuid) RETURNS TABLE(id uuid, properties jsonb, geojson text, srid integer)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        f.id,
        f.attributes as properties,
        ST_AsGeoJSON(f.geometry_wgs84) as geojson,
        4326 as srid
    FROM public.geo_features f
    WHERE f.layer_id = p_layer_id;
END;
$$;

-- Function to get available layers with their metadata
CREATE OR REPLACE FUNCTION public.get_available_layers() RETURNS TABLE(layer_id uuid, layer_name text, feature_count bigint, bounds jsonb, properties jsonb)
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public', 'extensions'
    AS $$
BEGIN
    RETURN QUERY
    WITH layer_stats AS (
        SELECT
            l.id,
            l.name,
            COUNT(gf.id) as feature_count,
            CASE
                WHEN COUNT(gf.id) > 0 THEN
                    jsonb_build_object(
                        'bbox', ST_AsGeoJSON(ST_Extent(gf.geometry_wgs84))::jsonb,
                        'center', jsonb_build_object(
                            'lng', ST_X(ST_Centroid(ST_Extent(gf.geometry_wgs84))),
                            'lat', ST_Y(ST_Centroid(ST_Extent(gf.geometry_wgs84)))
                        )
                    )
                ELSE NULL
            END as bounds,
            l.properties
        FROM
            public.layers l
            LEFT JOIN public.geo_features gf ON l.id = gf.layer_id
        GROUP BY
            l.id, l.name, l.properties
    )
    SELECT
        ls.id,
        ls.name,
        ls.feature_count,
        ls.bounds,
        ls.properties
    FROM layer_stats ls
    ORDER BY ls.name;
END;
$$;

-- Add comments for better documentation
COMMENT ON FUNCTION public.trigger_set_timestamp IS 'Sets the updated_at column to the current UTC timestamp whenever a row is updated.';
COMMENT ON FUNCTION public.process_feature_geometry IS 'Processes a feature''s geometry by performing horizontal transformation to WGS84 and applying the specified height configuration. Updates the feature record with the transformed geometry and height-related metadata.';
COMMENT ON FUNCTION public.import_geo_features_with_transform IS 'Imports geospatial features into the geo_features table with support for the new schema including vertical datum handling. Features are stored in their original coordinate system and vertical datum, with transformation deferred to a separate process.';
COMMENT ON FUNCTION public.get_layer_features_geojson(uuid) IS 'Retrieves all features for a given layer ID as a single GeoJSON FeatureCollection (using WGS84 geometry). Ensures properties are never null and handles edge cases safely.';
COMMENT ON FUNCTION public.get_layer_features(uuid) IS 'Retrieves all features for a given layer ID as individual rows with GeoJSON geometry (using WGS84 geometry).';
COMMENT ON FUNCTION public.get_available_layers() IS 'Retrieves a list of all available layers with their feature count, bounding box, and properties.'; 