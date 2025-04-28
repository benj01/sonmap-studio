CREATE OR REPLACE FUNCTION public.test_update_feature_height(
  p_feature_id UUID,
  p_height_mode TEXT,
  p_base_elevation_ellipsoidal NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
  v_old_values JSONB;
  v_success BOOLEAN;
  v_error_message TEXT;
  v_updated_row JSONB;
BEGIN
  -- Get original values first for comparison
  SELECT jsonb_build_object(
    'height_mode', height_mode,
    'base_elevation_ellipsoidal', base_elevation_ellipsoidal,
    'height_transformation_status', height_transformation_status,
    'height_transformed_at', height_transformed_at
  ) INTO v_old_values
  FROM public.geo_features
  WHERE id = p_feature_id;
  
  BEGIN
    -- Try to do the update
    UPDATE public.geo_features
    SET 
      height_mode = p_height_mode,
      base_elevation_ellipsoidal = p_base_elevation_ellipsoidal,
      height_transformation_status = 'complete',
      height_transformed_at = NOW()
    WHERE id = p_feature_id;
    
    -- Check if update affected any rows
    v_success := FOUND;
    
    -- Get updated row data
    SELECT jsonb_build_object(
      'height_mode', height_mode,
      'base_elevation_ellipsoidal', base_elevation_ellipsoidal,
      'height_transformation_status', height_transformation_status,
      'height_transformed_at', height_transformed_at
    ) INTO v_updated_row
    FROM public.geo_features
    WHERE id = p_feature_id;
    
  EXCEPTION WHEN OTHERS THEN
    v_success := FALSE;
    v_error_message := SQLERRM;
  END;
  
  -- Build the result
  v_result := jsonb_build_object(
    'feature_id', p_feature_id,
    'success', v_success,
    'error_message', v_error_message,
    'old_values', v_old_values,
    'updated_values', v_updated_row,
    'update_params', jsonb_build_object(
      'height_mode', p_height_mode,
      'base_elevation_ellipsoidal', p_base_elevation_ellipsoidal
    ),
    'current_user', current_user,
    'current_timestamp', NOW()
  );
  
  RETURN v_result;
END;
$$; 