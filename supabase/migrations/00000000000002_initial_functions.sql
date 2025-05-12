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

-- Create update_feature_height function (renamed from process_feature_geometry)
CREATE OR REPLACE FUNCTION public.update_feature_height(
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
    v_existing_geom_wgs84 geometry;
    v_new_geometry_wgs84 geometry;
    v_final_z double precision;
    v_current_status text := p_status;
    v_current_error text := p_error_message;
BEGIN
    -- Only attempt height update if the incoming status is not 'failed'
    IF v_current_status != 'failed' THEN
        -- Fetch existing WGS84 geometry
        SELECT geometry_wgs84 INTO v_existing_geom_wgs84
        FROM public.geo_features
        WHERE id = p_feature_id;

        -- Check if existing geometry exists
        IF v_existing_geom_wgs84 IS NULL THEN
            v_current_status := 'failed';
            v_current_error := 'Existing WGS84 geometry not found';
        ELSE
            -- Determine final Z value based on mode
            IF p_display_height_mode = 'clamp_to_ground' THEN
                v_final_z := 0.0;
            ELSE
                -- Use provided target height, default to 0 if NULL for absolute/relative
                v_final_z := COALESCE(p_target_ellipsoidal_height, 0.0);
            END IF;

            -- Apply new Z value to existing geometry
            BEGIN
                v_new_geometry_wgs84 := ST_Force3D(v_existing_geom_wgs84, v_final_z);
            EXCEPTION WHEN OTHERS THEN
                v_current_status := 'failed';
                v_current_error := 'ST_Force3D failed: ' || SQLERRM;
                v_new_geometry_wgs84 := NULL;
            END;

            -- If we reached here without errors, mark as complete
            IF v_current_status != 'failed' THEN
                v_current_status := 'complete';
                v_current_error := NULL;
            END IF;
        END IF;
    END IF;

    -- Update feature record with final status and geometry
    UPDATE public.geo_features
    SET
        geometry_wgs84 = v_new_geometry_wgs84,
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
    p_target_srid integer DEFAULT 4326,
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
    v_geometry geometry;
    v_transformed_xy geometry;
    v_initial_geom_wgs84 geometry;
    v_original_vertical_datum_id uuid;
    v_original_has_z boolean;
    v_feature_errors jsonb := '[]'::jsonb;
    v_notices jsonb := '[]'::jsonb;
    v_debug_info jsonb;
    v_total_features integer;
    v_batch_start integer;
    v_batch_end integer;
    v_batch_count integer;
    v_current_batch integer;
    v_vertical_datum_name text;
    v_feature_index integer;
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
        VALUES (p_collection_name, v_collection_id, 'vector')
        RETURNING id INTO v_layer_id;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Failed to create collection/layer: % (State: %)', SQLERRM, SQLSTATE;
    END;

    -- Process features in batches
    FOR v_current_batch IN 0..v_batch_count-1 LOOP
        v_batch_start := v_current_batch * p_batch_size;
        v_batch_end := LEAST(v_batch_start + p_batch_size, v_total_features);

        -- Process each feature in the current batch
        FOR v_feature_index IN v_batch_start..v_batch_end-1 LOOP
            v_feature := p_features->v_feature_index;
            BEGIN
                -- Extract and validate geometry
                v_geometry := ST_SetSRID(ST_GeomFromGeoJSON(v_feature->>'geometry'), p_source_srid);
                IF v_geometry IS NULL THEN
                    RAISE EXCEPTION 'Invalid geometry in feature';
                END IF;

                -- Store original geometry properties
                v_original_has_z := ST_NDims(v_geometry) = 3; -- <<< CORRECT FUNCTION & LOGIC

                -- Determine vertical datum based on source SRID
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
                        v_notices := v_notices || jsonb_build_object(
                            'level', 'warning',
                            'message', format('Could not determine vertical datum for feature %s with SRID %s', v_feature_index, p_source_srid),
                            'feature_index', v_feature_index
                        );
                    END IF;
                END IF;

                -- Perform horizontal transformation
                BEGIN
                    v_transformed_xy := ST_Transform(v_geometry, 4326);
                EXCEPTION WHEN OTHERS THEN
                    RAISE EXCEPTION 'ST_Transform failed: %', SQLERRM;
                END;

                -- Create initial WGS84 geometry with Z=0
                BEGIN
                    v_initial_geom_wgs84 := ST_Force3D(v_transformed_xy, 0.0);
                EXCEPTION WHEN OTHERS THEN
                    RAISE EXCEPTION 'ST_Force3D failed: %', SQLERRM;
                END;

                   -- Insert the feature with initial Z=0 (CORRECTED)
                INSERT INTO public.geo_features (
                    layer_id,                       -- Order matters slightly but names are key
                    collection_id,
                    geometry_original,
                    original_srid,
                    original_has_z,
                    original_vertical_datum_id,
                    attributes,                     -- Changed from properties in original schema refactor
                    geometry_wgs84,                 -- Insert the initial transformed geometry
                    height_transformation_status,   -- Use allowed status value
                    display_height_mode             -- Set initial mode
                    -- display_base_elevation defaults to NULL, no need to specify unless non-NULL
                ) VALUES (
                    v_layer_id,
                    v_collection_id,
                    v_geometry,                     -- Original geometry with original SRID
                    p_source_srid,
                    v_original_has_z,
                    v_original_vertical_datum_id,
                    COALESCE(v_feature->'properties', '{}'::jsonb), -- Use 'properties' from GeoJSON as attributes
                    v_initial_geom_wgs84,           -- The XY transformed geom with Z=0
                    'pending',                      -- <<< CORRECT STATUS ('pending' is allowed)
                    'clamp_to_ground'               -- Set initial display mode
                );

                v_imported_count := v_imported_count + 1;

            EXCEPTION WHEN OTHERS THEN
                v_failed_count := v_failed_count + 1;
                v_feature_errors := v_feature_errors || jsonb_build_object(
                    'feature_index', v_feature_index,
                    'error', SQLERRM
                );
            END;
        END LOOP;
    END LOOP;

    -- Prepare debug info
    v_debug_info := jsonb_build_object(
        'feature_errors', v_feature_errors,
        'notices', v_notices,
        'total_features', v_total_features,
        'batch_size', p_batch_size,
        'batch_count', v_batch_count
    );

    -- Return results
    RETURN QUERY
    SELECT
        v_collection_id,
        v_layer_id,
        v_imported_count,
        v_failed_count,
        v_debug_info;
END;
$$;

-- Create get_layer_features_geojson function
CREATE OR REPLACE FUNCTION public.get_layer_features_geojson(p_layer_id uuid) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_features jsonb;
BEGIN
    SELECT jsonb_build_object(
        'type', 'FeatureCollection',
        'features', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'type', 'Feature',
                    'geometry', ST_AsGeoJSON(geometry_wgs84)::jsonb,
                    'properties', attributes
                )
            ),
            '[]'::jsonb
        )
    )
    INTO v_features
    FROM public.geo_features
    WHERE layer_id = p_layer_id;

    RETURN v_features;
