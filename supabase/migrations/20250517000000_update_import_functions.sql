-- Migration to update import functions to use the new transform_and_store_geometries function
-- and the geometry_3d column

-- Update import_single_feature function to use geometry_3d
CREATE OR REPLACE FUNCTION public.import_single_feature(
    p_layer_id uuid, 
    p_geometry jsonb, 
    p_properties jsonb, 
    p_source_srid integer DEFAULT 2056
) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
DECLARE
    v_geometry_2d geometry;
    v_geometry_3d geometry;
    v_collection_id uuid;
    v_base_elevation double precision;
    v_object_height double precision;
    v_validated boolean;
BEGIN
    -- Log input parameters
    RAISE LOG 'Single feature import - Input geometry: %', p_geometry;

    -- Get collection ID from layer
    SELECT collection_id INTO v_collection_id FROM public.layers WHERE id = p_layer_id;
    IF v_collection_id IS NULL THEN
        RAISE LOG 'Layer not found: %', p_layer_id;
        RETURN FALSE;
    END IF;

    -- Transform the geometry using our new function
    SELECT t.geometry_2d, t.geometry_3d 
    INTO v_geometry_2d, v_geometry_3d
    FROM public.transform_and_store_geometries(p_geometry, p_source_srid) t;

    -- Extract height info from properties
    v_base_elevation := (p_properties->>'base_elevation')::double precision;
    v_object_height := (p_properties->>'object_height')::double precision;

    -- Insert the feature with both 2D and 3D geometries
    INSERT INTO public.geo_features (
        layer_id,
        collection_id,
        geometry_2d,
        geometry_3d,
        properties,
        srid,
        base_elevation_ellipsoidal,
        object_height
    )
    VALUES (
        p_layer_id,
        v_collection_id,
        v_geometry_2d,
        v_geometry_3d,
        COALESCE(p_properties, '{}'::jsonb),
        4326, -- Stored geometry SRID is 4326
        v_base_elevation,
        v_object_height
    );

    RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
    RAISE LOG 'Error inserting feature: % (State: %)', SQLERRM, SQLSTATE;
    RETURN FALSE;
END;
$$;

-- Update import_geo_features_with_transform function to use geometry_3d
-- Note: Matching the existing function signature to ensure compatibility
CREATE OR REPLACE FUNCTION public.import_geo_features_with_transform(
    p_project_file_id uuid, 
    p_collection_name text, 
    p_features jsonb, 
    p_source_srid integer, 
    p_target_srid integer,
    p_height_attribute_key text,
    p_batch_size integer DEFAULT 1000
) RETURNS TABLE(collection_id uuid, layer_id uuid, imported_count integer, failed_count integer, debug_info jsonb)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
DECLARE
    -- IDs and Counters
    v_collection_id UUID;
    v_layer_id UUID;
    v_imported_count INTEGER := 0;
    v_failed_count INTEGER := 0;
    v_cleaned_count INTEGER := 0;
    v_dimension_fixes INTEGER := 0;
    v_feature_errors JSONB := '[]'::jsonb;
    v_notices JSONB := '[]'::jsonb;
    v_debug_info JSONB;
    
    -- Batch processing variables
    v_total_features INTEGER;
    v_batch_count INTEGER;
    v_current_batch INTEGER;
    v_batch_start INTEGER;
    v_batch_end INTEGER;
    
    -- Per-feature variables
    i INTEGER;
    v_feature JSONB;
    v_geometry_2d GEOMETRY;
    v_geometry_3d GEOMETRY;
    v_properties JSONB;
    v_base_elevation DOUBLE PRECISION;
    v_object_height DOUBLE PRECISION;
    v_height_mode TEXT;
    v_height_source TEXT;
    v_vertical_datum_source TEXT;
    v_transformed_geometries RECORD;
    v_lhn95_height FLOAT;
