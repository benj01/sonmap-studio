CREATE OR REPLACE FUNCTION public.debug_rls_policies()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
  v_policies JSONB;
  v_test_update JSONB;
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

  -- Test update permissions on a sample row
  BEGIN
    -- First get a sample row ID
    DECLARE
      v_sample_id UUID;
    BEGIN
      SELECT id INTO v_sample_id FROM public.geo_features LIMIT 1;
      
      IF v_sample_id IS NULL THEN
        v_test_update := jsonb_build_object(
          'status', 'no_rows_found',
          'message', 'No rows found in geo_features table to test update permission'
        );
      ELSE
        -- Try a harmless update that should be rolled back
        BEGIN
          SAVEPOINT test_update;
          
          UPDATE public.geo_features
          SET updated_at = updated_at
          WHERE id = v_sample_id;
          
          v_test_update := jsonb_build_object(
            'status', 'success',
            'message', 'Update permission test successful',
            'feature_id', v_sample_id,
            'affected_rows', 1
          );
          
          ROLLBACK TO SAVEPOINT test_update;
        EXCEPTION WHEN others THEN
          v_test_update := jsonb_build_object(
            'status', 'error',
            'message', SQLERRM,
            'feature_id', v_sample_id
          );
          ROLLBACK TO SAVEPOINT test_update;
        END;
      END IF;
    END;
  EXCEPTION WHEN others THEN
    v_test_update := jsonb_build_object(
      'status', 'error',
      'message', SQLERRM
    );
  END;
  
  -- Try direct height column update on a sample row
  DECLARE
    v_height_update JSONB;
    v_sample_id UUID;
  BEGIN
    SELECT id INTO v_sample_id FROM public.geo_features LIMIT 1;
    
    IF v_sample_id IS NULL THEN
      v_height_update := jsonb_build_object(
        'status', 'no_rows_found',
        'message', 'No rows found in geo_features table to test height update'
      );
    ELSE
      BEGIN
        SAVEPOINT test_height_update;
        
        UPDATE public.geo_features
        SET base_elevation_ellipsoidal = 455.65,
            height_mode = 'absolute_ellipsoidal',
            height_transformation_status = 'complete',
            height_transformed_at = NOW()
        WHERE id = v_sample_id;
        
        v_height_update := jsonb_build_object(
          'status', 'success',
          'message', 'Height update test successful',
          'feature_id', v_sample_id,
          'affected_rows', 1
        );
        
        ROLLBACK TO SAVEPOINT test_height_update;
      EXCEPTION WHEN others THEN
        v_height_update := jsonb_build_object(
          'status', 'error',
          'message', SQLERRM,
          'feature_id', v_sample_id
        );
        ROLLBACK TO SAVEPOINT test_height_update;
      END;
    END IF;
  EXCEPTION WHEN others THEN
    v_height_update := jsonb_build_object(
      'status', 'error',
      'message', SQLERRM
    );
  END;
  
  -- Build the result
  v_result := jsonb_build_object(
    'rls_enabled', (SELECT relrowsecurity FROM pg_class WHERE relname = 'geo_features' AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')),
    'policies', COALESCE(v_policies, '[]'::jsonb),
    'update_test', v_test_update,
    'height_update_test', v_height_update,
    'current_user', current_user,
    'current_role', current_user,
    'session_user', session_user
  );
  
  RETURN v_result;
END;
$$; 