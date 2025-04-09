-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS plv8;
-- Add any other extensions you know you enabled remotely (e.g., pg_cron, pg_net?)
-- CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
--
-- PostgreSQL database dump
--

-- Dumped from database version 15.8
-- Dumped by pg_dump version 17.0

-- SET statement_timeout = 0;
-- SET lock_timeout = 0;
-- SET idle_in_transaction_session_timeout = 0;
-- SET transaction_timeout = 0;
-- SET client_encoding = 'UTF8';
-- SET standard_conforming_strings = on;
-- SELECT pg_catalog.set_config('search_path', '', false);
-- SET check_function_bodies = false;
-- SET xmloption = content;
-- SET client_min_messages = warning;
-- SET row_security = off;

--
-- Name: extensions; Type: SCHEMA; Schema: -; Owner: -
--

-- CREATE SCHEMA extensions;


--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: project_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.project_status AS ENUM (
    'active',
    'archived',
    'deleted'
);




--
-- Name: begin_transaction(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.begin_transaction() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Start a new transaction
    -- This is mostly a no-op since we're already in a transaction,
    -- but it's here for consistency
    NULL;
END;
$$;


--
-- Name: check_file_import_status(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.check_file_import_status(file_id uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'id', id,
    'is_imported', is_imported,
    'has_metadata', (import_metadata IS NOT NULL)
  ) INTO result
  FROM project_files
  WHERE id = file_id;

  RETURN result;
END;
$$;


--
-- Name: check_function_details(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.check_function_details(function_name text) RETURNS TABLE(schema_name text, function_name text, argument_types text, return_type text, security_type text, is_strict boolean, description text)
    LANGUAGE sql SECURITY DEFINER
    AS $$
  SELECT
    n.nspname AS schema_name,
    p.proname AS function_name,
    pg_get_function_arguments(p.oid) AS argument_types,
    pg_get_function_result(p.oid) AS return_type,
    CASE
      WHEN p.prosecdef THEN 'SECURITY DEFINER'
      ELSE 'SECURITY INVOKER'
    END AS security_type,
    p.proisstrict AS is_strict,
    d.description
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  LEFT JOIN pg_description d ON p.oid = d.objoid
  WHERE p.proname = function_name;
$$;


--
-- Name: commit_transaction(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.commit_transaction() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Commit the current transaction
    -- This is mostly a no-op since the transaction will be committed anyway,
    -- but it's here for consistency
    NULL;
END;
$$;


--
-- Name: debug_check_import(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.debug_check_import(p_file_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'file_id', pf.id,
    'file_name', pf.name,
    'import_status', pf.import_status,
    'import_metadata', pf.import_metadata,
    'collections', (
      SELECT jsonb_agg(jsonb_build_object(
        'collection_id', c.id,
        'collection_name', c.name,
        'layers', (
          SELECT jsonb_agg(jsonb_build_object(
            'layer_id', l.id,
            'layer_name', l.name,
            'feature_count', (SELECT count(*) FROM geo_features gf WHERE gf.layer_id = l.id)
          ))
          FROM geo_layers l -- Note: Assuming geo_layers exists, was not in provided schema
          WHERE l.collection_id = c.id
        )
      ))
      FROM feature_collections c -- Adjusted to feature_collections
      WHERE c.project_id = pf.project_id AND c.project_file_id = pf.id -- Adjusted column names
    )
  ) INTO v_result
  FROM project_files pf
  WHERE pf.id = p_file_id;

  RETURN v_result;
END;
$$;


--
-- Name: delete_shapefile_companions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.delete_shapefile_companions() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Delete all companion files
    DELETE FROM project_files
    WHERE main_file_id = OLD.id;

    RETURN OLD;
END;
$$;


--
-- Name: enable_rls_on_spatial_ref_sys(); Type: FUNCTION; Schema: public; Owner: -
--

-- Note: spatial_ref_sys is often in the public schema directly after PostGIS install,
-- but might be aliased. If this fails, adjust the schema name as needed.
CREATE OR REPLACE FUNCTION public.enable_rls_on_spatial_ref_sys() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY;
END;
$$;


--
-- Name: force_mark_file_as_imported(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.force_mark_file_as_imported(file_id uuid, metadata jsonb) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  success BOOLEAN;
BEGIN
  UPDATE project_files
  SET
    is_imported = TRUE,
    import_metadata = metadata
  WHERE id = file_id;

  GET DIAGNOSTICS success = ROW_COUNT;

  RETURN success > 0;
END;
$$;


--
-- Name: get_available_layers(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.get_available_layers() RETURNS TABLE(layer_id uuid, layer_name text, feature_count bigint, bounds jsonb, properties jsonb)
    LANGUAGE plpgsql
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
                        'bbox', extensions.ST_AsGeoJSON(extensions.ST_Extent(gf.geometry))::jsonb,
                        'center', jsonb_build_object(
                            'lng', extensions.ST_X(extensions.ST_Centroid(extensions.ST_Extent(gf.geometry))),
                            'lat', extensions.ST_Y(extensions.ST_Centroid(extensions.ST_Extent(gf.geometry)))
                        )
                    )
                ELSE NULL
            END as bounds,
            l.properties
        FROM
            public.layers l -- Explicit schema for clarity
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


--
-- Name: get_imported_files(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.get_imported_files(source_file_id uuid) RETURNS TABLE(id uuid, name text, file_type text, storage_path text, import_metadata jsonb, uploaded_at timestamp with time zone)
    LANGUAGE plpgsql
    AS $_$
BEGIN
    RETURN QUERY
    SELECT
        project_files.id,
        project_files.name,
        project_files.file_type,
        project_files.storage_path,
        project_files.import_metadata,
        project_files.uploaded_at
    FROM public.project_files -- Explicit schema
    WHERE project_files.source_file_id = $1
    ORDER BY project_files.uploaded_at DESC;
END;
$_$;


--
-- Name: get_layer_features(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.get_layer_features(layer_id uuid) RETURNS TABLE(id uuid, properties jsonb, geojson text, srid integer)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $_$
BEGIN
    RETURN QUERY
    SELECT
        f.id,
        f.properties,
        extensions.ST_AsGeoJSON(extensions.ST_Transform(f.geometry, 4326)) as geojson,
        extensions.ST_SRID(f.geometry) as srid
    FROM public.geo_features f -- Explicit schema
    WHERE f.layer_id = $1;
END;
$_$;


--
-- Name: get_layer_features_geojson(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.get_layer_features_geojson(p_layer_id uuid) RETURNS jsonb
    LANGUAGE plpgsql
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
                    'geometry', extensions.ST_AsGeoJSON(extensions.ST_Transform(gf.geometry, 4326))::jsonb,
                    'properties', gf.properties
                )
            ),
            '[]'::jsonb
        )
    )
    INTO v_features
    FROM public.geo_features gf -- Explicit schema
    WHERE gf.layer_id = p_layer_id;

    RETURN v_features;
END;
$$;


--
-- Name: get_project_files_with_companions(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.get_project_files_with_companions(project_id_param uuid) RETURNS TABLE(id uuid, name text, file_type text, storage_path text, size bigint, uploaded_at timestamp with time zone, is_shapefile_component boolean, companion_files jsonb)
    LANGUAGE plpgsql
    AS $$BEGIN
    RETURN QUERY
    SELECT
        pf.id,
        pf.name,
        pf.file_type,
        pf.storage_path,
        pf.size,
        pf.uploaded_at,
        pf.is_shapefile_component,
        (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'id', c.id,
                'name', c.name,
                'component_type', c.component_type,
                'storage_path', c.storage_path,
                'size', c.size
            )), '[]'::jsonb)
            FROM public.project_files c -- Explicit schema
            WHERE c.main_file_id = pf.id
        ) as companion_files
    FROM public.project_files pf -- Explicit schema
    WHERE
        pf.project_id = project_id_param
        AND pf.main_file_id IS NULL
    ORDER BY pf.uploaded_at DESC;
END;$$;


--
-- Name: get_project_member_counts(uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.get_project_member_counts(project_ids uuid[]) RETURNS TABLE(project_id uuid, count bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  return query
    select
      pm.project_id,
      count(distinct pm.user_id)::bigint
    from project_members pm
    where
      pm.project_id = any(project_ids)
      and pm.joined_at is not null  -- Only count members who have actually joined
    group by pm.project_id;
end;
$$;


--
-- Name: get_shapefile_companions(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.get_shapefile_companions(main_file_id uuid) RETURNS TABLE(id uuid, name text, file_type text, storage_path text, component_type text, uploaded_at timestamp with time zone)
    LANGUAGE plpgsql
    AS $_$
BEGIN
    RETURN QUERY
    SELECT
        project_files.id,
        project_files.name,
        project_files.file_type,
        project_files.storage_path,
        project_files.component_type,
        project_files.uploaded_at
    FROM public.project_files -- Explicit schema
    WHERE project_files.main_file_id = $1
    ORDER BY project_files.component_type;
END;
$_$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
begin
    insert into public.profiles (id)
    values (new.id);
    return new;
end;
$$;


--
-- Name: import_geo_features(uuid, text, jsonb, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.import_geo_features(p_project_file_id uuid, p_collection_name text, p_features jsonb, p_source_srid integer, p_target_srid integer) RETURNS TABLE(collection_id uuid, layer_id uuid, imported integer, failed integer)
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_collection_id UUID;
  v_layer_id UUID;
  v_imported INTEGER := 0;
  v_failed INTEGER := 0;
  v_feature JSONB;
  v_geometry extensions.GEOMETRY; -- MODIFIED
  v_last_error TEXT;
BEGIN
  -- Log input parameters
  RAISE NOTICE 'Starting import with parameters: project_file_id: %, collection_name: %, features count: %, source_srid: %, target_srid: %',
    p_project_file_id, p_collection_name, jsonb_array_length(p_features), p_source_srid, p_target_srid;

  -- Log first feature for debugging
  RAISE NOTICE 'First feature structure: %', p_features->0;
  RAISE NOTICE 'First feature geometry: %', (p_features->0)->>'geometry';

  -- Validate input parameters
  IF p_project_file_id IS NULL THEN
    RAISE EXCEPTION 'project_file_id cannot be null';
  END IF;

  IF p_features IS NULL OR jsonb_array_length(p_features) = 0 THEN
    RAISE EXCEPTION 'features array cannot be null or empty';
  END IF;

  -- Create feature collection
  BEGIN
    INSERT INTO public.feature_collections (project_file_id, name) -- Explicit schema
    VALUES (p_project_file_id, p_collection_name)
    RETURNING id INTO v_collection_id;

    RAISE NOTICE 'Created feature collection with ID: %', v_collection_id;
  EXCEPTION WHEN OTHERS THEN
    v_last_error := SQLERRM;
    RAISE EXCEPTION 'Error creating feature collection: %', v_last_error;
  END;

  -- Create layer
  BEGIN
    INSERT INTO public.layers (collection_id, name, type) -- Explicit schema
    VALUES (v_collection_id, 'Default Layer', 'auto')
    RETURNING id INTO v_layer_id;

    RAISE NOTICE 'Created layer with ID: %', v_layer_id;
  EXCEPTION WHEN OTHERS THEN
    v_last_error := SQLERRM;
    DELETE FROM public.feature_collections WHERE id = v_collection_id; -- Explicit schema
    RAISE EXCEPTION 'Error creating layer: %', v_last_error;
  END;

  -- Process each feature
  FOR v_feature IN SELECT * FROM jsonb_array_elements(p_features)
  LOOP
    BEGIN
      -- Log feature being processed
      RAISE NOTICE 'Processing feature: %', v_feature;

      -- Validate feature geometry
      IF v_feature->>'geometry' IS NULL THEN
        RAISE WARNING 'Skipping feature with null geometry';
        v_failed := v_failed + 1;
        CONTINUE;
      END IF;

      -- Try geometry conversion with detailed error handling
      BEGIN
        RAISE NOTICE 'Converting geometry from SRID % to %', p_source_srid, p_target_srid;

        -- First try to create the geometry
        v_geometry := extensions.ST_GeomFromGeoJSON(v_feature->>'geometry');
        IF v_geometry IS NULL THEN
          RAISE EXCEPTION 'Failed to create geometry from GeoJSON';
        END IF;

        -- Force 3D with Z=0 for 2D geometries
        v_geometry := extensions.ST_Force3D(v_geometry);

        -- Then set the SRID
        v_geometry := extensions.ST_SetSRID(v_geometry, p_source_srid);

        -- Finally transform
        v_geometry := extensions.ST_Transform(v_geometry, p_target_srid);

        RAISE NOTICE 'Geometry conversion successful: %', extensions.ST_AsText(v_geometry);
      EXCEPTION WHEN OTHERS THEN
        v_last_error := SQLERRM;
        RAISE WARNING 'Geometry conversion failed: %', v_last_error;
        v_failed := v_failed + 1;
        CONTINUE;
      END;

      -- Insert feature
      BEGIN
        INSERT INTO public.geo_features ( -- Explicit schema
          layer_id,
          geometry,
          properties,
          srid
        )
        VALUES (
          v_layer_id,
          v_geometry,
          COALESCE(v_feature->'properties', '{}'::jsonb),
          p_target_srid
        );

        v_imported := v_imported + 1;
      EXCEPTION WHEN OTHERS THEN
        v_last_error := SQLERRM;
        RAISE WARNING 'Failed to insert feature: %', v_last_error;
        v_failed := v_failed + 1;
      END;

    EXCEPTION WHEN OTHERS THEN
      v_last_error := SQLERRM;
      RAISE WARNING 'Failed to process feature: %', v_last_error;
      v_failed := v_failed + 1;
    END;
  END LOOP;

  -- Verify we have imported at least one feature
  IF v_imported = 0 THEN
    -- Clean up if no features were imported
    DELETE FROM public.layers WHERE id = v_layer_id; -- Explicit schema
    DELETE FROM public.feature_collections WHERE id = v_collection_id; -- Explicit schema
    RAISE EXCEPTION 'No features were successfully imported. Failed count: %. Last error: %', v_failed, v_last_error;
  END IF;

  RAISE NOTICE 'Import completed: % features imported, % failed', v_imported, v_failed;

  RETURN QUERY SELECT
    v_collection_id,
    v_layer_id,
    v_imported,
    v_failed;
END;
$$;


--
-- Name: import_geo_features_test(uuid, text, json, jsonb, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.import_geo_features_test(p_project_id uuid, p_layer_name text, p_geometry json, p_properties jsonb, p_source_srid integer, p_target_srid integer) RETURNS uuid
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_project_file_id uuid;
    v_collection_id uuid;
    v_layer_id uuid;
BEGIN
    -- First create a project file
    INSERT INTO public.project_files ( -- Explicit schema
        project_id,
        name,
        file_type,
        size,
        storage_path,
        uploaded_at,
        is_imported
    ) VALUES (
        p_project_id,
        'Test Import ' || p_layer_name,
        'TEST',
        0,
        'test/import',
        NOW(),
        true
    )
    RETURNING id INTO v_project_file_id;

    -- Create a feature collection
    INSERT INTO public.feature_collections ( -- Explicit schema
        project_file_id,
        name,
        description
    ) VALUES (
        v_project_file_id,
        'Test Collection ' || p_layer_name,
        'Created by test import'
    )
    RETURNING id INTO v_collection_id;

    -- Create the layer
    INSERT INTO public.layers ( -- Explicit schema
        collection_id,
        name,
        type,
        properties
    ) VALUES (
        v_collection_id,
        p_layer_name,
        'Feature',
        '{}'::jsonb
    )
    RETURNING id INTO v_layer_id;

    -- Import a single feature, ensuring 3D geometry
    INSERT INTO public.geo_features ( -- Explicit schema
        layer_id,
        geometry,
        properties,
        srid
    ) VALUES (
        v_layer_id,
        extensions.ST_Force3D(  -- This ensures the geometry is 3D
            extensions.ST_Transform(
                extensions.ST_SetSRID(
                    extensions.ST_GeomFromGeoJSON(p_geometry::text),
                    p_source_srid
                ),
                p_target_srid
            )
        ),
        p_properties,
        p_target_srid
    );

    RETURN v_layer_id;
END;
$$;


--
-- Name: import_geo_features_with_transform(uuid, text, jsonb, integer, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.import_geo_features_with_transform(p_project_file_id uuid, p_collection_name text, p_features jsonb, p_source_srid integer, p_target_srid integer DEFAULT 4326, p_batch_size integer DEFAULT 100) RETURNS TABLE(collection_id uuid, layer_id uuid, imported_count integer, failed_count integer, debug_info jsonb)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_collection_id UUID;
  v_layer_id UUID;
  v_imported_count INTEGER := 0;
  v_failed_count INTEGER := 0;
  v_repaired_count INTEGER := 0;
  v_cleaned_count INTEGER := 0;
  v_skipped_count INTEGER := 0;
  v_feature JSONB;
  v_geometry extensions.GEOMETRY; -- MODIFIED
  v_raw_geometry extensions.GEOMETRY; -- MODIFIED
  v_cleaned_geometry extensions.GEOMETRY; -- MODIFIED
  v_debug JSONB;
  v_last_error TEXT;
  v_last_state TEXT;
  v_index_name TEXT;
  v_geom_type TEXT;
  v_start_time TIMESTAMPTZ;
  v_timeout_seconds INTEGER := 60;
  v_feature_errors JSONB := '[]'::JSONB;
  v_total_features INTEGER;
  v_batch_start INTEGER;
  v_batch_end INTEGER;
  v_batch_size INTEGER;
  v_batch_count INTEGER;
  v_current_batch INTEGER;
  v_notices JSONB := '[]'::JSONB;
  v_debug_info JSONB;
  v_target_dims INTEGER;
  v_dimension_fixes INTEGER := 0;
BEGIN
  -- Get total feature count and log start
  v_total_features := jsonb_array_length(p_features);
  v_batch_size := p_batch_size;
  v_batch_count := CEIL(v_total_features::float / v_batch_size);
  v_current_batch := 0;

  RAISE WARNING 'Starting import of % features with SRID % in % batches',
    v_total_features, p_source_srid, v_batch_count;

  -- Add initial notice
  v_notices := v_notices || jsonb_build_object(
    'level', 'info',
    'message', format('Starting import of %s features with SRID %s in %s batches',
      v_total_features, p_source_srid, v_batch_count),
    'details', jsonb_build_object(
      'total_features', v_total_features,
      'source_srid', p_source_srid,
      'batch_count', v_batch_count
    )
  );

  -- Create collection and layer
  INSERT INTO public.feature_collections (name, project_file_id) -- Explicit schema
  VALUES (p_collection_name, p_project_file_id)
  RETURNING id INTO v_collection_id;

  INSERT INTO public.layers (name, collection_id, type) -- Explicit schema
  VALUES (p_collection_name, v_collection_id, 'vector')
  RETURNING id INTO v_layer_id;

  -- Get target dimension from geo_features table
  SELECT extensions.ST_NDims(geometry) INTO v_target_dims
  FROM public.geo_features -- Explicit schema
  LIMIT 1;

  IF v_target_dims IS NULL THEN
    -- If table is empty, assume 3D
    v_target_dims := 3;
  END IF;

  RAISE WARNING 'Created collection % and layer %. Target geometry dimensions: %',
    v_collection_id, v_layer_id, v_target_dims;

  v_notices := v_notices || jsonb_build_object(
    'level', 'info',
    'message', format('Created collection and layer. Target dimensions: %s', v_target_dims),
    'details', jsonb_build_object(
      'collection_id', v_collection_id,
      'layer_id', v_layer_id,
      'target_dims', v_target_dims
    )
  );

  -- Process features in batches
  FOR v_current_batch IN 0..v_batch_count-1 LOOP
    v_batch_start := v_current_batch * v_batch_size;
    v_batch_end := LEAST(v_batch_start + v_batch_size, v_total_features);

    RAISE WARNING 'Processing batch % of % (features % to %)',
      v_current_batch + 1, v_batch_count, v_batch_start, v_batch_end - 1;

    v_notices := v_notices || jsonb_build_object(
      'level', 'info',
      'message', format('Processing batch %s of %s', v_current_batch + 1, v_batch_count),
      'details', jsonb_build_object(
        'batch_number', v_current_batch + 1,
        'total_batches', v_batch_count,
        'start_index', v_batch_start,
        'end_index', v_batch_end - 1
      )
    );

    -- Process each feature in the current batch
    FOR i IN v_batch_start..v_batch_end-1 LOOP
      v_start_time := clock_timestamp();
      v_feature := p_features->i;

      -- Skip features without geometry
      IF v_feature->'geometry' IS NULL OR v_feature->>'geometry' = 'null' THEN -- Added check for 'null' string
        RAISE WARNING 'Feature % has no geometry object or null geometry', i + 1;
        v_notices := v_notices || jsonb_build_object(
          'level', 'warning',
          'message', format('Feature %s has no geometry object or null geometry', i + 1),
          'details', jsonb_build_object('feature_index', i)
        );
        v_skipped_count := v_skipped_count + 1; -- Count as skipped
        CONTINUE;
      END IF;

      BEGIN
        -- Parse geometry
        v_raw_geometry := extensions.ST_GeomFromGeoJSON(v_feature->'geometry');

        IF v_raw_geometry IS NULL THEN
          RAISE WARNING 'ST_GeomFromGeoJSON returned NULL for feature %', i + 1;
          v_notices := v_notices || jsonb_build_object(
            'level', 'error',
            'message', format('Failed to parse geometry for feature %s', i + 1),
            'details', jsonb_build_object(
              'feature_index', i,
              'geometry', v_feature->'geometry'
            )
          );
          v_failed_count := v_failed_count + 1; -- Count as failed
          CONTINUE;
        END IF;

        -- Clean and validate geometry
        v_cleaned_geometry := extensions.ST_RemoveRepeatedPoints(v_raw_geometry);
        IF NOT extensions.ST_Equals(v_cleaned_geometry, v_raw_geometry) THEN
          v_cleaned_count := v_cleaned_count + 1;
          v_raw_geometry := v_cleaned_geometry;
        END IF;

        -- Handle invalid geometries
        IF NOT extensions.ST_IsValid(v_raw_geometry) THEN
          BEGIN
            -- Try to repair
            v_geometry := COALESCE(
              extensions.ST_Buffer(v_raw_geometry, 0.0),
              extensions.ST_MakeValid(v_raw_geometry)
            );

            IF v_geometry IS NULL OR NOT extensions.ST_IsValid(v_geometry) THEN
              RAISE EXCEPTION 'Failed to repair invalid geometry';
            END IF;

            v_repaired_count := v_repaired_count + 1;
          EXCEPTION WHEN OTHERS THEN
            v_skipped_count := v_skipped_count + 1;
            v_feature_errors := v_feature_errors || jsonb_build_object(
              'feature_index', i,
              'error', SQLERRM,
              'error_state', SQLSTATE,
              'invalid_reason', extensions.ST_IsValidReason(v_raw_geometry)
            );
            CONTINUE;
          END;
        ELSE
          v_geometry := v_raw_geometry;
        END IF;

        -- Transform coordinates
        v_geometry := extensions.ST_Transform(extensions.ST_SetSRID(v_geometry, p_source_srid), p_target_srid);

        -- Handle dimensions
        IF extensions.ST_NDims(v_geometry) < v_target_dims THEN
          v_geometry := extensions.ST_Force3D(v_geometry);
          v_dimension_fixes := v_dimension_fixes + 1;
        END IF;

        -- Insert feature with correct columns
        INSERT INTO public.geo_features ( -- Explicit schema
          layer_id,
          geometry,
          properties,
          srid
        ) VALUES (
          v_layer_id,
          v_geometry,
          COALESCE(v_feature->'properties', '{}'::jsonb),
          p_target_srid
        );

        v_imported_count := v_imported_count + 1;

      EXCEPTION WHEN OTHERS THEN
        v_failed_count := v_failed_count + 1;
        v_feature_errors := v_feature_errors || jsonb_build_object(
          'feature_index', i,
          'error', SQLERRM,
          'error_state', SQLSTATE
        );
      END;
    END LOOP;
  END LOOP;

  -- Prepare debug info
  v_debug_info := jsonb_build_object(
    'repaired_count', v_repaired_count,
    'cleaned_count', v_cleaned_count,
    'skipped_count', v_skipped_count,
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


--
-- Name: import_single_feature(uuid, jsonb, jsonb, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.import_single_feature(p_layer_id uuid, p_geometry jsonb, p_properties jsonb, p_source_srid integer DEFAULT 2056) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_geometry extensions.GEOMETRY; -- MODIFIED
  v_cleaned_geom text;
BEGIN
  -- Log input parameters
  RAISE NOTICE 'Single feature import - Input geometry: %', p_geometry;

  -- Transform the geometry with detailed logging
  BEGIN
    v_cleaned_geom := jsonb_strip_nulls(p_geometry)::text;
    RAISE NOTICE 'Cleaned geometry JSON: %', v_cleaned_geom;

    v_geometry := extensions.ST_GeomFromGeoJSON(v_cleaned_geom);
    RAISE NOTICE 'After ST_GeomFromGeoJSON: %', extensions.ST_AsText(v_geometry);

    v_geometry := extensions.ST_SetSRID(v_geometry, p_source_srid);
    RAISE NOTICE 'After ST_SetSRID: % (SRID: %)', extensions.ST_AsText(v_geometry), extensions.ST_SRID(v_geometry);

    v_geometry := extensions.ST_Transform(v_geometry, 4326);
    RAISE NOTICE 'After ST_Transform: % (SRID: %)', extensions.ST_AsText(v_geometry), extensions.ST_SRID(v_geometry);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Error in geometry processing: % (State: %)', SQLERRM, SQLSTATE;
    RETURN FALSE;
  END;

  -- Insert the feature
  INSERT INTO public.geo_features ( -- Explicit schema
    geometry,
    properties,
    srid,
    layer_id
  )
  VALUES (
    v_geometry,
    COALESCE(p_properties, '{}'::jsonb),
    4326,
    p_layer_id
  );

  RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
  RETURN FALSE;
END;
$$;


--
-- Name: log_import(uuid, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.log_import(p_collection_id uuid, p_message text, p_level text DEFAULT 'info'::text, p_details jsonb DEFAULT NULL::jsonb) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    INSERT INTO public.import_logs (level, message, details) -- Explicit schema
    VALUES (
        p_level,
        p_message,
        jsonb_build_object(
            'collection_id', p_collection_id,
            'details', p_details,
            'timestamp', CURRENT_TIMESTAMP
        )
    );
END;
$$;


--
-- Name: log_import_message(text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.log_import_message(p_level text, p_message text, p_details jsonb DEFAULT NULL::jsonb) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    INSERT INTO public.import_logs (level, message, details) -- Explicit schema
    VALUES (p_level, p_message, p_details);
END;
$$;


--
-- Name: log_import_operation(text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.log_import_operation(p_operation text, p_details jsonb) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    INSERT INTO public.import_logs(level, message, details) -- Explicit schema
    VALUES ('info', p_operation, p_details);
END;
$$;


--
-- Name: monitor_imports(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.monitor_imports() RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_start timestamp;
    v_query text;
    v_count int := 0;
BEGIN
    v_start := clock_timestamp();
    RAISE WARNING 'Starting import monitoring at %', v_start;

    FOR i IN 1..15 LOOP
        SELECT count(*) INTO v_count
        FROM pg_stat_activity
        WHERE query LIKE '%import_geo_features%'
        AND query NOT LIKE '%monitor_imports%';

        IF v_count > 0 THEN
            RAISE WARNING 'Found % active import queries at %', v_count, clock_timestamp();

            FOR v_query IN
                SELECT query
                FROM pg_stat_activity
                WHERE query LIKE '%import_geo_features%'
                AND query NOT LIKE '%monitor_imports%'
            LOOP
                RAISE WARNING 'Import query: %', v_query;
            END LOOP;
        END IF;

        PERFORM pg_sleep(1);
    END LOOP;

    RAISE WARNING 'Monitoring completed at %', clock_timestamp();
END;
$$;


--
-- Name: monitor_imports_v2(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.monitor_imports_v2() RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_count int;
    v_query text;
    v_start_time timestamptz;
BEGIN
    v_start_time := clock_timestamp();

    -- Create a temporary table to track changes
    CREATE TEMP TABLE IF NOT EXISTS import_monitoring (
        capture_time timestamptz,
        table_name text,
        n_tup_ins bigint,
        n_tup_del bigint,
        n_live_tup bigint,
        n_dead_tup bigint,
        xact_commit bigint,
        xact_rollback bigint
    );

    -- Log start
    INSERT INTO public.import_logs(level, message, details) -- Explicit schema
    VALUES ('info', 'Starting enhanced import monitoring', jsonb_build_object('start_time', v_start_time));

    FOR i IN 1..60 LOOP  -- Monitor for 60 seconds
        -- Capture table statistics
        INSERT INTO import_monitoring
        SELECT
            clock_timestamp(),
            relname,
            n_tup_ins,
            n_tup_del,
            n_live_tup,
            n_dead_tup,
            (SELECT xact_commit FROM pg_stat_database WHERE datname = current_database()),
            (SELECT xact_rollback FROM pg_stat_database WHERE datname = current_database())
        FROM pg_stat_user_tables
        WHERE relname IN ('geo_features', 'feature_collections', 'layers');

        -- Monitor active queries
        WITH active_queries AS (
            SELECT
                pid,
                query,
                state,
                wait_event,
                wait_event_type,
                xact_start,
                query_start,
                backend_type,
                usename,
                client_addr,
                application_name,
                state_change
            FROM pg_stat_activity
            WHERE
                pid != pg_backend_pid()
                AND backend_type = 'client backend'
                AND (query_start >= v_start_time OR xact_start >= v_start_time)
                AND query NOT LIKE '%monitor_imports%'
                AND query NOT ILIKE '%pg_stat_activity%'
        )
        SELECT COUNT(*), string_agg(
            format(E'PID: %s\nQuery: %s\nState: %s\nWait: %s\nStart: %s\nUser: %s\nApp: %s\nClient: %s\n',
                pid, query, state, wait_event, query_start, usename, application_name, client_addr
            ), E'\n---\n'
        )
        INTO v_count, v_query
        FROM active_queries;

        IF v_count > 0 THEN
            INSERT INTO public.import_logs(level, message, details) -- Explicit schema
            VALUES (
                'info',
                format('Found %s active database connections', v_count),
                jsonb_build_object(
                    'queries', v_query,
                    'timestamp', clock_timestamp(),
                    'elapsed_seconds', EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time))
                )
            );
        END IF;

        -- Sleep for 100ms instead of 1s
        PERFORM pg_sleep(0.1);
    END LOOP;

    -- Analyze the collected data
    WITH changes AS (
        SELECT
            table_name,
            max(n_tup_ins) - min(n_tup_ins) as inserts,
            max(n_tup_del) - min(n_tup_del) as deletes,
            max(xact_commit) - min(xact_commit) as commits,
            max(xact_rollback) - min(xact_rollback) as rollbacks
        FROM import_monitoring
        GROUP BY table_name
    )
    INSERT INTO public.import_logs(level, message, details) -- Explicit schema
    SELECT
        'info',
        'Import monitoring summary',
        jsonb_build_object(
            'table', table_name,
            'inserts', inserts,
            'deletes', deletes,
            'commits', commits,
            'rollbacks', rollbacks,
            'duration_seconds', EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time))
        )
    FROM changes;

    -- Cleanup
    DROP TABLE IF EXISTS import_monitoring;
END;
$$;


--
-- Name: monitor_imports_v3(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.monitor_imports_v3() RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_start_time timestamptz;
    v_current_time timestamptz;
    v_timeout interval := interval '5 minutes';
    v_last_activity timestamptz := NULL;
    v_query_count integer := 0;
    v_message text;
BEGIN
    -- Create temporary table to store warnings
    CREATE TEMPORARY TABLE IF NOT EXISTS import_warnings (
        created_at timestamptz DEFAULT now(),
        message text
    );

    -- Enable warning capture
    SET client_min_messages TO warning;

    -- Start monitoring
    v_start_time := clock_timestamp();

    RAISE WARNING 'Import monitoring started at %', v_start_time;

    -- Monitor until timeout or no activity for 30 seconds
    WHILE clock_timestamp() - v_start_time < v_timeout LOOP
        -- Check for active import queries
        WITH active_queries AS (
            SELECT pid, query, state, wait_event,
                   xact_start, query_start, state_change
            FROM pg_stat_activity
            WHERE query ~* 'import_geo_features_with_transform'
               OR query ~* 'INSERT INTO public.geo_features' -- Explicit schema
        )
        SELECT count(*) INTO v_query_count FROM active_queries;

        IF v_query_count > 0 THEN
            v_last_activity := clock_timestamp();
            -- Log to import_warnings
            INSERT INTO import_warnings (message)
            SELECT format('Active import query found: %s', query)
            FROM pg_stat_activity
            WHERE query ~* 'import_geo_features_with_transform'
               OR query ~* 'INSERT INTO public.geo_features'; -- Explicit schema
        ELSIF v_last_activity IS NOT NULL AND
              clock_timestamp() - v_last_activity > interval '30 seconds' THEN
            -- No activity for 30 seconds, exit
            EXIT;
        END IF;

        -- Get table statistics
        INSERT INTO import_warnings (message)
        SELECT format('Table stats - inserts: %s, updates: %s, deletes: %s',
                     n_tup_ins, n_tup_upd, n_tup_del)
        FROM pg_stat_user_tables
        WHERE relname = 'geo_features';

        -- Short sleep between checks
        PERFORM pg_sleep(0.1);
    END LOOP;

    -- Output captured warnings
    RAISE WARNING 'Import monitoring complete. Captured warnings:';
    FOR v_current_time, v_message IN
        SELECT created_at, message
        FROM import_warnings
        ORDER BY created_at
    LOOP
        RAISE WARNING 'Time: % - %', v_current_time, v_message;
    END LOOP;

    -- Cleanup
    DROP TABLE IF EXISTS import_warnings;
END;
$$;


--
-- Name: rollback_transaction(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.rollback_transaction() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Rollback the current transaction
    ROLLBACK;
END;
$$;


--
-- Name: set_uploaded_by(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.set_uploaded_by() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.uploaded_by = auth.uid();
  RETURN NEW;
END;
$$;


--
-- Name: test_warnings(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.test_warnings() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE WARNING 'Test warning 1';
  PERFORM pg_sleep(1);
  RAISE WARNING 'Test warning 2';
  PERFORM pg_sleep(1);
  RAISE WARNING 'Test warning 3';
END;
$$;


--
-- Name: track_import_progress(uuid, integer, integer, integer, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.track_import_progress(p_collection_id uuid, p_total_features integer, p_imported_count integer, p_failed_count integer, p_batch_number integer, p_total_batches integer) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    INSERT INTO public.import_logs(level, message, details) -- Explicit schema
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
            'percent_complete', (p_imported_count::float / p_total_features * 100)::int,
            'timestamp', clock_timestamp()
        )
    );
END;
$$;


--
-- Name: update_import_progress(uuid, integer, integer, uuid, uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.update_import_progress(p_import_log_id uuid, p_imported_count integer, p_failed_count integer, p_collection_id uuid DEFAULT NULL::uuid, p_layer_id uuid DEFAULT NULL::uuid, p_metadata jsonb DEFAULT NULL::jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  UPDATE public.realtime_import_logs -- Explicit schema
  SET
    imported_count = p_imported_count,
    failed_count = p_failed_count,
    collection_id = COALESCE(p_collection_id, collection_id),
    layer_id = COALESCE(p_layer_id, layer_id),
    metadata = COALESCE(p_metadata, metadata),
    status = CASE
      WHEN p_imported_count + p_failed_count >= total_features THEN 'completed'
      ELSE 'processing'
    END,
    updated_at = now()
  WHERE id = p_import_log_id;
END;
$$;


--
-- Name: update_project_file_import_status(uuid, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.update_project_file_import_status(p_file_id uuid, p_is_imported boolean, p_import_metadata text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    UPDATE project_files
    SET
        is_imported = p_is_imported,
        import_metadata = p_import_metadata::jsonb,  -- Convert TEXT to JSONB
        updated_at = NOW()
    WHERE id = p_file_id;
END;
$$;


--
-- Name: update_project_storage(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.update_project_storage() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Update the projects table with the new total storage
  UPDATE public.projects -- Explicit schema
  SET storage_used = (
    SELECT COALESCE(SUM(size), 0)
    FROM public.project_files -- Explicit schema
    WHERE project_id = NEW.project_id
  )
  WHERE id = NEW.project_id;
  RETURN NEW;
END;
$$;


--
-- Name: update_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.update_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: feature_collections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feature_collections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_file_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: geo_features; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.geo_features (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    layer_id uuid NOT NULL,
    geometry extensions.geometry(GeometryZ,4326) NOT NULL, -- MODIFIED
    properties jsonb DEFAULT '{}'::jsonb,
    srid integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT valid_geometry CHECK (extensions.st_isvalid(geometry)) -- MODIFIED
);


--
-- Name: import_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.import_logs (
    id integer NOT NULL,
    "timestamp" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    level text,
    message text,
    details jsonb
);


--
-- Name: import_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.import_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: import_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.import_logs_id_seq OWNED BY public.import_logs.id;


--
-- Name: layers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.layers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    collection_id uuid NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    properties jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    username text,
    full_name text,
    avatar_url text,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: project_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    name text NOT NULL,
    file_type text NOT NULL,
    size bigint NOT NULL,
    storage_path text NOT NULL,
    uploaded_by uuid,
    uploaded_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    source_file_id uuid,
    is_imported boolean DEFAULT false,
    import_metadata jsonb,
    is_shapefile_component boolean DEFAULT false,
    main_file_id uuid,
    component_type text,
    CONSTRAINT project_files_component_type_check CHECK ((component_type = ANY (ARRAY['shp'::text, 'shx'::text, 'dbf'::text, 'prj'::text, 'qmd'::text])))
);


--
-- Name: project_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_members (
    project_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text NOT NULL,
    invited_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    joined_at timestamp with time zone,
    CONSTRAINT project_members_role_check CHECK ((role = ANY (ARRAY['viewer'::text, 'editor'::text, 'admin'::text])))
);


--
-- Name: projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    status public.project_status DEFAULT 'active'::public.project_status NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    owner_id uuid NOT NULL,
    storage_used bigint DEFAULT 0 NOT NULL,
    last_accessed_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb
);


--
-- Name: realtime_import_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.realtime_import_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_file_id uuid NOT NULL,
    status text NOT NULL,
    total_features integer DEFAULT 0 NOT NULL,
    imported_count integer DEFAULT 0 NOT NULL,
    failed_count integer DEFAULT 0 NOT NULL,
    collection_id uuid,
    layer_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT realtime_import_logs_status_check CHECK ((status = ANY (ARRAY['started'::text, 'processing'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: recent_import_logs; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.recent_import_logs AS
 SELECT import_logs.id,
    import_logs."timestamp",
    import_logs.level,
    import_logs.message,
    import_logs.details
   FROM public.import_logs
  WHERE (import_logs."timestamp" > (CURRENT_TIMESTAMP - '00:05:00'::interval))
  ORDER BY import_logs."timestamp" DESC;


--
-- Name: user_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_settings (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL, -- Assuming uuid-ossp is also enabled, kept original
    user_id uuid NOT NULL,
    max_file_size bigint DEFAULT 52428800,
    default_project_id uuid,
    theme text DEFAULT 'system'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: import_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_logs ALTER COLUMN id SET DEFAULT nextval('public.import_logs_id_seq'::regclass);


--
-- Name: feature_collections feature_collections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feature_collections
    ADD CONSTRAINT feature_collections_pkey PRIMARY KEY (id);


--
-- Name: geo_features geo_features_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.geo_features
    ADD CONSTRAINT geo_features_pkey PRIMARY KEY (id);


--
-- Name: import_logs import_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_logs
    ADD CONSTRAINT import_logs_pkey PRIMARY KEY (id);


--
-- Name: layers layers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.layers
    ADD CONSTRAINT layers_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_username_key UNIQUE (username);


--
-- Name: project_files project_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_files
    ADD CONSTRAINT project_files_pkey PRIMARY KEY (id);


--
-- Name: project_members project_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_members
    ADD CONSTRAINT project_members_pkey PRIMARY KEY (project_id, user_id);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: realtime_import_logs realtime_import_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.realtime_import_logs
    ADD CONSTRAINT realtime_import_logs_pkey PRIMARY KEY (id);


--
-- Name: user_settings user_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_settings
    ADD CONSTRAINT user_settings_pkey PRIMARY KEY (id);


--
-- Name: user_settings user_settings_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_settings
    ADD CONSTRAINT user_settings_user_id_key UNIQUE (user_id);


--
-- Name: feature_collections_project_file_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX feature_collections_project_file_idx ON public.feature_collections USING btree (project_file_id);


--
-- Name: geo_features_geometry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX geo_features_geometry_idx ON public.geo_features USING gist (geometry);


--
-- Name: geo_features_layer_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX geo_features_layer_id_idx ON public.geo_features USING btree (layer_id);


--
-- Name: idx_import_logs_level; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_import_logs_level ON public.import_logs USING btree (level);


--
-- Name: idx_import_logs_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_import_logs_timestamp ON public.import_logs USING btree ("timestamp" DESC);


--
-- Name: idx_profiles_username; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_username ON public.profiles USING btree (username);


--
-- Name: idx_project_files_component_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_files_component_type ON public.project_files USING btree (component_type) WHERE (component_type IS NOT NULL);


--
-- Name: idx_project_files_is_imported; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_files_is_imported ON public.project_files USING btree (is_imported) WHERE (is_imported = true);


--
-- Name: idx_project_files_main_file; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_files_main_file ON public.project_files USING btree (main_file_id) WHERE (main_file_id IS NOT NULL);


--
-- Name: idx_project_files_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_files_project ON public.project_files USING btree (project_id);


--
-- Name: idx_project_files_source_file; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_files_source_file ON public.project_files USING btree (source_file_id) WHERE (source_file_id IS NOT NULL);


--
-- Name: idx_project_members_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_members_user ON public.project_members USING btree (user_id);


--
-- Name: idx_projects_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_owner ON public.projects USING btree (owner_id);


--
-- Name: layers_collection_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX layers_collection_id_idx ON public.layers USING btree (collection_id);


--
-- Name: realtime_import_logs_project_file_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX realtime_import_logs_project_file_id_idx ON public.realtime_import_logs USING btree (project_file_id);


--
-- Name: realtime_import_logs_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX realtime_import_logs_status_idx ON public.realtime_import_logs USING btree (status);


--
-- Name: project_files set_uploaded_by_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_uploaded_by_trigger BEFORE INSERT ON public.project_files FOR EACH ROW EXECUTE FUNCTION public.set_uploaded_by();


--
-- Name: project_files trigger_delete_shapefile_companions; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_delete_shapefile_companions AFTER DELETE ON public.project_files FOR EACH ROW WHEN ((old.is_shapefile_component = false)) EXECUTE FUNCTION public.delete_shapefile_companions();


--
-- Name: feature_collections update_feature_collections_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_feature_collections_updated_at BEFORE UPDATE ON public.feature_collections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: geo_features update_geo_features_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_geo_features_updated_at BEFORE UPDATE ON public.geo_features FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: layers update_layers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_layers_updated_at BEFORE UPDATE ON public.layers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: project_files update_project_storage_on_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_project_storage_on_delete AFTER DELETE ON public.project_files FOR EACH ROW EXECUTE FUNCTION public.update_project_storage();


--
-- Name: project_files update_project_storage_on_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_project_storage_on_insert AFTER INSERT ON public.project_files FOR EACH ROW EXECUTE FUNCTION public.update_project_storage();


--
-- Name: projects update_projects_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_projects_updated_at AFTER UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: user_settings update_user_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_user_settings_updated_at BEFORE UPDATE ON public.user_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: feature_collections feature_collections_project_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feature_collections
    ADD CONSTRAINT feature_collections_project_file_id_fkey FOREIGN KEY (project_file_id) REFERENCES public.project_files(id) ON DELETE CASCADE;


--
-- Name: geo_features geo_features_layer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.geo_features
    ADD CONSTRAINT geo_features_layer_id_fkey FOREIGN KEY (layer_id) REFERENCES public.layers(id) ON DELETE CASCADE;


--
-- Name: layers layers_collection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.layers
    ADD CONSTRAINT layers_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.feature_collections(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: project_files project_files_main_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_files
    ADD CONSTRAINT project_files_main_file_id_fkey FOREIGN KEY (main_file_id) REFERENCES public.project_files(id) ON DELETE CASCADE;


--
-- Name: project_files project_files_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_files
    ADD CONSTRAINT project_files_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: project_files project_files_source_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_files
    ADD CONSTRAINT project_files_source_file_id_fkey FOREIGN KEY (source_file_id) REFERENCES public.project_files(id) ON DELETE CASCADE;


--
-- Name: project_files project_files_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_files
    ADD CONSTRAINT project_files_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: project_members project_members_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_members
    ADD CONSTRAINT project_members_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: project_members project_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_members
    ADD CONSTRAINT project_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: projects projects_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: realtime_import_logs realtime_import_logs_collection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.realtime_import_logs
    ADD CONSTRAINT realtime_import_logs_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.feature_collections(id) ON DELETE CASCADE;


--
-- Name: realtime_import_logs realtime_import_logs_layer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.realtime_import_logs
    ADD CONSTRAINT realtime_import_logs_layer_id_fkey FOREIGN KEY (layer_id) REFERENCES public.layers(id) ON DELETE CASCADE;


--
-- Name: realtime_import_logs realtime_import_logs_project_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.realtime_import_logs
    ADD CONSTRAINT realtime_import_logs_project_file_id_fkey FOREIGN KEY (project_file_id) REFERENCES public.project_files(id) ON DELETE CASCADE;


--
-- Name: user_settings user_settings_default_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_settings
    ADD CONSTRAINT user_settings_default_project_id_fkey FOREIGN KEY (default_project_id) REFERENCES public.projects(id) ON DELETE SET NULL;


--
-- Name: user_settings user_settings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_settings
    ADD CONSTRAINT user_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: project_members Enable delete access for project owners; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable delete access for project owners" ON public.project_members FOR DELETE USING ((auth.uid() = ( SELECT projects.owner_id
   FROM public.projects
  WHERE (projects.id = project_members.project_id))));


--
-- Name: project_members Enable delete for project owners; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable delete for project owners" ON public.project_members FOR DELETE USING ((project_id IN ( SELECT projects.id
   FROM public.projects
  WHERE (projects.owner_id = auth.uid()))));


--
-- Name: project_members Enable insert access for project owners; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable insert access for project owners" ON public.project_members FOR INSERT WITH CHECK ((auth.uid() = ( SELECT projects.owner_id
   FROM public.projects
  WHERE (projects.id = project_members.project_id))));


--
-- Name: project_members Enable insert for project owners; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable insert for project owners" ON public.project_members FOR INSERT WITH CHECK ((project_id IN ( SELECT projects.id
   FROM public.projects
  WHERE (projects.owner_id = auth.uid()))));


--
-- Name: project_members Enable read access for project members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable read access for project members" ON public.project_members FOR SELECT USING (((auth.uid() = ( SELECT projects.owner_id
   FROM public.projects
  WHERE (projects.id = project_members.project_id))) OR (auth.uid() = user_id)));


--
-- Name: project_members Enable read access for project members and owners; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable read access for project members and owners" ON public.project_members FOR SELECT USING (((user_id = auth.uid()) OR (project_id IN ( SELECT projects.id
   FROM public.projects
  WHERE (projects.owner_id = auth.uid())))));


--
-- Name: project_members Enable update access for project owners; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable update access for project owners" ON public.project_members FOR UPDATE USING ((auth.uid() = ( SELECT projects.owner_id
   FROM public.projects
  WHERE (projects.id = project_members.project_id))));


--
-- Name: project_members Enable update for project owners; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable update for project owners" ON public.project_members FOR UPDATE USING ((project_id IN ( SELECT projects.id
   FROM public.projects
  WHERE (projects.owner_id = auth.uid()))));


