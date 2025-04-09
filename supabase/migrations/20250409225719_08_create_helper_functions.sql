-- Helper functions (excluding the main import/transform functions)

-- Generic function to update the 'updated_at' timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;
COMMENT ON FUNCTION public.update_updated_at() IS 'Generic trigger function to set the updated_at column to the current timestamp.';

-- Note: update_updated_at_column seems identical to update_updated_at. Consolidating to one.
-- CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS trigger ...

-- Trigger function to set user ID on profile creation (from Supabase auth trigger)
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public -- Ensure it can find public.profiles
    AS $$
begin
    insert into public.profiles (id)
    values (new.id);
    return new;
end;
$$;
COMMENT ON FUNCTION public.handle_new_user() IS 'Trigger function to automatically create a profile entry when a new user signs up in auth.users.';


-- Trigger function to set the uploader user ID
CREATE OR REPLACE FUNCTION public.set_uploaded_by() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER -- Needs definer to access auth.uid() reliably in triggers
    AS $$
BEGIN
  NEW.uploaded_by = auth.uid();
  RETURN NEW;
END;
$$;
COMMENT ON FUNCTION public.set_uploaded_by() IS 'Trigger function to set the uploaded_by column to the authenticated user ID during insert.';

-- Trigger function to delete companion files when a main shapefile record is deleted
CREATE OR REPLACE FUNCTION public.delete_shapefile_companions() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Delete all companion files referencing the deleted main file
    DELETE FROM public.project_files
    WHERE main_file_id = OLD.id;

    RETURN OLD; -- Required for AFTER DELETE trigger
END;
$$;
COMMENT ON FUNCTION public.delete_shapefile_companions() IS 'Trigger function to automatically delete companion files (e.g., .dbf, .shx) when the main file record (.shp) is deleted.';

-- Trigger function to update project storage usage on insert/delete of files
CREATE OR REPLACE FUNCTION public.update_project_storage() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER -- Use definer if RLS might block direct update by user
    SET search_path = public -- Ensure visibility of projects and project_files
    AS $$
DECLARE
  v_project_id uuid;
BEGIN
  -- Determine project_id based on INSERT or DELETE
  IF TG_OP = 'INSERT' THEN
    v_project_id := NEW.project_id;
  ELSIF TG_OP = 'DELETE' THEN
    v_project_id := OLD.project_id;
  ELSE -- Should not happen for INSERT/DELETE triggers
    RAISE WARNING 'update_project_storage trigger called for unhandled TG_OP: %', TG_OP;
    RETURN NULL;
  END IF;

  -- Update the projects table with the new total storage
  UPDATE public.projects
  SET storage_used = COALESCE((
      SELECT SUM(pf.size)
      FROM public.project_files pf
      WHERE pf.project_id = v_project_id
    ), 0) -- Ensure storage is 0 if no files remain
  WHERE id = v_project_id;

  -- Return appropriate value based on operation
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NULL; -- Should not be reached
END;
$$;
COMMENT ON FUNCTION public.update_project_storage() IS 'Trigger function to recalculate and update the storage_used column in the projects table after project_files are inserted or deleted.';


-- Other utility/getter functions

CREATE OR REPLACE FUNCTION public.begin_transaction() RETURNS void
    LANGUAGE plpgsql
    AS $$ BEGIN NULL; END; $$;
COMMENT ON FUNCTION public.begin_transaction() IS 'Placeholder function for explicit transaction start (often a no-op in standard SQL execution).';

CREATE OR REPLACE FUNCTION public.commit_transaction() RETURNS void
    LANGUAGE plpgsql
    AS $$ BEGIN NULL; END; $$;
COMMENT ON FUNCTION public.commit_transaction() IS 'Placeholder function for explicit transaction commit (often a no-op in standard SQL execution).';

CREATE OR REPLACE FUNCTION public.rollback_transaction() RETURNS void
    LANGUAGE plpgsql
    AS $$ BEGIN ROLLBACK; END; $$;
COMMENT ON FUNCTION public.rollback_transaction() IS 'Placeholder function for explicit transaction rollback.';

