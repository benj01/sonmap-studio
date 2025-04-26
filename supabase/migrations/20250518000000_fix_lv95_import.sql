-- Migration to fix LV95 coordinate handling in import functions
-- This migration modifies the import functions to properly preserve
-- the original LV95 coordinates for Swiss data

-- Update import_single_feature function to properly handle LV95 coordinates
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
    v_lv95_easting double precision;
    v_lv95_northing double precision;
    v_lv95_height double precision;
    v_height_mode text;
    v_height_source text;
    v_original_geometry geometry;
    v_validated boolean;
    v_properties jsonb;
BEGIN
    -- Log input parameters
    RAISE LOG 'Single feature import - Input geometry: %', p_geometry;

    -- Get collection ID from layer
    SELECT collection_id INTO v_collection_id FROM public.layers WHERE id = p_layer_id;
    IF v_collection_id IS NULL THEN
        RAISE LOG 'Layer not found: %', p_layer_id;
        RETURN FALSE;
    END IF;

    -- Create a copy of the properties to work with
    v_properties := COALESCE(p_properties, '{}'::jsonb);

    -- Before transformation, extract the original LV95 coordinates if Swiss SRID
    IF p_source_srid = 2056 THEN
        -- Create geometry from GeoJSON for coordinate extraction
        BEGIN
            -- Create the original geometry to extract coordinates
            v_original_geometry := ST_SetSRID(ST_GeomFromGeoJSON(p_geometry::text), p_source_srid);

            -- For points, extract coordinates directly
            IF ST_GeometryType(v_original_geometry) = 'ST_Point' THEN
                v_lv95_easting := ST_X(v_original_geometry);
                v_lv95_northing := ST_Y(v_original_geometry);
                v_lv95_height := COALESCE(ST_Z(v_original_geometry), 
                                         (v_properties->>'height')::double precision, 
                                         (v_properties->>'Z')::double precision);
                
                -- Store the original LV95 coordinates in properties
                v_properties := v_properties || jsonb_build_object(
                    'lv95_easting', v_lv95_easting,
                    'lv95_northing', v_lv95_northing,
                    'lv95_height', v_lv95_height
                );
                
                v_height_mode := 'lv95_stored';
                v_height_source := COALESCE(v_properties->>'height_source', 'original_geometry');
                
                RAISE LOG 'Preserved original LV95 point coordinates: X=%, Y=%, Z=%', 
                    v_lv95_easting, v_lv95_northing, v_lv95_height;
            ELSE
                -- For lines, polygons, etc. use the centroid but preserve height from properties if available
                DECLARE
                    v_centroid geometry;
                BEGIN
                    v_centroid := ST_Centroid(v_original_geometry);
                    v_lv95_easting := ST_X(v_centroid);
                    v_lv95_northing := ST_Y(v_centroid);
                    v_lv95_height := COALESCE((v_properties->>'height')::double precision, 
                                             (v_properties->>'Z')::double precision,
                                             (v_properties->>'elevation')::double precision);
                    
                    -- Only proceed if we have a height value
                    IF v_lv95_height IS NOT NULL THEN
                        -- Store the representative LV95 coordinates in properties
                        v_properties := v_properties || jsonb_build_object(
                            'lv95_easting', v_lv95_easting,
                            'lv95_northing', v_lv95_northing,
                            'lv95_height', v_lv95_height
                        );
                        
                        v_height_mode := 'lv95_stored';
                        v_height_source := COALESCE(v_properties->>'height_source', 'properties');
                        
                        RAISE LOG 'Preserved representative LV95 coordinates for complex geometry: X=%, Y=%, Z=%', 
                            v_lv95_easting, v_lv95_northing, v_lv95_height;
                    END IF;
                EXCEPTION WHEN OTHERS THEN
                    RAISE WARNING 'Error extracting centroid from geometry: %', SQLERRM;
                END;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Error handling original LV95 coordinates: %', SQLERRM;
        END;
    END IF;

    -- Transform the geometry using our helper function
    SELECT t.geometry_2d, t.geometry_3d 
    INTO v_geometry_2d, v_geometry_3d
    FROM public.transform_and_store_geometries(p_geometry, p_source_srid) t;

    -- Extract height info from properties
    v_base_elevation := (v_properties->>'base_elevation')::double precision;
    v_object_height := (v_properties->>'object_height')::double precision;

    -- Insert the feature with both 2D and 3D geometries
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
        height_source
    )
    VALUES (
        p_layer_id,
        v_collection_id,
        v_geometry_2d,
        v_geometry_3d,
        v_properties,
        4326, -- Stored geometry SRID is 4326
        v_base_elevation,
        v_object_height,
        v_height_mode,
        v_height_source
    );

    RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
    RAISE LOG 'Error inserting feature: % (State: %)', SQLERRM, SQLSTATE;
    RETURN FALSE;