--
-- Name: project_members Project owners can manage members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Project owners can manage members" ON public.project_members USING ((EXISTS ( SELECT 1
   FROM public.projects
  WHERE ((projects.id = project_members.project_id) AND (projects.owner_id = auth.uid())))));


--
-- Name: realtime_import_logs Service role can manage all import logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage all import logs" ON public.realtime_import_logs TO service_role USING (true) WITH CHECK (true);


--
-- Name: projects Users can create their own projects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own projects" ON public.projects FOR INSERT WITH CHECK ((auth.uid() = owner_id));


--
-- Name: feature_collections Users can delete feature collections for their project files; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete feature collections for their project files" ON public.feature_collections FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.project_files pf
  WHERE ((pf.id = feature_collections.project_file_id) AND (pf.uploaded_by = auth.uid())))));


--
-- Name: geo_features Users can delete features for their layers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete features for their layers" ON public.geo_features FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM ((public.layers l
     JOIN public.feature_collections fc ON ((fc.id = l.collection_id)))
     JOIN public.project_files pf ON ((pf.id = fc.project_file_id)))
  WHERE ((l.id = geo_features.layer_id) AND (pf.uploaded_by = auth.uid())))));


--
-- Name: project_files Users can delete files from their projects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete files from their projects" ON public.project_files FOR DELETE USING ((auth.uid() IN ( SELECT project_members.user_id
   FROM public.project_members
  WHERE (project_members.project_id = project_files.project_id))));


