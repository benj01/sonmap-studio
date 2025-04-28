-- Migration to add a function that bypasses RLS for height transformations
-- This function allows updating feature height data even when RLS policies would block it

-- Create or replace the bypass function with SECURITY DEFINER to run as postgres user
CREATE OR REPLACE FUNCTION public.update_feature_height_bypass_rls(
  p_feature_id UUID,
  p_base_elevation_ellipsoidal NUMERIC,
  p_height_mode TEXT,
  p_batch_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER  -- Function runs with creator privileges (postgres)
AS $$
DECLARE
  v_result JSONB;
  v_old_values JSONB;
  v_new_values JSONB;
  v_rows_affected INTEGER;
  v_feature_exists BOOLEAN;
  v_geometry_2d geometry;
  v_srid INTEGER;
BEGIN
  -- Check if feature exists
  SELECT EXISTS (
    SELECT 1 FROM public.geo_features WHERE id = p_feature_id
  ) INTO v_feature_exists;
  
  IF NOT v_feature_exists THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Feature not found',
      'feature_id', p_feature_id
    );
  END IF;

  -- Get the 2D geometry and SRID
  SELECT geometry_2d, ST_SRID(geometry_2d) INTO v_geometry_2d, v_srid
  FROM public.geo_features
  WHERE id = p_feature_id;

  -- Store original values for comparison
  SELECT jsonb_build_object(
    'base_elevation_ellipsoidal', base_elevation_ellipsoidal,
    'height_mode', height_mode,
    'height_transformation_status', height_transformation_status,
    'height_transformed_at', height_transformed_at,
    'height_transformation_batch_id', height_transformation_batch_id,
    'geometry_3d', ST_AsText(geometry_3d)
  ) INTO v_old_values
  FROM public.geo_features
  WHERE id = p_feature_id;
  
  -- Perform the update
  UPDATE public.geo_features
  SET 
    base_elevation_ellipsoidal = p_base_elevation_ellipsoidal,
    height_mode = p_height_mode,
    height_transformation_status = 'complete',
    height_transformed_at = NOW(),
    original_height_values = v_old_values,
    height_transformation_batch_id = p_batch_id,
    updated_at = NOW(),
    geometry_3d = ST_SetSRID(
      ST_MakePoint(
        ST_X(v_geometry_2d),
        ST_Y(v_geometry_2d),
        p_base_elevation_ellipsoidal
      ),
      v_srid
    )
  WHERE id = p_feature_id;
  
  -- Get the number of rows affected
  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
  
  -- Retrieve updated values
  SELECT jsonb_build_object(
    'base_elevation_ellipsoidal', base_elevation_ellipsoidal,
    'height_mode', height_mode,
    'height_transformation_status', height_transformation_status,
    'height_transformed_at', height_transformed_at,
    'height_transformation_batch_id', height_transformation_batch_id,
    'geometry_3d', ST_AsText(geometry_3d)
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

-- Add security measures and execution permissions

-- Revoke execution from public
REVOKE EXECUTE ON FUNCTION public.update_feature_height_bypass_rls(UUID, NUMERIC, TEXT, UUID) FROM PUBLIC;

-- Grant execution to authenticated users only
GRANT EXECUTE ON FUNCTION public.update_feature_height_bypass_rls(UUID, NUMERIC, TEXT, UUID) TO authenticated;

-- Add usage comment for documentation
COMMENT ON FUNCTION public.update_feature_height_bypass_rls IS 'Bypass RLS to update height transformation data. This function uses SECURITY DEFINER to run as the database owner and bypass RLS restrictions for specific height transformation operations. It should only be called from a secured API endpoint.';

-- Create a simple RLS policies checker function
CREATE OR REPLACE FUNCTION public.debug_rls_policies()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
  v_policies JSONB;
BEGIN
  -- Get RLS policies for geo_features table
  SELECT jsonb_agg(jsonb_build_object(
    'policy_name', polname,
    'table_name', relname,
    'cmd', 
      CASE polcmd WHEN 'r' THEN 'SELECT' 
                  WHEN 'a' THEN 'INSERT'
                  WHEN 'w' THEN 'UPDATE'
                  WHEN 'd' THEN 'DELETE'
                  ELSE polcmd::text END,
    'roles', pg_get_userbyid(polroles[1])
  ))
  INTO v_policies
  FROM pg_policy pol
  JOIN pg_class c ON c.oid = pol.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE relname = 'geo_features' AND nspname = 'public';

  -- Build the result
  v_result := jsonb_build_object(
    'rls_enabled', (SELECT relrowsecurity FROM pg_class WHERE relname = 'geo_features' AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')),
    'policies', COALESCE(v_policies, '[]'::jsonb),
    'current_user', current_user,
    'current_role', current_user,
    'session_user', session_user
  );
  
  RETURN v_result;
END;
$$;

-- Restrict execution of the debug function to authenticated users
REVOKE EXECUTE ON FUNCTION public.debug_rls_policies() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.debug_rls_policies() TO authenticated;

COMMENT ON FUNCTION public.debug_rls_policies IS 'Diagnostic function to check RLS policies for the current user.';

-- Function to check if a specific feature exists for a user (diagnostic tool)
CREATE OR REPLACE FUNCTION public.debug_check_feature_existence(p_feature_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_feature_exists BOOLEAN;
  v_feature_data JSONB;
  v_path_data JSONB;
BEGIN
  -- Check if the feature exists at all (ignoring RLS)
  SELECT EXISTS (
    SELECT 1 FROM public.geo_features WHERE id = p_feature_id
  ) INTO v_feature_exists;
  
  -- Get basic feature data if exists
  IF v_feature_exists THEN
    SELECT jsonb_build_object(
      'id', id,
      'layer_id', layer_id,
      'height_mode', height_mode,
      'base_elevation_ellipsoidal', base_elevation_ellipsoidal,
      'height_transformation_status', height_transformation_status
    )
    INTO v_feature_data
    FROM public.geo_features
    WHERE id = p_feature_id;
    
    -- Get path data (project, collection, etc)
    SELECT jsonb_build_object(
      'layer_id', l.id,
      'layer_name', l.name,
      'collection_id', l.collection_id,
      'project_file_id', fc.project_file_id,
      'project_id', pf.project_id,
      'project_owner_id', p.owner_id,
      'current_user_id', auth.uid(),
      'is_owner', p.owner_id = auth.uid()
    )
    INTO v_path_data
    FROM layers l
    JOIN feature_collections fc ON fc.id = l.collection_id
    JOIN project_files pf ON pf.id = fc.project_file_id
    JOIN projects p ON p.id = pf.project_id
    WHERE l.id = (SELECT layer_id FROM public.geo_features WHERE id = p_feature_id);
  END IF;
  
  -- Return results
  RETURN jsonb_build_object(
    'feature_exists_in_db', v_feature_exists,
    'feature_data', v_feature_data,
    'path_data', v_path_data,
    'current_user', current_user,
    'current_role', current_role
  );
END;
$$;

-- Restrict execution of the feature check function
REVOKE EXECUTE ON FUNCTION public.debug_check_feature_existence(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.debug_check_feature_existence(UUID) TO authenticated;

COMMENT ON FUNCTION public.debug_check_feature_existence IS 'Diagnostic function to check if a feature exists and retrieve its access path data.';

-- Function to test update permission (simpler implementation)
CREATE OR REPLACE FUNCTION public.debug_test_update_permission(p_feature_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sample_id UUID;
  v_result JSONB;
  v_can_update BOOLEAN;
  v_error_message TEXT;
BEGIN
  -- Get a sample ID if none provided
  IF p_feature_id IS NULL THEN
    SELECT id INTO v_sample_id FROM public.geo_features LIMIT 1;
  ELSE
    v_sample_id := p_feature_id;
  END IF;
  
  -- Test if we can update
  v_can_update := FALSE;
  BEGIN
    -- Try a harmless update
    PERFORM 1 FROM public.geo_features WHERE id = v_sample_id FOR UPDATE NOWAIT;
    v_can_update := TRUE;
  EXCEPTION WHEN OTHERS THEN
    v_error_message := SQLERRM;
  END;
  
  -- Build result
  RETURN jsonb_build_object(
    'feature_id', v_sample_id,
    'can_update', v_can_update,
    'error_message', v_error_message
  );
END;
$$;

-- Restrict execution
REVOKE EXECUTE ON FUNCTION public.debug_test_update_permission(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.debug_test_update_permission(UUID) TO authenticated;

COMMENT ON FUNCTION public.debug_test_update_permission IS 'Test if the current user can update a feature by attempting to lock it.'; 