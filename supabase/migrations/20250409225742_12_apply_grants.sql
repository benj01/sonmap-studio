-- Apply default privileges and specific grants
-- Note: Supabase manages default grants (e.g., SELECT on public tables to authenticated).
-- These are explicit grants, potentially overriding or supplementing defaults.

-- Grant function execution rights (adjust roles as necessary)

-- Transaction control (if used directly by clients)
GRANT EXECUTE ON FUNCTION public.begin_transaction() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.commit_transaction() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rollback_transaction() TO authenticated, service_role;

-- File/Layer/Feature getters (accessible to users)
GRANT EXECUTE ON FUNCTION public.check_file_import_status(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_available_layers() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_imported_files(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_layer_features(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_layer_features_geojson(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_project_files_with_companions(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_shapefile_companions(uuid) TO authenticated, service_role;

-- Project Member Info
GRANT EXECUTE ON FUNCTION public.get_project_member_counts(uuid[]) TO authenticated, service_role; -- SECURITY DEFINER reviewed

-- Debugging / Admin / Service functions (restrict access appropriately)
GRANT EXECUTE ON FUNCTION public.check_function_details(text) TO service_role; -- Or postgres/admin
GRANT EXECUTE ON FUNCTION public.debug_check_import(uuid) TO service_role; -- Potentially sensitive, restrict if needed
GRANT EXECUTE ON FUNCTION public.force_mark_file_as_imported(uuid, jsonb) TO service_role; -- Service only
GRANT EXECUTE ON FUNCTION public.log_import_message(text, text, jsonb) TO service_role; -- Service only for backend logging
GRANT EXECUTE ON FUNCTION public.monitor_imports() TO service_role; -- Service/Admin only
GRANT EXECUTE ON FUNCTION public.monitor_imports_v2() TO service_role; -- Service/Admin only
GRANT EXECUTE ON FUNCTION public.monitor_imports_v3() TO service_role; -- Service/Admin only
GRANT EXECUTE ON FUNCTION public.track_import_progress(uuid, integer, integer, integer, integer, integer) TO service_role; -- Service only
GRANT EXECUTE ON FUNCTION public.update_import_progress(uuid, integer, integer, uuid, uuid, jsonb) TO service_role; -- Service only
GRANT EXECUTE ON FUNCTION public.update_project_file_import_status(uuid, boolean, jsonb) TO service_role; -- Service only
GRANT EXECUTE ON FUNCTION public.test_warnings() TO authenticated, service_role; -- For testing purposes
GRANT EXECUTE ON FUNCTION public.enable_rls_on_spatial_ref_sys() TO postgres; -- Or dedicated admin role

-- Trigger functions typically do not need direct EXECUTE grants to users,
-- as they are executed by the database system under the definer's rights (if SECURITY DEFINER)
-- or the invoker's rights.

-- Grants on sequences (if needed beyond default ownership)
GRANT USAGE, SELECT ON SEQUENCE public.import_logs_id_seq TO service_role; -- Allow service role to use sequence if inserting logs

-- Default privileges (Supabase usually sets these, but can be explicit)
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO authenticated;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT INSERT, UPDATE, DELETE ON TABLES TO authenticated; -- Be careful with blanket UPDATE/DELETE
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON SEQUENCES TO authenticated;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated;

-- Grant specific table permissions if RLS isn't sufficient or for specific roles
-- Example: Grant service_role full access to logs bypassing RLS checks if needed (use with caution)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_logs TO service_role;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.realtime_import_logs TO service_role; -- Already handled by policy? Double check.

-- Grant usage on PostGIS functions within the extensions schema (if needed)
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA extensions TO authenticated, service_role; -- Grant execute on PostGIS/plv8 functions