--
-- Name: realtime_import_logs Users can delete import logs for their projects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete import logs for their projects" ON public.realtime_import_logs FOR DELETE USING ((project_file_id IN ( SELECT project_files.id
   FROM public.project_files
  WHERE (project_files.project_id IN ( SELECT project_members.project_id
           FROM public.project_members
          WHERE (project_members.user_id = auth.uid()))))));


--
-- Name: layers Users can delete layers for their feature collections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete layers for their feature collections" ON public.layers FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.feature_collections fc
     JOIN public.project_files pf ON ((pf.id = fc.project_file_id)))
  WHERE ((fc.id = layers.collection_id) AND (pf.uploaded_by = auth.uid())))));


--
-- Name: projects Users can delete their own projects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own projects" ON public.projects FOR DELETE USING ((auth.uid() = owner_id));


--
-- Name: feature_collections Users can insert feature collections for their project files; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert feature collections for their project files" ON public.feature_collections FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.project_files pf
  WHERE ((pf.id = feature_collections.project_file_id) AND (pf.uploaded_by = auth.uid())))));


--
-- Name: geo_features Users can insert features for their layers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert features for their layers" ON public.geo_features FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM ((public.layers l
     JOIN public.feature_collections fc ON ((fc.id = l.collection_id)))
     JOIN public.project_files pf ON ((pf.id = fc.project_file_id)))
  WHERE ((l.id = geo_features.layer_id) AND (pf.uploaded_by = auth.uid())))));