BEGIN
    RAISE LOG '[IMPORT_FUNC] Starting execution for project_file_id: %', p_project_file_id;
    
    -- Get total feature count and log start
    v_total_features := jsonb_array_length(p_features);
    v_batch_count := CEIL(v_total_features::float / p_batch_size);
    v_current_batch := 0;
    
    RAISE LOG '[IMPORT_FUNC] Total features: %, Batch Count: %, Batch Size: %', 
        v_total_features, v_batch_count, p_batch_size;

    -- Create collection and layer
    INSERT INTO public.feature_collections (name, project_file_id)
    VALUES (p_collection_name, p_project_file_id)
    RETURNING id INTO v_collection_id;

    INSERT INTO public.layers (name, collection_id, type)
    VALUES (p_collection_name, v_collection_id, 'vector')
    RETURNING id INTO v_layer_id;

    RAISE LOG 'Created collection % and layer %.', v_collection_id, v_layer_id;
    
    -- Process features in batches
    FOR v_current_batch IN 0..v_batch_count-1 LOOP
        v_batch_start := v_current_batch * p_batch_size;
        v_batch_end := LEAST(v_batch_start + p_batch_size, v_total_features);
        
        RAISE LOG 'Processing batch % of % (features % to %)', 
            v_current_batch + 1, v_batch_count, v_batch_start, v_batch_end - 1;
        
        -- Process each feature in the current batch
        FOR i IN v_batch_start..v_batch_end-1 LOOP
            BEGIN
                v_feature := p_features->i;
                
                IF v_feature IS NULL OR v_feature->>'geometry' IS NULL THEN
                    v_failed_count := v_failed_count + 1;
                    v_feature_errors := v_feature_errors || jsonb_build_object(
                        'feature_index', i,
                        'error', 'Invalid or missing geometry',
                        'error_state', 'GEO001'
                    );
                    CONTINUE;
                END IF;
                
                -- Extract properties and height information
                v_properties := COALESCE(v_feature->'properties', '{}'::jsonb);
                
                -- Extract height info from properties
                v_base_elevation := (v_properties->>'base_elevation')::double precision;
                v_object_height := (v_properties->>'object_height')::double precision;
                v_height_mode := v_properties->>'height_mode';
                v_height_source := v_properties->>'height_source';
                v_vertical_datum_source := v_properties->>'vertical_datum_source';
                v_lhn95_height := NULL;
                
                -- Transform the geometry using our helper function
                SELECT t.geometry_2d, t.geometry_3d 
                INTO v_geometry_2d, v_geometry_3d
                FROM public.transform_and_store_geometries(v_feature->'geometry', p_source_srid) t;
                
                -- Check for height from attribute specified by p_height_attribute_key
                -- This replicates the behavior from the original function
                IF p_height_attribute_key IS NOT NULL AND p_height_attribute_key <> '' AND p_height_attribute_key <> '_none' THEN
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
                        RAISE WARNING '[Feature % Height] Could not cast attribute "%" value "%" to FLOAT: %', 
                          i, p_height_attribute_key, attr_value_text, SQLERRM;
                      END;
                    END IF;
                  EXCEPTION WHEN OTHERS THEN
                    RAISE WARNING '[Feature % Height] Error accessing attribute "%": %', 
                      i, p_height_attribute_key, SQLERRM;
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
                
                -- Set LV95 coordinates for Swiss data
                IF p_source_srid = 2056 AND v_lhn95_height IS NOT NULL THEN
                    v_height_mode := 'lv95_stored';
                    -- Add LV95 properties
                    v_properties := v_properties || jsonb_build_object(
                        'lv95_height', v_lhn95_height
                    );
                ELSIF v_lhn95_height IS NOT NULL THEN
                    v_base_elevation := v_lhn95_height;
                END IF;
                
                -- Insert feature with both 2D and 3D geometries
                INSERT INTO public.geo_features (
                    layer_id,
                    collection_id,
                    geometry_2d,
                    geometry_3d,
                    properties,
                    srid,
                    base_elevation_ellipsoidal,
                    object_height,
                    height_mode,
                    height_source,
                    vertical_datum_source
                ) VALUES (
                    v_layer_id,
                    v_collection_id,
                    v_geometry_2d,
                    v_geometry_3d,
                    v_properties,
                    p_target_srid,
                    v_base_elevation,
                    v_object_height,
                    v_height_mode,
                    v_height_source,
                    v_vertical_datum_source
                );
                
                v_imported_count := v_imported_count + 1;
                
            EXCEPTION WHEN OTHERS THEN
                v_failed_count := v_failed_count + 1;
                v_feature_errors := v_feature_errors || jsonb_build_object(
                    'feature_index', i,
                    'error', SQLERRM,
                    'error_state', SQLSTATE
                );
                RAISE LOG 'Error processing feature %: %', i, SQLERRM;
            END;
        END LOOP;
    END LOOP;
    
    -- Prepare debug info
    v_debug_info := jsonb_build_object(
        'cleaned_count', v_cleaned_count,
        'dimension_fixes', v_dimension_fixes,
        'feature_errors', v_feature_errors,
        'notices', v_notices
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