END;
$$;

-- Create get_layer_features function
CREATE OR REPLACE FUNCTION public.get_layer_features(p_layer_id uuid) RETURNS TABLE(
    id uuid,
    properties jsonb,
    geojson text,
    srid integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    RETURN QUERY
    SELECT
        gf.id,
        gf.attributes as properties,
        ST_AsGeoJSON(gf.geometry_wgs84)::text as geojson,
        4326 as srid  -- Always return 4326 since geometry_wgs84 is in WGS84
    FROM public.geo_features gf
    WHERE gf.layer_id = p_layer_id;
END;
$$;

-- Create get_available_layers function
CREATE OR REPLACE FUNCTION public.get_available_layers() RETURNS TABLE(
    layer_id uuid,
    layer_name text,
    feature_count bigint,
    bounds jsonb,
    properties jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    RETURN QUERY
    WITH layer_extents AS (
        SELECT 
            l.id,
            l.name,
            l.type,
            l.collection_id,
            COUNT(gf.id)::bigint as feature_count,
            ST_Extent(gf.geometry_wgs84) as extent
        FROM public.layers l
        LEFT JOIN public.geo_features gf ON gf.layer_id = l.id
        GROUP BY l.id, l.name, l.type, l.collection_id
    )
    SELECT
        le.id as layer_id,
        le.name as layer_name,
        le.feature_count,
        COALESCE(
            jsonb_build_object(
                'type', 'Polygon',
                'coordinates', ARRAY[ARRAY[
                    ARRAY[ST_XMin(le.extent), ST_YMin(le.extent)],
                    ARRAY[ST_XMax(le.extent), ST_YMin(le.extent)],
                    ARRAY[ST_XMax(le.extent), ST_YMax(le.extent)],
                    ARRAY[ST_XMin(le.extent), ST_YMax(le.extent)],
                    ARRAY[ST_XMin(le.extent), ST_YMin(le.extent)]
                ]]
            ),
            '{}'::jsonb
        ) as bounds,
        jsonb_build_object(
            'type', le.type,
            'collection_id', le.collection_id
        ) as properties
    FROM layer_extents le;
END;
$$;

-- Add comments for better documentation
COMMENT ON FUNCTION public.trigger_set_timestamp IS 'Sets the updated_at column to the current UTC timestamp whenever a row is updated.';
COMMENT ON FUNCTION public.update_feature_height IS 'Updates a feature''s height by applying the specified Z value to its existing WGS84 geometry. Updates the feature record with the new geometry and height-related metadata.';
COMMENT ON FUNCTION public.import_geo_features_with_transform IS 'Imports geospatial features into the geo_features table. Performs horizontal transformation to WGS84 during import, with Z values set to 0. Height updates are handled separately through update_feature_height.';
COMMENT ON FUNCTION public.get_layer_features_geojson(uuid) IS 'Retrieves all features for a given layer ID as a single GeoJSON FeatureCollection (using WGS84 geometry). Ensures properties are never null and handles edge cases safely.';
COMMENT ON FUNCTION public.get_layer_features(uuid) IS 'Retrieves all features for a given layer ID as individual rows with GeoJSON geometry (using WGS84 geometry).';
COMMENT ON FUNCTION public.get_available_layers() IS 'Retrieves a list of all available layers with their feature count, bounding box, and properties.'; 