--
-- Name: realtime_import_logs Users can insert import logs for their projects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert import logs for their projects" ON public.realtime_import_logs FOR INSERT WITH CHECK ((project_file_id IN ( SELECT pf.id
   FROM (public.project_files pf
     JOIN public.projects p ON ((pf.project_id = p.id)))
  WHERE ((p.owner_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.project_members pm
          WHERE ((pm.project_id = p.id) AND (pm.user_id = auth.uid()))))))));


--
-- Name: layers Users can insert layers for their feature collections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert layers for their feature collections" ON public.layers FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.feature_collections fc
     JOIN public.project_files pf ON ((pf.id = fc.project_file_id)))
  WHERE ((fc.id = layers.collection_id) AND (pf.uploaded_by = auth.uid())))));


--
-- Name: feature_collections Users can insert their feature collections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their feature collections" ON public.feature_collections FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.project_files
  WHERE ((project_files.id = feature_collections.project_file_id) AND (project_files.uploaded_by = auth.uid())))));


--
-- Name: geo_features Users can insert their features; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their features" ON public.geo_features FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM ((public.layers l
     JOIN public.feature_collections fc ON ((fc.id = l.collection_id)))
     JOIN public.project_files pf ON ((pf.id = fc.project_file_id)))
  WHERE ((l.id = geo_features.layer_id) AND (pf.uploaded_by = auth.uid())))));


