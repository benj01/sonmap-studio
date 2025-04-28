CREATE OR REPLACE FUNCTION public.update_feature_height_bypass_rls(
  p_feature_id UUID,
  p_base_elevation_ellipsoidal NUMERIC,
  p_height_mode TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER  -- This means the function runs with the privileges of the function creator (usually postgres)
AS $$
DECLARE
  v_result JSONB;
  v_old_values JSONB;
  v_new_values JSONB;
  v_rows_affected INTEGER;
BEGIN
  -- Store original values for comparison
  SELECT jsonb_build_object(
    'base_elevation_ellipsoidal', base_elevation_ellipsoidal,
    'height_mode', height_mode,
    'height_transformation_status', height_transformation_status,
    'height_transformed_at', height_transformed_at
  ) INTO v_old_values
  FROM public.geo_features
  WHERE id = p_feature_id;
  
  -- If feature not found, return error
  IF v_old_values IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Feature not found',
      'feature_id', p_feature_id
    );
  END IF;
  
  -- Perform the update
  UPDATE public.geo_features
  SET 
    base_elevation_ellipsoidal = p_base_elevation_ellipsoidal,
    height_mode = p_height_mode,
    height_transformation_status = 'complete',
    height_transformed_at = NOW(),
    original_height_values = v_old_values,
    updated_at = NOW()
  WHERE id = p_feature_id;
  
  -- Get the number of rows affected
  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
  
  -- Retrieve updated values
  SELECT jsonb_build_object(
    'base_elevation_ellipsoidal', base_elevation_ellipsoidal,
    'height_mode', height_mode,
    'height_transformation_status', height_transformation_status,
    'height_transformed_at', height_transformed_at
  ) INTO v_new_values
  FROM public.geo_features
  WHERE id = p_feature_id;
  
  -- Build the result object
  v_result := jsonb_build_object(
    'success', v_rows_affected > 0,
    'rows_affected', v_rows_affected,
    'feature_id', p_feature_id,
    'old_values', v_old_values,
    'new_values', v_new_values
  );
  
  RETURN v_result;
END;
$$; 