CREATE OR REPLACE FUNCTION public.check_file_import_status(file_id uuid) RETURNS json
    LANGUAGE plpgsql STABLE SECURITY DEFINER -- Use STABLE as it reads data, SECURITY DEFINER likely needed if RLS is strict
    SET search_path TO 'public'
    AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'id', pf.id,
    'is_imported', pf.is_imported,
    'has_metadata', (pf.import_metadata IS NOT NULL AND pf.import_metadata != '{}'::jsonb) -- Check if metadata is actually populated
  ) INTO result
  FROM public.project_files pf
  WHERE pf.id = file_id;

  RETURN result;
END;
$$;
COMMENT ON FUNCTION public.check_file_import_status(uuid) IS 'Checks the import status and metadata presence for a given project file ID.';


CREATE OR REPLACE FUNCTION public.check_function_details(function_name_param text) RETURNS TABLE(schema_name text, function_name text, argument_types text, return_type text, security_type text, is_strict boolean, description text)
    LANGUAGE sql STABLE SECURITY DEFINER -- Reads system catalogs
    SET search_path = pg_catalog -- Ensure access to system catalogs
    AS $$
  SELECT
    n.nspname::text AS schema_name,
    p.proname::text AS function_name,
    pg_get_function_arguments(p.oid)::text AS argument_types,
    pg_get_function_result(p.oid)::text AS return_type,
    CASE
      WHEN p.prosecdef THEN 'SECURITY DEFINER'
      ELSE 'SECURITY INVOKER'
    END::text AS security_type,
    p.proisstrict AS is_strict,
    d.description::text
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  LEFT JOIN pg_description d ON p.oid = d.objoid
  WHERE p.proname = function_name_param;
$$;
COMMENT ON FUNCTION public.check_function_details(text) IS 'Retrieves details about a specified PostgreSQL function from system catalogs.';

CREATE OR REPLACE FUNCTION public.debug_check_import(p_file_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER -- Reads data, definer likely needed for cross-table RLS checks
    SET search_path TO 'public'
    AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'file_id', pf.id,
    'file_name', pf.name,
    'file_type', pf.type,
    'is_imported', pf.is_imported,
    'import_status_metadata', pf.import_metadata->>'status', -- Example: If status is stored in metadata
    'import_metadata', pf.import_metadata,
    'collections', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'collection_id', c.id,
        'collection_name', c.name,
        'layers', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'layer_id', l.id,
            'layer_name', l.name,
            'feature_count', (SELECT count(*) FROM public.geo_features gf WHERE gf.layer_id = l.id)
          ))
          FROM public.layers l
          WHERE l.collection_id = c.id
        ), '[]'::jsonb)
      ))
      FROM public.feature_collections c
      WHERE c.project_file_id = pf.id
    ), '[]'::jsonb)
  ) INTO v_result
  FROM public.project_files pf
  WHERE pf.id = p_file_id;

  RETURN v_result;
END;
$$;
COMMENT ON FUNCTION public.debug_check_import(uuid) IS 'Provides a detailed JSONB summary of an import file, its collections, layers, and feature counts for debugging.';


-- This function is potentially dangerous and should likely only be available to service_role
CREATE OR REPLACE FUNCTION public.force_mark_file_as_imported(p_file_id uuid, p_metadata jsonb) RETURNS boolean
    LANGUAGE plpgsql VOLATILE SECURITY DEFINER -- Modifies data, definer needed
    SET search_path TO 'public'
    AS $$
DECLARE
  rows_affected INTEGER;
BEGIN
  UPDATE public.project_files
  SET
    is_imported = TRUE,
    import_metadata = p_metadata,
    updated_at = now() -- Ensure updated_at is set
  WHERE id = p_file_id;

  GET DIAGNOSTICS rows_affected = ROW_COUNT;

  RETURN rows_affected > 0;
END;
$$;
COMMENT ON FUNCTION public.force_mark_file_as_imported(uuid, jsonb) IS 'Manually marks a project file as imported and sets its metadata. Use with caution.';


CREATE OR REPLACE FUNCTION public.get_available_layers() RETURNS TABLE(layer_id uuid, layer_name text, feature_count bigint, bounds jsonb, properties jsonb)
    LANGUAGE plpgsql STABLE -- Reads data
    SET search_path TO 'public', 'extensions' -- Need extensions for ST_* functions
    AS $$