--
-- Name: layers Users can insert their layers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their layers" ON public.layers FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.feature_collections fc
     JOIN public.project_files pf ON ((pf.id = fc.project_file_id)))
  WHERE ((fc.id = layers.collection_id) AND (pf.uploaded_by = auth.uid())))));


--
-- Name: profiles Users can insert their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK ((auth.uid() = id));


--
-- Name: user_settings Users can insert their own settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own settings" ON public.user_settings FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: user_settings Users can read their own settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read their own settings" ON public.user_settings FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: feature_collections Users can update feature collections for their project files; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update feature collections for their project files" ON public.feature_collections FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.project_files pf
  WHERE ((pf.id = feature_collections.project_file_id) AND (pf.uploaded_by = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.project_files pf
  WHERE ((pf.id = feature_collections.project_file_id) AND (pf.uploaded_by = auth.uid())))));


--
-- Name: geo_features Users can update features for their layers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update features for their layers" ON public.geo_features FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM ((public.layers l
     JOIN public.feature_collections fc ON ((fc.id = l.collection_id)))
     JOIN public.project_files pf ON ((pf.id = fc.project_file_id)))
  WHERE ((l.id = geo_features.layer_id) AND (pf.uploaded_by = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ((public.layers l
     JOIN public.feature_collections fc ON ((fc.id = l.collection_id)))
     JOIN public.project_files pf ON ((pf.id = fc.project_file_id)))
  WHERE ((l.id = geo_features.layer_id) AND (pf.uploaded_by = auth.uid())))));


