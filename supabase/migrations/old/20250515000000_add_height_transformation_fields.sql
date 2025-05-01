-- Migration to add height transformation fields and functions
-- This migration enhances the geo_features table with fields for tracking height transformation status
-- and provides functions for managing height transformations

-- Add new columns to geo_features table for height transformation tracking
ALTER TABLE public.geo_features ADD COLUMN IF NOT EXISTS height_transformation_status TEXT DEFAULT 'pending'::text;
ALTER TABLE public.geo_features ADD COLUMN IF NOT EXISTS height_transformed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.geo_features ADD COLUMN IF NOT EXISTS height_transformation_batch_id UUID;
ALTER TABLE public.geo_features ADD COLUMN IF NOT EXISTS height_transformation_error TEXT;
ALTER TABLE public.geo_features ADD COLUMN IF NOT EXISTS original_height_values JSONB DEFAULT '{}'::jsonb;

-- Add comments on new columns
COMMENT ON COLUMN public.geo_features.height_transformation_status IS 'Status of height transformation: pending, in_progress, complete, failed';
COMMENT ON COLUMN public.geo_features.height_transformed_at IS 'Timestamp when height transformation was completed';
COMMENT ON COLUMN public.geo_features.height_transformation_batch_id IS 'ID of the batch operation that processed this feature''s height';
COMMENT ON COLUMN public.geo_features.height_transformation_error IS 'Error message if height transformation failed';
COMMENT ON COLUMN public.geo_features.original_height_values IS 'Original height values before transformation for reference and potential rollback';

-- Create table to track height transformation batches
CREATE TABLE IF NOT EXISTS public.height_transformation_batches (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    layer_id UUID NOT NULL REFERENCES public.layers(id) ON DELETE CASCADE,
    height_source_type TEXT NOT NULL,
    height_source_attribute TEXT,
    status TEXT NOT NULL DEFAULT 'pending'::text,
    total_features INTEGER DEFAULT 0,
    processed_features INTEGER DEFAULT 0,
    failed_features INTEGER DEFAULT 0,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_by UUID,
    metadata JSONB DEFAULT '{}'::jsonb
);

COMMENT ON TABLE public.height_transformation_batches IS 'Tracks batches of height transformation operations for monitoring and management';

-- Function to initiate a height transformation batch for a layer
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
BEGIN
    -- Count features for the layer
    SELECT COUNT(*) INTO v_total_features FROM public.geo_features WHERE layer_id = p_layer_id;
    
    IF v_total_features = 0 THEN
        RAISE EXCEPTION 'No features found in layer %', p_layer_id;
    END IF;
    
    -- Create a new batch record
    INSERT INTO public.height_transformation_batches (
        layer_id,
        height_source_type,
        height_source_attribute,
        status,
        total_features,
        created_by
    ) VALUES (
        p_layer_id,
        p_height_source_type,
        p_height_source_attribute,
        'pending',
        v_total_features,
        auth.uid()
    ) RETURNING id INTO v_batch_id;
    
    -- Mark features as pending for transformation
    UPDATE public.geo_features
    SET 
        height_transformation_status = 'pending',
        height_transformation_batch_id = v_batch_id,
        height_transformation_error = NULL
    WHERE layer_id = p_layer_id;
    
    RETURN v_batch_id;
END;
$$;

COMMENT ON FUNCTION public.initialize_height_transformation(UUID, TEXT, TEXT) IS 'Initiates a height transformation batch for a layer, setting up tracking and marking features for processing';

-- Function to update height transformation progress
CREATE OR REPLACE FUNCTION public.update_height_transformation_progress(
    p_batch_id UUID,
    p_processed INTEGER,
    p_failed INTEGER DEFAULT 0
) RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    -- Update the batch record with progress
    UPDATE public.height_transformation_batches
    SET 
        processed_features = p_processed,
        failed_features = p_failed,
        status = CASE 
            WHEN p_processed + p_failed >= total_features THEN 'complete'
            ELSE 'in_progress'
        END,
        completed_at = CASE 
            WHEN p_processed + p_failed >= total_features THEN NOW()
            ELSE NULL
        END
    WHERE id = p_batch_id;