BEGIN
    RETURN QUERY
    WITH layer_stats AS (
        SELECT
            l.id,
            l.name,
            COUNT(gf.id) as feature_count,
            CASE
                WHEN COUNT(gf.id) > 0 THEN
                    jsonb_build_object(
                        'bbox', ST_AsGeoJSON(ST_Extent(gf.geometry_2d))::jsonb, -- Use geometry_2d
                        'center', jsonb_build_object(
                            'lng', ST_X(ST_Centroid(ST_Extent(gf.geometry_2d))), -- Use geometry_2d
                            'lat', ST_Y(ST_Centroid(ST_Extent(gf.geometry_2d)))  -- Use geometry_2d
                        )
                    )
                ELSE NULL
            END as bounds,
            l.properties
        FROM
            public.layers l
            LEFT JOIN public.geo_features gf ON l.id = gf.layer_id
        GROUP BY
            l.id, l.name, l.properties
    )
    SELECT
        ls.id,
        ls.name,
        ls.feature_count,
        ls.bounds,
        ls.properties
    FROM layer_stats ls
    ORDER BY ls.name;
END;
$$;
COMMENT ON FUNCTION public.get_available_layers() IS 'Retrieves a list of all available layers with their feature count, bounding box, and properties.';

-- Changed parameter name for clarity
CREATE OR REPLACE FUNCTION public.get_imported_files(p_project_id uuid) RETURNS TABLE(id uuid, name text, type text, storage_path text, import_metadata jsonb, uploaded_at timestamp with time zone)
    LANGUAGE plpgsql STABLE -- Reads data
    SET search_path TO 'public'
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        pf.id,
        pf.name,
        pf.type,
        pf.storage_path,
        pf.import_metadata,
        pf.uploaded_at
    FROM public.project_files pf
    WHERE pf.project_id = p_project_id -- Filter by project ID
      AND pf.is_imported = true       -- Only return imported files
    ORDER BY pf.uploaded_at DESC;
END;
$$;
COMMENT ON FUNCTION public.get_imported_files(uuid) IS 'Retrieves a list of successfully imported files for a given project ID.';

-- Changed parameter name for clarity
CREATE OR REPLACE FUNCTION public.get_layer_features(p_layer_id uuid) RETURNS TABLE(id uuid, properties jsonb, geojson text, srid integer)
    LANGUAGE plpgsql STABLE SECURITY DEFINER -- Reads potentially sensitive feature data
    SET search_path TO 'public', 'extensions' -- Need extensions for ST_AsGeoJSON
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        f.id,
        f.properties,
        ST_AsGeoJSON(f.geometry_2d) as geojson, -- Use geometry_2d (already WGS84)
        4326 as srid -- The geometry_2d is always 4326
    FROM public.geo_features f
    WHERE f.layer_id = p_layer_id;
END;
$$;
COMMENT ON FUNCTION public.get_layer_features(uuid) IS 'Retrieves all features for a given layer ID as individual rows with GeoJSON geometry.';


CREATE OR REPLACE FUNCTION public.get_layer_features_geojson(p_layer_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER -- Reads potentially sensitive feature data
    SET search_path TO 'public', 'extensions' -- Need extensions for ST_AsGeoJSON
    AS $$
DECLARE
    v_features jsonb;
BEGIN
    SELECT jsonb_build_object(
        'type', 'FeatureCollection',
        'features', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'type', 'Feature',
                    'id', gf.id,
                    'geometry', ST_AsGeoJSON(gf.geometry_2d)::jsonb, -- Use geometry_2d
                    'properties', gf.properties
                ) ORDER BY gf.id -- Add deterministic ordering if needed
            ),
            '[]'::jsonb -- Return empty array if no features
        )
    )
    INTO v_features
    FROM public.geo_features gf
    WHERE gf.layer_id = p_layer_id;

    RETURN v_features;
END;
$$;
COMMENT ON FUNCTION public.get_layer_features_geojson(uuid) IS 'Retrieves all features for a given layer ID as a single GeoJSON FeatureCollection.';


