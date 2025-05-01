-- Drop existing function
DROP FUNCTION IF EXISTS public.import_geo_features_with_transform(uuid, text, jsonb, integer, integer, integer);
DROP FUNCTION IF EXISTS public.import_geo_features_with_transform(uuid, text, jsonb, integer, integer);

-- Create updated import function
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
    v_original_vertical_datum_id uuid;
    v_original_has_z boolean;
    v_feature_errors jsonb := '[]'::jsonb;
    v_notices jsonb := '[]'::jsonb;
    v_debug_info jsonb;
    v_total_features integer;
    v_batch_start integer;
    v_batch_end integer;
    v_batch_size integer;
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
    v_batch_size := p_batch_size;
    v_batch_count := CEIL(v_total_features::float / v_batch_size);
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
        v_batch_start := v_current_batch * v_batch_size;
        v_batch_end := LEAST((v_current_batch + 1) * v_batch_size, v_total_features);

        FOR i IN v_batch_start..v_batch_end-1 LOOP
            v_feature := p_features->i;
            
            BEGIN
                -- Process geometry
                v_geometry := ST_GeomFromGeoJSON(v_feature->>'geometry');
                IF v_geometry IS NULL THEN
                    RAISE EXCEPTION 'Failed to create geometry from GeoJSON';
                END IF;

                -- Set source SRID
                v_geometry := ST_SetSRID(v_geometry, p_source_srid);

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
                            WHEN p_source_srid IN (32632, 32633, 32634, 32635, 32636, 32637, 32638, 32639, 32640, 32641, 32642, 32643, 32644, 32645, 32646, 32647, 32648, 32649, 32650, 32651, 32652, 32653, 32654, 32655, 32656, 32657, 32658, 32659, 32660) THEN name = 'EGM2008 Geoid'
                            ELSE NULL
                        END;
                    END IF;

                    -- Log if we couldn't determine the vertical datum
                    IF v_original_vertical_datum_id IS NULL THEN
                        RAISE WARNING 'Could not determine vertical datum for SRID % with Z values', p_source_srid;
                    END IF;
                ELSE
                    v_original_vertical_datum_id := NULL;
                    v_vertical_datum_name := NULL;
                END IF;

                -- Insert feature with new schema
                INSERT INTO public.geo_features (
                    layer_id,
                    collection_id,
                    geometry_original,
                    original_srid,
                    original_has_z,
                    original_vertical_datum_id,
                    attributes,
                    height_transformation_status
                ) VALUES (
                    v_layer_id,
                    v_collection_id,
                    v_geometry,
                    p_source_srid,
                    v_original_has_z,
                    v_original_vertical_datum_id,
                    COALESCE(v_feature->'properties', '{}'::jsonb),
                    'pending'
                );

                v_imported_count := v_imported_count + 1;
                
                -- Add success notice
                v_notices := v_notices || jsonb_build_object(
                    'level', 'info',
                    'message', format('Successfully imported feature %s of %s', v_imported_count, v_total_features),
                    'details', jsonb_build_object(
                        'feature_index', i,
                        'total_features', v_total_features,
                        'geometry_type', ST_GeometryType(v_geometry),
                        'has_z', v_original_has_z,
                        'vertical_datum_id', v_original_vertical_datum_id,
                        'vertical_datum_name', v_vertical_datum_name,
                        'source_srid', p_source_srid,
                        'target_srid', p_target_srid
                    )
                );

            EXCEPTION WHEN OTHERS THEN
                v_failed_count := v_failed_count + 1;
                v_feature_errors := v_feature_errors || jsonb_build_object(
                    'feature_index', i,
                    'error', SQLERRM,
                    'error_state', SQLSTATE
                );
                
                -- Add error notice
                v_notices := v_notices || jsonb_build_object(
                    'level', 'error',
                    'message', format('Failed to import feature %s: %s', i + 1, SQLERRM),
                    'details', jsonb_build_object(
                        'feature_index', i,
                        'error', SQLERRM,
                        'error_state', SQLSTATE
                    )
                );
            END;
        END LOOP;
    END LOOP;

    -- Verify we have imported at least one feature
    IF v_imported_count = 0 THEN
        -- Clean up if no features were imported
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
        'target_srid', p_target_srid,
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