END;
$$;

COMMENT ON FUNCTION public.update_height_transformation_progress(UUID, INTEGER, INTEGER) IS 'Updates the progress of a height transformation batch';

-- Function to mark a height transformation as complete for a feature
CREATE OR REPLACE FUNCTION public.mark_height_transformation_complete(
    p_feature_id UUID,
    p_batch_id UUID,
    p_original_values JSONB DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    -- Update the feature with transformation results
    UPDATE public.geo_features
    SET 
        height_transformation_status = 'complete',
        height_transformed_at = NOW(),
        height_transformation_batch_id = p_batch_id,
        height_transformation_error = NULL,
        original_height_values = COALESCE(p_original_values, original_height_values)
    WHERE id = p_feature_id;
END;
$$;

COMMENT ON FUNCTION public.mark_height_transformation_complete(UUID, UUID, JSONB) IS 'Marks a feature as having completed height transformation, recording original values if provided';

-- Function to mark a height transformation as failed for a feature
CREATE OR REPLACE FUNCTION public.mark_height_transformation_failed(
    p_feature_id UUID,
    p_batch_id UUID,
    p_error TEXT
) RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    -- Update the feature with error information
    UPDATE public.geo_features
    SET 
        height_transformation_status = 'failed',
        height_transformation_batch_id = p_batch_id,
        height_transformation_error = p_error
    WHERE id = p_feature_id;
END;
$$;

COMMENT ON FUNCTION public.mark_height_transformation_failed(UUID, UUID, TEXT) IS 'Marks a feature as having failed height transformation with the specified error';

-- Function to reset height transformation for a layer
CREATE OR REPLACE FUNCTION public.reset_height_transformation(
    p_layer_id UUID
) RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_affected_rows INTEGER;
BEGIN
    -- Update features to clear transformation data
    UPDATE public.geo_features
    SET 
        height_transformation_status = 'pending',
        height_transformed_at = NULL,
        height_transformation_batch_id = NULL,
        height_transformation_error = NULL,
        base_elevation_ellipsoidal = NULL,
        object_height = NULL,
        height_mode = NULL,
        height_source = NULL
    WHERE layer_id = p_layer_id;
    
    GET DIAGNOSTICS v_affected_rows = ROW_COUNT;
    
    -- Also delete any batch records for this layer
    DELETE FROM public.height_transformation_batches
    WHERE layer_id = p_layer_id;
    
    RETURN v_affected_rows;
END;
$$;

COMMENT ON FUNCTION public.reset_height_transformation(UUID) IS 'Resets height transformation data for all features in a layer and removes batch records';

-- Function to get height transformation status for a layer
CREATE OR REPLACE FUNCTION public.get_height_transformation_status(
    p_layer_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'layer_id', p_layer_id,
        'latest_batch', (
            SELECT jsonb_build_object(
                'id', id,
                'status', status,
                'height_source_type', height_source_type,
                'height_source_attribute', height_source_attribute,
                'total_features', total_features,
                'processed_features', processed_features,
                'failed_features', failed_features,
                'started_at', started_at,
                'completed_at', completed_at
            )
            FROM public.height_transformation_batches
            WHERE layer_id = p_layer_id
            ORDER BY started_at DESC
            LIMIT 1
        ),
        'feature_status', (
            SELECT jsonb_build_object(
                'total', COUNT(*),
                'pending', COUNT(*) FILTER (WHERE height_transformation_status = 'pending'),
                'in_progress', COUNT(*) FILTER (WHERE height_transformation_status = 'in_progress'),
                'complete', COUNT(*) FILTER (WHERE height_transformation_status = 'complete'),
                'failed', COUNT(*) FILTER (WHERE height_transformation_status = 'failed')
            )
            FROM public.geo_features
            WHERE layer_id = p_layer_id
        )
    ) INTO v_result;
    
    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_height_transformation_status(UUID) IS 'Returns the current status of height transformation for a layer, including batch information and feature counts by status'; 