CREATE OR REPLACE FUNCTION public.get_project_files_with_companions(project_id_param uuid) RETURNS TABLE(id uuid, name text, type text, storage_path text, size bigint, uploaded_at timestamp with time zone, is_shapefile_component boolean, component_type text, companion_files jsonb)
    LANGUAGE plpgsql STABLE -- Reads data
    SET search_path TO 'public'
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        pf.id,
        pf.name,
        pf.type,
        pf.storage_path,
        pf.size,
        pf.uploaded_at,
        pf.is_shapefile_component,
        pf.component_type,
        COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', c.id,
                'name', c.name,
                'component_type', c.component_type,
                'storage_path', c.storage_path,
                'size', c.size
            ) ORDER BY c.component_type) -- Order companions predictably
            FROM public.project_files c
            WHERE c.main_file_id = pf.id
        ), '[]'::jsonb) as companion_files
    FROM public.project_files pf
    WHERE
        pf.project_id = project_id_param
        AND pf.main_file_id IS NULL -- Only fetch main files (companions handled in jsonb_agg)
    ORDER BY pf.uploaded_at DESC;
END;
$$;
COMMENT ON FUNCTION public.get_project_files_with_companions(uuid) IS 'Retrieves main project files for a given project, along with an aggregated JSONB list of their companion files.';


