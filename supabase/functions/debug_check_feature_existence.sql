CREATE OR REPLACE FUNCTION public.debug_check_feature_existence(p_feature_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
  v_count INT;
  v_feature JSONB;
  v_policies_info JSONB;
  v_triggers_info JSONB;
  v_current_user TEXT;
  v_test_update_result BOOLEAN;
  v_error_message TEXT;
BEGIN
  -- Store current user
  v_current_user := current_user;
  
  -- Check if the feature exists and how many with that ID
  SELECT COUNT(*) INTO v_count 
  FROM public.geo_features 
  WHERE id = p_feature_id;
  
  -- Get feature details if it exists
  IF v_count > 0 THEN
    SELECT jsonb_build_object(
      'id', id,
      'layer_id', layer_id,
      'collection_id', collection_id,
      'height_mode', height_mode,
      'height_transformation_status', height_transformation_status,
      'height_transformation_batch_id', height_transformation_batch_id,
      'created_at', created_at,
      'updated_at', updated_at
    ) INTO v_feature
    FROM public.geo_features
    WHERE id = p_feature_id
    LIMIT 1;
  ELSE
    v_feature := NULL;
  END IF;
  
  -- Get policy information for the table
  SELECT jsonb_agg(
    jsonb_build_object(
      'policy_name', polname,
      'table_name', relname,
      'schema_name', nspname,
      'cmd', cmd
    )
  ) INTO v_policies_info
  FROM pg_policy pol
  JOIN pg_class rel ON rel.oid = pol.polrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE relname = 'geo_features' AND nspname = 'public';
  
  -- Get trigger information for the table
  SELECT jsonb_agg(
    jsonb_build_object(
      'trigger_name', tgname,
      'table_name', relname,
      'schema_name', nspname,
      'timing', CASE WHEN tgtype & 2 > 0 THEN 'BEFORE' ELSE 'AFTER' END,
      'events', 
        CASE 
          WHEN tgtype & 1 > 0 THEN 'INSERT' 
          WHEN tgtype & 4 > 0 THEN 'UPDATE' 
          WHEN tgtype & 8 > 0 THEN 'DELETE' 
          ELSE 'UNKNOWN' 
        END
    )
  ) INTO v_triggers_info
  FROM pg_trigger tg
  JOIN pg_class rel ON rel.oid = tg.tgrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE relname = 'geo_features' AND nspname = 'public';
  
  -- Try a test update if feature exists
  IF v_count > 0 THEN
    BEGIN
      -- Test update - we'll immediately roll back
      START TRANSACTION;
      -- Just update the updated_at timestamp to avoid actual data changes
      UPDATE public.geo_features
      SET updated_at = updated_at
      WHERE id = p_feature_id;
      v_test_update_result := TRUE;
      ROLLBACK;
    EXCEPTION WHEN OTHERS THEN
      v_test_update_result := FALSE;
      v_error_message := SQLERRM;
      ROLLBACK;
    END;
  ELSE
    v_test_update_result := NULL;
  END IF;
  
  -- Build the result
  v_result := jsonb_build_object(
    'feature_id', p_feature_id,
    'exists', v_count > 0,
    'count', v_count,
    'feature', v_feature,
    'current_user', v_current_user,
    'update_test', jsonb_build_object(
      'success', v_test_update_result,
      'error', v_error_message
    ),
    'policies', v_policies_info,
    'triggers', v_triggers_info,
    'table_stats', (
      SELECT jsonb_build_object(
        'total_features', COUNT(*),
        'pending_transformations', SUM(CASE WHEN height_transformation_status = 'pending' THEN 1 ELSE 0 END),
        'completed_transformations', SUM(CASE WHEN height_transformation_status = 'complete' THEN 1 ELSE 0 END)
      )
      FROM public.geo_features
    )
  );
  
  RETURN v_result;
END;
$$; 