--
-- Name: realtime_import_logs Users can update import logs for their projects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update import logs for their projects" ON public.realtime_import_logs FOR UPDATE USING ((project_file_id IN ( SELECT project_files.id
   FROM public.project_files
  WHERE (project_files.project_id IN ( SELECT project_members.project_id
           FROM public.project_members
          WHERE (project_members.user_id = auth.uid())))))) WITH CHECK ((project_file_id IN ( SELECT project_files.id
   FROM public.project_files
  WHERE (project_files.project_id IN ( SELECT project_members.project_id
           FROM public.project_members
          WHERE (project_members.user_id = auth.uid()))))));


--
-- Name: layers Users can update layers for their feature collections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update layers for their feature collections" ON public.layers FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.feature_collections fc
     JOIN public.project_files pf ON ((pf.id = fc.project_file_id)))
  WHERE ((fc.id = layers.collection_id) AND (pf.uploaded_by = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.feature_collections fc
     JOIN public.project_files pf ON ((pf.id = fc.project_file_id)))
  WHERE ((fc.id = layers.collection_id) AND (pf.uploaded_by = auth.uid())))));


--
-- Name: profiles Users can update their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING ((auth.uid() = id));


--
-- Name: projects Users can update their own projects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own projects" ON public.projects FOR UPDATE USING (((auth.uid() = owner_id) OR (EXISTS ( SELECT 1
   FROM public.project_members
  WHERE ((project_members.project_id = projects.id) AND (project_members.user_id = auth.uid()) AND (project_members.role = 'admin'::text))))));