CREATE OR REPLACE FUNCTION public.get_project_member_counts(project_ids_param uuid[]) RETURNS TABLE(project_id uuid, member_count bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER -- Reads membership data, potentially across projects user isn't owner of
    SET search_path TO 'public'
    AS $$
begin
  return query
    select
      pm.project_id,
      count(distinct pm.user_id)::bigint as member_count
    from public.project_members pm
    where
      pm.project_id = any(project_ids_param) -- Use parameter name
      and pm.joined_at is not null  -- Only count members who have actually joined
    group by pm.project_id;
end;
$$;
COMMENT ON FUNCTION public.get_project_member_counts(uuid[]) IS 'Calculates the number of joined members for a given list of project IDs.';


-- Changed parameter name for clarity
CREATE OR REPLACE FUNCTION public.get_shapefile_companions(p_main_file_id uuid) RETURNS TABLE(id uuid, name text, type text, storage_path text, component_type text, uploaded_at timestamp with time zone)
    LANGUAGE plpgsql STABLE -- Reads data
    SET search_path TO 'public'
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        pf.id,
        pf.name,
        pf.type,
        pf.storage_path,
        pf.component_type,
        pf.uploaded_at
    FROM public.project_files pf
    WHERE pf.main_file_id = p_main_file_id
    ORDER BY pf.component_type; -- Order by type (e.g., dbf, prj, shx)
END;
$$;
COMMENT ON FUNCTION public.get_shapefile_companions(uuid) IS 'Retrieves the companion files associated with a main project file ID (e.g., the .shp file).';


-- Simplified logging functions (assuming they insert into import_logs)
CREATE OR REPLACE FUNCTION public.log_import_message(p_level text, p_message text, p_details jsonb DEFAULT NULL::jsonb) RETURNS void
    LANGUAGE plpgsql VOLATILE -- Modifies data (inserts log)
    SET search_path = public
    AS $$
BEGIN
    INSERT INTO public.import_logs (level, message, details)
    VALUES (p_level, p_message, p_details);
END;
$$;
COMMENT ON FUNCTION public.log_import_message(text, text, jsonb) IS 'Inserts a log entry into the import_logs table.';

-- Consolidate logging functions if they do the same thing
-- CREATE OR REPLACE FUNCTION public.log_import(p_collection_id uuid, p_message text, p_level text DEFAULT 'info'::text, p_details jsonb DEFAULT NULL::jsonb) ...
-- CREATE OR REPLACE FUNCTION public.log_import_operation(p_operation text, p_details jsonb) ...


-- Monitoring functions (potentially resource-intensive, might restrict to service_role)
CREATE OR REPLACE FUNCTION public.monitor_imports() RETURNS void
    LANGUAGE plpgsql VOLATILE SECURITY DEFINER -- Reads pg_stat_activity, potentially sensitive
    SET search_path = public, pg_catalog
    AS $$
DECLARE
    v_start timestamp;
    v_query text;
    v_count int := 0;
BEGIN
    v_start := clock_timestamp();
    RAISE WARNING '[MonitorV1] Starting import monitoring at %', v_start;

    FOR i IN 1..15 LOOP -- Check every second for 15 seconds
        SELECT count(*) INTO v_count
        FROM pg_stat_activity
        WHERE query LIKE '%import_geo_features%' -- Match any import function potentially
          AND state = 'active' -- Only look at active queries
          AND pid <> pg_backend_pid() -- Exclude self
          AND datname = current_database(); -- Only this database

        IF v_count > 0 THEN
            RAISE WARNING '[MonitorV1] Found % active import queries at %', v_count, clock_timestamp();

            FOR v_query IN
                SELECT query
                FROM pg_stat_activity
                WHERE query LIKE '%import_geo_features%'
                  AND state = 'active'
                  AND pid <> pg_backend_pid()
                  AND datname = current_database()
                LIMIT 5 -- Limit output
            LOOP
                RAISE WARNING '[MonitorV1] Active Query: %', left(v_query, 200); -- Show truncated query
            END LOOP;
        END IF;

        PERFORM pg_sleep(1);
    END LOOP;

    RAISE WARNING '[MonitorV1] Monitoring completed at %', clock_timestamp();
END;
$$;
COMMENT ON FUNCTION public.monitor_imports() IS 'Basic import monitoring function that checks pg_stat_activity for active import queries.';


CREATE OR REPLACE FUNCTION public.monitor_imports_v2() RETURNS void
    LANGUAGE plpgsql VOLATILE SECURITY DEFINER -- Reads system stats, inserts logs
    SET search_path = public, pg_catalog
    AS $$
DECLARE
    v_count int;
    v_query_details text;
    v_start_time timestamptz;
    v_end_time timestamptz;
    v_duration_secs numeric;
BEGIN
    v_start_time := clock_timestamp();

    -- Create a temporary table to track changes (consider making it UNLOGGED for performance if recovery not needed)
    CREATE TEMP TABLE IF NOT EXISTS import_monitoring_stats (
        capture_time timestamptz,
        table_name text,
        n_tup_ins bigint,
        n_tup_del bigint,
        n_live_tup bigint,
        n_dead_tup bigint,
        db_xact_commit bigint,
        db_xact_rollback bigint
    );

    -- Log start using the consolidated function
    PERFORM public.log_import_message('info', 'Starting enhanced import monitoring (V2)', jsonb_build_object('start_time', v_start_time));

    FOR i IN 1..60 LOOP  -- Monitor every 100ms for 6 seconds (adjust as needed)
        -- Capture table statistics
        INSERT INTO import_monitoring_stats
        SELECT
            clock_timestamp(),
            stat.relname,
            stat.n_tup_ins,
            stat.n_tup_del,
            stat.n_live_tup,
            stat.n_dead_tup,
            db.xact_commit,
            db.xact_rollback
        FROM pg_stat_user_tables stat
        CROSS JOIN pg_stat_database db
        WHERE stat.relname IN ('geo_features', 'feature_collections', 'layers') -- Target tables
          AND db.datname = current_database();

        -- Monitor active queries related to import
        WITH active_import_queries AS (
            SELECT
                pid, query, state, wait_event_type, wait_event,
                now() - query_start as duration, usename, application_name, client_addr
            FROM pg_stat_activity
            WHERE pid <> pg_backend_pid()
              AND datname = current_database()
              AND state = 'active'
              AND (query ILIKE '%import_geo_features%' OR query ILIKE '%INSERT INTO public.geo_features%') -- Look for import functions or direct inserts
              AND query NOT ILIKE '%monitor_imports%' -- Exclude monitoring functions
              AND query NOT ILIKE '%pg_stat_activity%' -- Exclude queries checking stats
        )
        SELECT COUNT(*), string_agg(
            format(E'PID: %s, State: %s, Wait: %s / %s, Dur: %s, User: %s, App: %s\nQuery: %s',
                pid, state, wait_event_type, wait_event, duration, usename, application_name, left(query, 150)
            ), E'\n---\n'
        )
        INTO v_count, v_query_details
        FROM active_import_queries;

        IF v_count > 0 THEN
             PERFORM public.log_import_message(
                'info',
                format('[MonitorV2] Found %s active import-related queries', v_count),
                jsonb_build_object(
                    'queries', v_query_details,
                    'timestamp', clock_timestamp(),
                    'elapsed_seconds', EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time))
                )
            );
        END IF;

        -- Sleep for 100ms
        PERFORM pg_sleep(0.1);
    END LOOP;

    v_end_time := clock_timestamp();
    v_duration_secs := EXTRACT(EPOCH FROM (v_end_time - v_start_time));

    -- Analyze the collected data and log summary
    WITH changes AS (
        SELECT
            table_name,
            max(n_tup_ins) - min(n_tup_ins) as total_inserts,
            max(n_tup_del) - min(n_tup_del) as total_deletes,
            max(db_xact_commit) - min(db_xact_commit) as total_commits,
            max(db_xact_rollback) - min(db_xact_rollback) as total_rollbacks,
            max(n_live_tup) as final_live_rows,
            max(n_dead_tup) as final_dead_rows
        FROM import_monitoring_stats
        GROUP BY table_name
    )
    INSERT INTO public.import_logs(level, message, details)
    SELECT
        'info',
        '[MonitorV2] Import monitoring summary',
        jsonb_build_object(
            'table', table_name,
            'inserts', total_inserts,
            'deletes', total_deletes,
            'commits', total_commits,
            'rollbacks', total_rollbacks,
            'final_live_rows', final_live_rows,
            'final_dead_rows', final_dead_rows,
            'monitoring_duration_seconds', v_duration_secs
        )
    FROM changes;

    -- Cleanup
    DROP TABLE IF EXISTS import_monitoring_stats;