END;
$$;

-- Update the relevant section of import_geo_features_with_transform
-- to better handle LV95 coordinate preservation
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
    v_original_geometry GEOMETRY;
    v_lv95_easting FLOAT;
    v_lv95_northing FLOAT;
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
                
                -- Handle Swiss coordinates (2056) differently - preserve original coordinates
                IF p_source_srid = 2056 THEN
                    -- Create geometry from GeoJSON for coordinate extraction
                    BEGIN
                        -- Create the original geometry to extract coordinates
                        v_original_geometry := ST_SetSRID(ST_GeomFromGeoJSON(v_feature->'geometry'::text), p_source_srid);
                        
                        -- For points, extract coordinates directly
                        IF ST_GeometryType(v_original_geometry) = 'ST_Point' THEN
                            v_lv95_easting := ST_X(v_original_geometry);
                            v_lv95_northing := ST_Y(v_original_geometry);
                            v_lhn95_height := COALESCE(ST_Z(v_original_geometry), 
                                                    (v_properties->>'height')::double precision, 
                                                    (v_properties->>'Z')::double precision);
                            
                            -- Log original coordinates for debugging
                            RAISE LOG '[Feature % LV95] Original coordinates extracted: X=%, Y=%, Z=%', 
                                i, v_lv95_easting, v_lv95_northing, v_lhn95_height;
                        ELSE
                            -- For lines, polygons, etc. use the centroid
                            DECLARE
                                v_centroid geometry;
                            BEGIN
                                v_centroid := ST_Centroid(v_original_geometry);
                                v_lv95_easting := ST_X(v_centroid);
                                v_lv95_northing := ST_Y(v_centroid);
                                
                                -- Check if a height attribute was specified
                                IF p_height_attribute_key IS NOT NULL AND p_height_attribute_key <> '' AND p_height_attribute_key <> '_none' THEN
                                    v_lhn95_height := (v_properties->>p_height_attribute_key)::double precision;
                                ELSE
                                    v_lhn95_height := (v_properties->>'height')::double precision;
                                END IF;
                                
                                RAISE LOG '[Feature % LV95] Representative coordinates for complex geometry: X=%, Y=%, Z=%', 
                                    i, v_lv95_easting, v_lv95_northing, v_lhn95_height;
                            EXCEPTION WHEN OTHERS THEN
                                RAISE WARNING '[Feature % LV95] Error extracting centroid: %', i, SQLERRM;
                            END;
                        END IF;
                    EXCEPTION WHEN OTHERS THEN
                        RAISE WARNING '[Feature % LV95] Error handling original coordinates: %', i, SQLERRM;
                    END;
                END IF;
                
                -- Transform the geometry using our helper function
                SELECT t.geometry_2d, t.geometry_3d 
                INTO v_geometry_2d, v_geometry_3d
                FROM public.transform_and_store_geometries(v_feature->'geometry', p_source_srid) t;
                
                -- Check for height from attribute specified by p_height_attribute_key
                -- Only do this if we haven't already extracted a height value
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
                                RAISE WARNING '[Feature % Height] Could not cast attribute "%" value "%" to FLOAT: %', 
                                i, p_height_attribute_key, attr_value_text, SQLERRM;
                            END;
                        END IF;
                    EXCEPTION WHEN OTHERS THEN
                        RAISE WARNING '[Feature % Height] Error accessing attribute "%": %', 
                        i, p_height_attribute_key, SQLERRM;
                    END;
                END IF;

                -- Check for 'height' field in properties if we still don't have a height value
                IF v_lhn95_height IS NULL AND v_properties ? 'height' THEN
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
                
                -- When source SRID is 2056 (Swiss) and we have height info, store LV95 coordinates
                IF p_source_srid = 2056 AND v_lhn95_height IS NOT NULL AND v_lv95_easting IS NOT NULL AND v_lv95_northing IS NOT NULL THEN
                    -- Store LV95 coordinates in properties using the original values (not transformed)
                    v_properties := v_properties || jsonb_build_object(
                        'lv95_height', v_lhn95_height,
                        'lv95_easting', v_lv95_easting,
                        'lv95_northing', v_lv95_northing
                    );
                    v_height_mode := 'lv95_stored';
                    
                    RAISE LOG '[IMPORT_FUNC] Stored original LV95 coordinates: X=%, Y=%, Z=%', 
                        v_lv95_easting, v_lv95_northing, v_lhn95_height;
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