--
-- Name: user_settings Users can update their own settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own settings" ON public.user_settings FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: project_files Users can update their project files; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their project files" ON public.project_files FOR UPDATE TO authenticated USING ((auth.uid() IN ( SELECT project_members.user_id
   FROM public.project_members
  WHERE (project_members.project_id = project_files.project_id)))) WITH CHECK ((auth.uid() IN ( SELECT project_members.user_id
   FROM public.project_members
  WHERE (project_members.project_id = project_files.project_id))));


--
-- Name: project_files Users can upload files to their projects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can upload files to their projects" ON public.project_files FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.project_members
  WHERE ((project_members.project_id = project_files.project_id) AND (project_members.user_id = auth.uid())))));


--
-- Name: feature_collections Users can view feature collections for their project files; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view feature collections for their project files" ON public.feature_collections FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.project_files pf
  WHERE ((pf.id = feature_collections.project_file_id) AND (pf.uploaded_by = auth.uid())))));


--
-- Name: geo_features Users can view features for their layers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view features for their layers" ON public.geo_features FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM ((public.layers l
     JOIN public.feature_collections fc ON ((fc.id = l.collection_id)))
     JOIN public.project_files pf ON ((pf.id = fc.project_file_id)))
  WHERE ((l.id = geo_features.layer_id) AND (pf.uploaded_by = auth.uid())))));