END;
$$;
COMMENT ON FUNCTION public.monitor_imports_v2() IS 'Enhanced import monitoring using temporary tables to track table statistics (inserts, deletes, rows) and active queries over a short period.';


CREATE OR REPLACE FUNCTION public.monitor_imports_v3() RETURNS void
    LANGUAGE plpgsql VOLATILE SECURITY DEFINER -- Reads system stats, inserts logs, changes settings
    SET search_path = public, pg_catalog
    AS $$
DECLARE
    v_start_time timestamptz;
    v_current_time timestamptz;
    v_timeout interval := interval '5 minutes'; -- Max monitoring duration
    v_idle_timeout interval := interval '10 seconds'; -- Exit if no activity detected for this long
    v_last_activity timestamptz := clock_timestamp(); -- Initialize to start time
    v_query_count integer := 0;
    v_message text;
    v_rows_inserted bigint := 0;
    v_rows_processed bigint := 0;
    v_initial_rows bigint;
    v_current_rows bigint;
BEGIN
    -- Log start using the consolidated function
    v_start_time := clock_timestamp();
    PERFORM public.log_import_message('info', 'Starting detailed import monitoring (V3)', jsonb_build_object('start_time', v_start_time, 'max_duration', v_timeout, 'idle_timeout', v_idle_timeout));

    -- Get initial row count for progress estimate
    SELECT count(*) INTO v_initial_rows FROM public.geo_features;

    -- Monitor loop
    WHILE clock_timestamp() - v_start_time < v_timeout LOOP
        -- Check for active import queries
        SELECT count(*) INTO v_query_count
        FROM pg_stat_activity
        WHERE (query ILIKE '%import_geo_features_with_transform%' OR query ILIKE '%INSERT INTO public.geo_features%')
          AND state = 'active'
          AND pid <> pg_backend_pid()
          AND datname = current_database()
          AND query NOT ILIKE '%monitor_imports%';

        -- Get current row count
        SELECT count(*) INTO v_current_rows FROM public.geo_features;
        v_rows_inserted = v_current_rows - v_initial_rows;

        IF v_query_count > 0 THEN
            -- Activity detected
            v_last_activity := clock_timestamp();
            PERFORM public.log_import_message('debug', '[MonitorV3] Active import query found.', jsonb_build_object(
                'active_queries', v_query_count,
                'rows_inserted_so_far', v_rows_inserted,
                'timestamp', v_last_activity
            ));
        ELSIF clock_timestamp() - v_last_activity > v_idle_timeout THEN
            -- No activity for the idle timeout duration, assume completion or stall
            PERFORM public.log_import_message('info', '[MonitorV3] No import activity detected for idle timeout period.', jsonb_build_object(
                'idle_duration_seconds', EXTRACT(EPOCH FROM v_idle_timeout),
                'last_activity_at', v_last_activity,
                'exit_time', clock_timestamp()
            ));
            EXIT; -- Exit the loop
        END IF;

        -- Short sleep between checks
        PERFORM pg_sleep(0.5); -- Check every 500ms
    END LOOP;

    -- Log completion (either by timeout or idle exit)
    v_current_rows := (SELECT count(*) FROM public.geo_features); -- Final count
    v_rows_inserted = v_current_rows - v_initial_rows;
    PERFORM public.log_import_message('info', '[MonitorV3] Import monitoring finished.', jsonb_build_object(
        'total_duration_seconds', EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)),
        'total_rows_inserted', v_rows_inserted,
        'final_total_rows', v_current_rows,
        'reason', CASE WHEN clock_timestamp() - v_start_time >= v_timeout THEN 'timeout' ELSE 'idle_completion' END,
        'end_time', clock_timestamp()
    ));