-- Add comments for better documentation
COMMENT ON FUNCTION public.import_geo_features_with_transform IS 'Imports geospatial features into the geo_features table with support for the new schema including vertical datum handling. Features are stored in their original coordinate system and vertical datum, with transformation deferred to a separate process.';

-- Create process_feature_geometry function
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
    v_geometry_wgs84 geometry;
    v_transformed_xy geometry;
    v_final_z double precision;
BEGIN
    -- If status is already failed, proceed directly to update
    IF p_status = 'failed' THEN
        UPDATE public.geo_features
        SET 
            geometry_wgs84 = NULL,
            display_base_elevation = NULL,
            display_object_height = p_display_object_height,
            display_height_mode = p_display_height_mode,
            height_calculation_log = COALESCE(p_calculation_log_entry, '{}'::jsonb),
            height_transformation_status = p_status,
            height_transformation_error = p_error_message,
            height_transformed_at = timezone('utc', now())
        WHERE id = p_feature_id;
        RETURN;
    END IF;

    -- Fetch original geometry
    SELECT geometry_original INTO v_geometry_original
    FROM public.geo_features
    WHERE id = p_feature_id;

    -- Check if original geometry exists
    IF v_geometry_original IS NULL THEN
        p_status := 'failed';
        p_error_message := 'Original geometry not found';
        
        UPDATE public.geo_features
        SET 
            geometry_wgs84 = NULL,
            display_base_elevation = NULL,
            display_object_height = p_display_object_height,
            display_height_mode = p_display_height_mode,
            height_calculation_log = COALESCE(p_calculation_log_entry, '{}'::jsonb),
            height_transformation_status = p_status,
            height_transformation_error = p_error_message,
            height_transformed_at = timezone('utc', now())
        WHERE id = p_feature_id;
        RETURN;
    END IF;

    -- Perform horizontal transformation
    BEGIN
        v_transformed_xy := ST_Transform(v_geometry_original, 4326);
    EXCEPTION WHEN OTHERS THEN
        p_status := 'failed';
        p_error_message := 'ST_Transform failed: ' || SQLERRM;
        
        UPDATE public.geo_features
        SET 
            geometry_wgs84 = NULL,
            display_base_elevation = NULL,
            display_object_height = p_display_object_height,
            display_height_mode = p_display_height_mode,
            height_calculation_log = COALESCE(p_calculation_log_entry, '{}'::jsonb),
            height_transformation_status = p_status,
            height_transformation_error = p_error_message,
            height_transformed_at = timezone('utc', now())
        WHERE id = p_feature_id;
        RETURN;
    END;

    -- Determine final Z value
    IF p_display_height_mode = 'clamp_to_ground' THEN
        v_final_z := 0.0;
    ELSE
        v_final_z := COALESCE(p_target_ellipsoidal_height, 0.0);
    END IF;

    -- Create final 3D WGS84 geometry
    BEGIN
        v_geometry_wgs84 := ST_Force3D(v_transformed_xy, v_final_z);
    EXCEPTION WHEN OTHERS THEN
        p_status := 'failed';
        p_error_message := 'ST_Force3D failed: ' || SQLERRM;
        
        UPDATE public.geo_features
        SET 
            geometry_wgs84 = NULL,
            display_base_elevation = NULL,
            display_object_height = p_display_object_height,
            display_height_mode = p_display_height_mode,
            height_calculation_log = COALESCE(p_calculation_log_entry, '{}'::jsonb),
            height_transformation_status = p_status,
            height_transformation_error = p_error_message,
            height_transformed_at = timezone('utc', now())
        WHERE id = p_feature_id;
        RETURN;
    END;

    -- Update feature with successful transformation
    UPDATE public.geo_features
    SET 
        geometry_wgs84 = v_geometry_wgs84,
        display_base_elevation = p_target_ellipsoidal_height,
        display_object_height = p_display_object_height,
        display_height_mode = p_display_height_mode,
        height_calculation_log = COALESCE(p_calculation_log_entry, '{}'::jsonb),
        height_transformation_status = p_status,
        height_transformation_error = p_error_message,
        height_transformed_at = timezone('utc', now())
    WHERE id = p_feature_id;
END;
$$;

-- Add comments for better documentation
COMMENT ON FUNCTION public.process_feature_geometry IS 'Processes a feature''s geometry by performing horizontal transformation to WGS84 and applying the specified height configuration. Updates the feature record with the transformed geometry and height-related metadata.'; 