--
-- Name: realtime_import_logs Users can view import logs for their projects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view import logs for their projects" ON public.realtime_import_logs FOR SELECT USING ((project_file_id IN ( SELECT project_files.id
   FROM public.project_files
  WHERE (project_files.project_id IN ( SELECT project_members.project_id
           FROM public.project_members
          WHERE (project_members.user_id = auth.uid()))))));


--
-- Name: layers Users can view layers for their feature collections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view layers for their feature collections" ON public.layers FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.feature_collections fc
     JOIN public.project_files pf ON ((pf.id = fc.project_file_id)))
  WHERE ((fc.id = layers.collection_id) AND (pf.uploaded_by = auth.uid())))));


--
-- Name: project_files Users can view project files; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view project files" ON public.project_files FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.project_members
  WHERE ((project_members.project_id = project_files.project_id) AND (project_members.user_id = auth.uid())))));


--
-- Name: feature_collections Users can view their feature collections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their feature collections" ON public.feature_collections FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.project_files
  WHERE ((project_files.id = feature_collections.project_file_id) AND (project_files.uploaded_by = auth.uid())))));


--
-- Name: geo_features Users can view their features; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their features" ON public.geo_features FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM ((public.layers l
     JOIN public.feature_collections fc ON ((fc.id = l.collection_id)))
     JOIN public.project_files pf ON ((pf.id = fc.project_file_id)))
  WHERE ((l.id = geo_features.layer_id) AND (pf.uploaded_by = auth.uid())))));


--
-- Name: layers Users can view their layers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their layers" ON public.layers FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.feature_collections fc
     JOIN public.project_files pf ON ((pf.id = fc.project_file_id)))
  WHERE ((fc.id = layers.collection_id) AND (pf.uploaded_by = auth.uid())))));


--
-- Name: profiles Users can view their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING ((auth.uid() = id));


--
-- Name: feature_collections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.feature_collections ENABLE ROW LEVEL SECURITY;

--
-- Name: geo_features; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.geo_features ENABLE ROW LEVEL SECURITY;

--
-- Name: layers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.layers ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: project_files; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_files ENABLE ROW LEVEL SECURITY;

--
-- Name: project_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

--
-- Name: project_members project_members_delete_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_members_delete_policy ON public.project_members FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.projects
  WHERE ((projects.id = project_members.project_id) AND (projects.owner_id = auth.uid())))));


--
-- Name: project_members project_members_insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_members_insert_policy ON public.project_members FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.projects
  WHERE ((projects.id = project_members.project_id) AND (projects.owner_id = auth.uid())))));


--
-- Name: project_members project_members_select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_members_select_policy ON public.project_members FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.projects
  WHERE ((projects.id = project_members.project_id) AND (projects.owner_id = auth.uid()))))));


--
-- Name: project_members project_members_update_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY project_members_update_policy ON public.project_members FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.projects
  WHERE ((projects.id = project_members.project_id) AND (projects.owner_id = auth.uid())))));


--
-- Name: projects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

--
-- Name: projects projects_delete_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY projects_delete_policy ON public.projects FOR DELETE TO authenticated USING ((owner_id = auth.uid()));


--
-- Name: projects projects_insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY projects_insert_policy ON public.projects FOR INSERT TO authenticated WITH CHECK ((owner_id = auth.uid()));


--
-- Name: projects projects_select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY projects_select_policy ON public.projects FOR SELECT TO authenticated USING ((owner_id = auth.uid()));


--
-- Name: projects projects_update_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY projects_update_policy ON public.projects FOR UPDATE TO authenticated USING ((owner_id = auth.uid()));


--
-- Name: realtime_import_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.realtime_import_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: user_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--


-- Grant usage on extensions schema (Often needed)
GRANT USAGE ON SCHEMA extensions TO postgres;
GRANT USAGE ON SCHEMA extensions TO authenticated;
GRANT USAGE ON SCHEMA extensions TO service_role;
-- You might need to grant execute on specific plv8 functions if applicable later