END;
$$;
COMMENT ON FUNCTION public.monitor_imports_v3() IS 'Monitors import progress by checking for active queries and row count changes in geo_features, exiting after a period of inactivity or a maximum duration.';


-- Testing function to generate warnings
CREATE OR REPLACE FUNCTION public.test_warnings() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE WARNING 'Test warning 1 generated by test_warnings()';
  PERFORM pg_sleep(0.1);
  RAISE WARNING 'Test warning 2 generated by test_warnings()';
  PERFORM pg_sleep(0.1);
  RAISE WARNING 'Test warning 3 generated by test_warnings()';
END;
$$;
COMMENT ON FUNCTION public.test_warnings() IS 'Simple function to generate PostgreSQL WARNING messages for testing logging or monitoring.';


-- Function to log progress (could potentially update realtime_import_logs instead of inserting new rows)
CREATE OR REPLACE FUNCTION public.track_import_progress(p_collection_id uuid, p_total_features integer, p_imported_count integer, p_failed_count integer, p_batch_number integer, p_total_batches integer) RETURNS void
    LANGUAGE plpgsql VOLATILE -- Modifies data (inserts log)
    SET search_path = public
    AS $$
BEGIN
    -- Consider using UPDATE on realtime_import_logs if an entry already exists for this import job
    -- For now, just inserts into the general log table:
    INSERT INTO public.import_logs(level, message, details)
    VALUES (
        'info',
        format('Import progress: %s/%s features (Batch %s/%s)',
            p_imported_count, p_total_features, p_batch_number, p_total_batches),
        jsonb_build_object(
            'collection_id', p_collection_id,
            'total_features', p_total_features,
            'imported_count', p_imported_count,
            'failed_count', p_failed_count,
            'batch_number', p_batch_number,
            'total_batches', p_total_batches,
            'percent_complete', CASE WHEN p_total_features > 0 THEN (p_imported_count::float / p_total_features * 100)::int ELSE 0 END,
            'timestamp', clock_timestamp()
        )
    );
END;
$$;
COMMENT ON FUNCTION public.track_import_progress(uuid, integer, integer, integer, integer, integer) IS 'Logs the progress of a batch import operation.';


-- Function to update the realtime_import_logs table
CREATE OR REPLACE FUNCTION public.update_import_progress(p_import_log_id uuid, p_imported_count integer, p_failed_count integer, p_collection_id uuid DEFAULT NULL::uuid, p_layer_id uuid DEFAULT NULL::uuid, p_metadata jsonb DEFAULT NULL::jsonb) RETURNS void
    LANGUAGE plpgsql VOLATILE SECURITY DEFINER -- Modifies specific log entry
    SET search_path = public
    AS $$
DECLARE
    v_total_features integer;
    v_current_status text;
    v_new_status text;
