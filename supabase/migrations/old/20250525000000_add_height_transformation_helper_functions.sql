-- Helper function to count features in a layer
CREATE OR REPLACE FUNCTION public.count_layer_features(
    p_layer_id UUID
) RETURNS INTEGER
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM public.geo_features
    WHERE layer_id = p_layer_id;
    
    RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.count_layer_features(UUID) IS 'Counts all features in a specified layer';

-- Helper function to count features with a specific height mode
CREATE OR REPLACE FUNCTION public.count_features_by_height_mode(
    p_layer_id UUID,
    p_height_mode TEXT
) RETURNS INTEGER
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM public.geo_features
    WHERE layer_id = p_layer_id
    AND height_mode = p_height_mode;
    
    RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.count_features_by_height_mode(UUID, TEXT) IS 'Counts features with a specific height mode in a layer';

-- Helper function to count features with LV95 stored height data
CREATE OR REPLACE FUNCTION public.count_lv95_features(
    p_layer_id UUID
) RETURNS INTEGER
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM public.geo_features
    WHERE layer_id = p_layer_id
    AND height_mode = 'lv95_stored';
    
    RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.count_lv95_features(UUID) IS 'Counts features with LV95 stored height data in a layer';

-- Modify the initialize_height_transformation function to better handle edge cases
CREATE OR REPLACE FUNCTION public.initialize_height_transformation(
    p_layer_id UUID,
    p_height_source_type TEXT,
    p_height_source_attribute TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    v_batch_id UUID;
    v_total_features INTEGER;
    v_lv95_features INTEGER;
BEGIN
    -- Count features for the layer
    SELECT COUNT(*) INTO v_total_features FROM public.geo_features WHERE layer_id = p_layer_id;
    
    -- Also count LV95 features specifically if using z_coord height source
    IF p_height_source_type = 'z_coord' THEN
        SELECT COUNT(*) INTO v_lv95_features 
        FROM public.geo_features 
        WHERE layer_id = p_layer_id 
        AND height_mode = 'lv95_stored';
        
        IF v_lv95_features = 0 AND v_total_features > 0 THEN
            RAISE EXCEPTION 'No features with LV95 stored height mode found in layer % despite % total features', 
                p_layer_id, v_total_features;
        END IF;
    END IF;
    
    IF v_total_features = 0 THEN
        RAISE EXCEPTION 'No features found in layer %', p_layer_id;
    END IF;
    
    -- Create a new batch record with more metadata
    INSERT INTO public.height_transformation_batches (
        layer_id,
        height_source_type,
        height_source_attribute,
        status,
        total_features,
        created_by,
        metadata
    ) VALUES (
        p_layer_id,
        p_height_source_type,
        p_height_source_attribute,
        'pending',
        v_total_features,
        auth.uid(),
        jsonb_build_object(
            'lv95_feature_count', v_lv95_features,
            'verification_timestamp', now()
        )
    ) RETURNING id INTO v_batch_id;
    
    -- Mark features as pending for transformation
    UPDATE public.geo_features
    SET 
        height_transformation_status = 'pending',
        height_transformation_batch_id = v_batch_id,
        height_transformation_error = NULL
    WHERE layer_id = p_layer_id
    AND (
        -- For z_coord type, only select features with lv95_stored mode
        (p_height_source_type = 'z_coord' AND height_mode = 'lv95_stored')
        OR
        -- For other types, select all features
        p_height_source_type != 'z_coord'
    );
    
    RETURN v_batch_id;
END;
$$;

-- Function to get distribution of height modes in a layer
CREATE OR REPLACE FUNCTION public.get_height_mode_distribution(
    p_layer_id UUID
) RETURNS TABLE (
    height_mode TEXT,
    count BIGINT
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT gf.height_mode::TEXT, COUNT(*)::BIGINT
    FROM public.geo_features gf
    WHERE gf.layer_id = p_layer_id
    GROUP BY gf.height_mode;
END;
$$;

COMMENT ON FUNCTION public.get_height_mode_distribution(UUID) IS 'Gets the distribution of height modes in a layer'; 