BEGIN
  -- Get total features and current status from the log entry itself
  SELECT total_features, status INTO v_total_features, v_current_status
  FROM public.realtime_import_logs
  WHERE id = p_import_log_id;

  -- Determine new status
  IF v_total_features IS NOT NULL AND p_imported_count + p_failed_count >= v_total_features THEN
    v_new_status := 'completed';
  ELSIF p_metadata ? 'error' AND p_metadata->>'error' IS NOT NULL THEN -- Check if an error key exists and is not null
    v_new_status := 'failed';
  ELSE
    v_new_status := 'processing';
  END IF;

  -- Prevent moving status backwards from completed/failed unless explicitly handled
  IF v_current_status IN ('completed', 'failed') AND v_new_status = 'processing' THEN
     RAISE WARNING 'Attempted to revert status from % to processing for log ID %', v_current_status, p_import_log_id;
     -- Decide whether to allow revert or keep final status. Keeping final status for now:
     v_new_status := v_current_status;
  END IF;


  UPDATE public.realtime_import_logs
  SET
    imported_count = p_imported_count,
    failed_count = p_failed_count,
    collection_id = COALESCE(p_collection_id, collection_id),
    layer_id = COALESCE(p_layer_id, layer_id),
    metadata = metadata || COALESCE(p_metadata, '{}'::jsonb), -- Merge metadata instead of replacing
    status = v_new_status,
    updated_at = now()
  WHERE id = p_import_log_id;
END;
$$;
COMMENT ON FUNCTION public.update_import_progress(uuid, integer, integer, uuid, uuid, jsonb) IS 'Updates the status, counts, and metadata of a specific entry in the realtime_import_logs table.';


-- Function to update project file status (often called at end of import)
CREATE OR REPLACE FUNCTION public.update_project_file_import_status(p_file_id uuid, p_is_imported boolean, p_import_metadata jsonb) RETURNS void
    LANGUAGE plpgsql VOLATILE SECURITY DEFINER -- Modifies project file data
    SET search_path TO 'public'
    AS $$
BEGIN
    UPDATE public.project_files
    SET
        is_imported = p_is_imported,
        import_metadata = p_import_metadata,
        updated_at = NOW()
    WHERE id = p_file_id;
END;
$$;
COMMENT ON FUNCTION public.update_project_file_import_status(uuid, boolean, jsonb) IS 'Updates the import status and metadata for a specific project file.';


-- Function to enable RLS on spatial_ref_sys (Use with caution)
-- Note: spatial_ref_sys might be in 'public' or another schema depending on PostGIS installation method.
-- Supabase usually installs PostGIS into the 'extensions' schema, but keeps spatial_ref_sys/geometry_columns in 'public'.
CREATE OR REPLACE FUNCTION public.enable_rls_on_spatial_ref_sys() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER -- Needs high privileges to alter system tables
    AS $$
BEGIN
  -- Check if the table exists in 'public' before altering
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'spatial_ref_sys') THEN
      ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY;
      RAISE NOTICE 'Enabled RLS on public.spatial_ref_sys';
      -- Add a default permissive policy if needed, otherwise it becomes inaccessible
      -- CREATE POLICY spatial_ref_sys_select_policy ON public.spatial_ref_sys FOR SELECT USING (true);
  ELSE
      RAISE WARNING 'Table public.spatial_ref_sys not found. Cannot enable RLS.';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'geometry_columns') THEN
      ALTER TABLE public.geometry_columns ENABLE ROW LEVEL SECURITY;
      RAISE NOTICE 'Enabled RLS on public.geometry_columns';
      -- CREATE POLICY geometry_columns_select_policy ON public.geometry_columns FOR SELECT USING (true);
  ELSE
      RAISE WARNING 'Table public.geometry_columns not found. Cannot enable RLS.';
  END IF;

END;
$$;
COMMENT ON FUNCTION public.enable_rls_on_spatial_ref_sys() IS 'Enables Row Level Security on PostGIS metadata tables (public.spatial_ref_sys, public.geometry_columns). USE WITH CAUTION and ensure appropriate policies are created.';


-- EXCLUDED functions (as requested):
-- public.import_geo_features(...) -- Older version
-- public.import_geo_features_test(...) -- Older version or specific test helper
-- public.import_geo_features_with_transform(...) -- The main new import function
-- public.import_single_feature(...) -- Older version or specific test helper
-- public.transform_swiss_coords_swisstopo(...) -- The plv8 Swisstopo API function