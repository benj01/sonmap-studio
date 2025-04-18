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
    'import_status', pf.import_metadata->>'status', -- Assuming status is in metadata
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
          FROM layers l -- Use correct table name
          WHERE l.collection_id = c.id
        )
      ))
      FROM feature_collections c
      WHERE c.project_file_id = pf.id -- Correct FK column
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
    -- Delete all companion files if the main file is deleted
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
                        'bbox', extensions.ST_AsGeoJSON(extensions.ST_Extent(gf.geometry_2d))::jsonb, -- Use geometry_2d
                        'center', jsonb_build_object(
                            'lng', extensions.ST_X(extensions.ST_Centroid(extensions.ST_Extent(gf.geometry_2d))), -- Use geometry_2d
                            'lat', extensions.ST_Y(extensions.ST_Centroid(extensions.ST_Extent(gf.geometry_2d)))  -- Use geometry_2d
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

CREATE OR REPLACE FUNCTION public.get_imported_files(p_source_file_id uuid) RETURNS TABLE(id uuid, name text, type text, storage_path text, import_metadata jsonb, uploaded_at timestamp with time zone) -- Changed param name for clarity
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        pf.id,
        pf.name,
        pf.type, -- Use 'type' column from table definition
        pf.storage_path,
        pf.import_metadata,
        pf.uploaded_at
    FROM public.project_files pf -- Explicit schema
    WHERE pf.source_file_id = p_source_file_id -- Use correct parameter name
    ORDER BY pf.uploaded_at DESC;
END;
$$;


--
-- Name: get_layer_features(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.get_layer_features(p_layer_id uuid) RETURNS TABLE(id uuid, properties jsonb, geojson text, srid integer) -- Changed param name
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        f.id,
        f.properties,
        extensions.ST_AsGeoJSON(f.geometry_2d) as geojson, -- Use geometry_2d
        f.srid
    FROM public.geo_features f -- Explicit schema
    WHERE f.layer_id = p_layer_id; -- Use correct param name
END;
$$;


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
                    'geometry', extensions.ST_AsGeoJSON(gf.geometry_2d)::jsonb, -- Use geometry_2d
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

CREATE OR REPLACE FUNCTION public.get_project_files_with_companions(project_id_param uuid) RETURNS TABLE(id uuid, name text, type text, storage_path text, size bigint, uploaded_at timestamp with time zone, is_shapefile_component boolean, component_type text, companion_files jsonb) -- Added component_type to main file info
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        pf.id,
        pf.name,
        pf.type, -- Use 'type' column
        pf.storage_path,
        pf.size,
        pf.uploaded_at,
        pf.is_shapefile_component,
        pf.component_type, -- Return component_type for the main file too (often null)
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
        AND pf.main_file_id IS NULL -- Only fetch main files (companions handled in jsonb_agg)
    ORDER BY pf.uploaded_at DESC;
END;
$$;


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

CREATE OR REPLACE FUNCTION public.get_shapefile_companions(p_main_file_id uuid) RETURNS TABLE(id uuid, name text, type text, storage_path text, component_type text, uploaded_at timestamp with time zone) -- Changed param name
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        pf.id,
        pf.name,
        pf.type, -- Use 'type' column
        pf.storage_path,
        pf.component_type,
        pf.uploaded_at
    FROM public.project_files pf -- Explicit schema
    WHERE pf.main_file_id = p_main_file_id -- Use correct parameter name
    ORDER BY pf.component_type;
END;
$$;


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
  v_geometry_2d extensions.GEOMETRY; -- MODIFIED
  v_last_error TEXT;
  v_properties JSONB;
  v_base_elevation double precision;
  v_object_height double precision;
  v_height_mode text;
  v_height_source text;
  v_vertical_datum_source text;

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
        v_geometry_2d := extensions.ST_GeomFromGeoJSON(v_feature->>'geometry');
        IF v_geometry_2d IS NULL THEN
          RAISE EXCEPTION 'Failed to create geometry from GeoJSON';
        END IF;

        -- Set the SRID
        v_geometry_2d := extensions.ST_SetSRID(v_geometry_2d, p_source_srid);

        -- Transform to target SRID (assuming 4326 for geometry_2d)
        v_geometry_2d := extensions.ST_Transform(v_geometry_2d, 4326); -- Transform to WGS84

        -- Force 2D as per schema
        v_geometry_2d := extensions.ST_Force2D(v_geometry_2d);

        RAISE NOTICE 'Geometry conversion successful: %', extensions.ST_AsText(v_geometry_2d);

        -- Extract properties and potential height info (Example - adjust logic as needed)
        v_properties := COALESCE(v_feature->'properties', '{}'::jsonb);
        v_base_elevation := (v_properties->>'base_elevation')::double precision; -- Example property name
        v_object_height := (v_properties->>'object_height')::double precision; -- Example property name
        v_height_mode := v_properties->>'height_mode'; -- Example
        v_height_source := v_properties->>'height_source'; -- Example
        v_vertical_datum_source := v_properties->>'vertical_datum'; -- Example

      EXCEPTION WHEN OTHERS THEN
        v_last_error := SQLERRM;
        RAISE WARNING 'Geometry conversion or property extraction failed: %', v_last_error;
        v_failed := v_failed + 1;
        CONTINUE;
      END;

      -- Insert feature
      BEGIN
        INSERT INTO public.geo_features ( -- Explicit schema
          layer_id,
          collection_id, -- Add collection_id for easier access
          geometry_2d,
          properties,
          srid, -- Store the TARGET SRID of the data process (p_target_srid)
          base_elevation_ellipsoidal, -- Store extracted/calculated height
          object_height, -- Store extracted/calculated height
          height_mode,
          height_source,
          vertical_datum_source
        )
        VALUES (
          v_layer_id,
          v_collection_id,
          v_geometry_2d,
          v_properties,
          p_target_srid, -- Storing the target SRID context
          v_base_elevation,
          v_object_height,
          v_height_mode,
          v_height_source,
          v_vertical_datum_source
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
    v_geometry_2d geometry;
    v_base_elevation double precision;
    v_object_height double precision;
BEGIN
    -- First create a dummy project file
    INSERT INTO public.project_files ( -- Explicit schema
        project_id,
        name,
        type,
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

    -- Process geometry
    v_geometry_2d := extensions.ST_Transform(
                        extensions.ST_SetSRID(
                            extensions.ST_GeomFromGeoJSON(p_geometry::text),
                            p_source_srid
                        ),
                        4326 -- Target SRID for geometry_2d is WGS84
                    );
    v_geometry_2d := extensions.ST_Force2D(v_geometry_2d); -- Ensure 2D

    -- Extract height info (example)
    v_base_elevation := (p_properties->>'base_elevation')::double precision;
    v_object_height := (p_properties->>'object_height')::double precision;

    -- Import a single feature
    INSERT INTO public.geo_features ( -- Explicit schema
        layer_id,
        collection_id,
        geometry_2d,
        properties,
        srid, -- Context SRID
        base_elevation_ellipsoidal,
        object_height
    ) VALUES (
        v_layer_id,
        v_collection_id,
        v_geometry_2d,
        p_properties,
        p_target_srid, -- Context SRID
        v_base_elevation,
        v_object_height
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
  -- IDs and Counters
  v_collection_id UUID;
  v_layer_id UUID;
  v_imported_count INTEGER := 0;
  v_failed_count INTEGER := 0;
  v_repaired_count INTEGER := 0;
  v_cleaned_count INTEGER := 0;
  v_skipped_count INTEGER := 0;

  -- Feature Processing Variables
  v_feature JSONB;                  -- Current feature JSON from input array
  v_properties JSONB;               -- Properties extracted from v_feature
  v_raw_geometry extensions.GEOMETRY;          -- Geometry directly from ST_GeomFromGeoJSON
  v_cleaned_geometry extensions.GEOMETRY;      -- Geometry after ST_RemoveRepeatedPoints
  v_validated_geometry extensions.GEOMETRY;    -- Geometry after cleaning/validation (in source SRID)
  v_geometry_2d extensions.GEOMETRY;           -- Final 2D geometry in WGS84 (EPSG:4326) for storage
  v_representative_point extensions.GEOMETRY;  -- Representative point in source SRID (e.g., LV95) for API call coordinates
  lv95_easting FLOAT;               -- Easting of representative point (if source is LV95)
  lv95_northing FLOAT;              -- Northing of representative point (if source is LV95)

  -- Height related Variables
  v_lhn95_height FLOAT := NULL;              -- Base height value (extracted from Z or attribute, could be LHN95 or other)
  v_base_elevation_ellipsoidal FLOAT := NULL;-- Final calculated WGS84 ellipsoidal height
  v_object_height FLOAT := NULL;             -- Height of the object itself (extracted from attribute)
  v_height_mode TEXT := NULL;                -- Metadata (e.g., 'absolute_ellipsoidal')
  v_height_source TEXT := NULL;              -- Metadata (e.g., 'z_coord', 'attribute:H_MEAN')
  v_vertical_datum_source TEXT := NULL;      -- Metadata (e.g., 'LHN95', 'WGS84', 'unknown')
  v_coords JSONB;                          -- Stores JSON result from the transform_swiss_coords_swisstopo function

  -- Loop and Batching Variables
  v_total_features INTEGER;
  v_batch_start INTEGER;
  v_batch_end INTEGER;
  v_batch_count INTEGER;
  v_current_batch INTEGER;
  -- p_batch_size is an input parameter, not declared here

  -- Logging and Debugging Variables
  v_feature_errors JSONB := '[]'::JSONB;   -- Stores errors for specific features
  v_notices JSONB := '[]'::JSONB;          -- Stores informational notices during import
  v_debug_info JSONB;                     -- Final JSON blob returned with summary info
  v_start_time TIMESTAMPTZ;                -- Used to time processing (optional but present in original)

-- Removed variables from your list that are not used in the final function:
-- v_geometry (used temporarily in older versions)
-- v_geometry_raw (renamed to v_raw_geometry for consistency)
-- v_geometry_cleaned (renamed to v_cleaned_geometry for consistency)
-- v_geometry_transformed (not needed in final logic)
-- v_debug (unused)
-- v_last_error (handled by SQLERRM within EXCEPTION blocks)
-- v_last_state (handled by SQLSTATE within EXCEPTION blocks)
-- v_index_name (unused)
-- v_geom_type (unused)
-- v_timeout_seconds (unused)
-- v_batch_size_actual (p_batch_size is used directly)
-- v_target_dims (logic removed)
-- v_dimension_fixes (logic removed)
-- v_base_elevation (renamed to v_base_elevation_ellipsoidal)

BEGIN
  -- Get total feature count and log start
  v_total_features := jsonb_array_length(p_features);
  v_batch_size_actual := p_batch_size; -- Use the passed-in batch size
  v_batch_count := CEIL(v_total_features::float / v_batch_size_actual);
  v_current_batch := 0;

  RAISE WARNING 'Starting import of % features with source SRID % (target context SRID %) in % batches of size %',
    v_total_features, p_source_srid, p_target_srid, v_batch_count, v_batch_size_actual;

  -- Add initial notice
  v_notices := v_notices || jsonb_build_object(
    'level', 'info',
    'message', format('Starting import of %s features with source SRID %s (target context SRID %s) in %s batches',
      v_total_features, p_source_srid, p_target_srid, v_batch_count),
    'details', jsonb_build_object(
      'total_features', v_total_features,
      'source_srid', p_source_srid,
      'target_srid', p_target_srid,
      'batch_count', v_batch_count,
      'batch_size', v_batch_size_actual
    )
  );

  -- Create collection and layer
  INSERT INTO public.feature_collections (name, project_file_id) -- Explicit schema
  VALUES (p_collection_name, p_project_file_id)
  RETURNING id INTO v_collection_id;

  INSERT INTO public.layers (name, collection_id, type) -- Explicit schema
  VALUES (p_collection_name, v_collection_id, 'vector')
  RETURNING id INTO v_layer_id;


  RAISE WARNING 'Created collection % and layer %.', v_collection_id, v_layer_id;

  v_notices := v_notices || jsonb_build_object(
    'level', 'info',
    'message', 'Created collection and layer.',
    'details', jsonb_build_object(
      'collection_id', v_collection_id,
      'layer_id', v_layer_id
    )
  );

  -- Process features in batches
  FOR v_current_batch IN 0..v_batch_count-1 LOOP
    v_batch_start := v_current_batch * v_batch_size_actual;
    v_batch_end := LEAST(v_batch_start + v_batch_size_actual, v_total_features);

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
      IF v_feature->'geometry' IS NULL OR v_feature->>'geometry' = 'null' THEN
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
        v_geometry_raw := extensions.ST_GeomFromGeoJSON(v_feature->'geometry');

        IF v_geometry_raw IS NULL THEN
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
        v_geometry_cleaned := extensions.ST_RemoveRepeatedPoints(v_geometry_raw);
        IF NOT extensions.ST_Equals(v_geometry_cleaned, v_geometry_raw) THEN
          v_cleaned_count := v_cleaned_count + 1;
          v_geometry_raw := v_geometry_cleaned; -- Use cleaned geom moving forward
        END IF;

        -- Handle invalid geometries
        IF NOT extensions.ST_IsValid(v_geometry_raw) THEN
          BEGIN
            -- Try to repair
            v_geometry_cleaned := COALESCE(
              extensions.ST_Buffer(v_geometry_raw, 0.0),
              extensions.ST_MakeValid(v_geometry_raw)
            );

            IF v_geometry_cleaned IS NULL OR NOT extensions.ST_IsValid(v_geometry_cleaned) THEN
              RAISE EXCEPTION 'Failed to repair invalid geometry';
            END IF;

            v_repaired_count := v_repaired_count + 1;
          EXCEPTION WHEN OTHERS THEN
            v_skipped_count := v_skipped_count + 1;
            v_feature_errors := v_feature_errors || jsonb_build_object(
              'feature_index', i,
              'error', SQLERRM,
              'error_state', SQLSTATE,
              'invalid_reason', extensions.ST_IsValidReason(v_geometry_raw)
            );
            CONTINUE;
          END;
        ELSE
          v_geometry_cleaned := v_geometry_raw; -- Geometry was already valid
        END IF;

        -- Transform coordinates (always to WGS84 for geometry_2d)
        v_geometry_transformed := extensions.ST_Transform(extensions.ST_SetSRID(v_geometry_cleaned, p_source_srid), 4326);

        -- Force 2D for storage
        v_geometry_2d := extensions.ST_Force2D(v_geometry_transformed);

        -- Extract properties and height info (Example logic)
        v_properties := COALESCE(v_feature->'properties', '{}'::jsonb);
        v_base_elevation := (v_properties->>'base_elevation')::double precision; -- Example property name
        v_object_height := (v_properties->>'object_height')::double precision; -- Example property name
        v_height_mode := v_properties->>'height_mode'; -- Example
        v_height_source := v_properties->>'height_source'; -- Example
        v_vertical_datum_source := v_properties->>'vertical_datum'; -- Example


        -- Insert feature with correct columns
        INSERT INTO public.geo_features ( -- Explicit schema
          layer_id,
          collection_id,
          geometry_2d,
          properties,
          srid, -- Target SRID context
          base_elevation_ellipsoidal,
          object_height,
          height_mode,
          height_source,
          vertical_datum_source
        ) VALUES (
          v_layer_id,
          v_collection_id,
          v_geometry_2d,
          v_properties,
          p_target_srid, -- Store the target context SRID
          v_base_elevation,
          v_object_height,
          v_height_mode,
          v_height_source,
          v_vertical_datum_source
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
  v_geometry_2d extensions.GEOMETRY; -- MODIFIED
  v_cleaned_geom text;
  v_collection_id uuid;
  v_base_elevation double precision;
  v_object_height double precision;
BEGIN
  -- Log input parameters
  RAISE NOTICE 'Single feature import - Input geometry: %', p_geometry;

  -- Get collection ID from layer
  SELECT collection_id INTO v_collection_id FROM public.layers WHERE id = p_layer_id;
  IF v_collection_id IS NULL THEN
    RAISE NOTICE 'Layer not found: %', p_layer_id;
    RETURN FALSE;
  END IF;


  -- Transform the geometry with detailed logging
  BEGIN
    v_cleaned_geom := jsonb_strip_nulls(p_geometry)::text;
    RAISE NOTICE 'Cleaned geometry JSON: %', v_cleaned_geom;

    v_geometry_2d := extensions.ST_GeomFromGeoJSON(v_cleaned_geom);
    RAISE NOTICE 'After ST_GeomFromGeoJSON: %', extensions.ST_AsText(v_geometry_2d);

    v_geometry_2d := extensions.ST_SetSRID(v_geometry_2d, p_source_srid);
    RAISE NOTICE 'After ST_SetSRID: % (SRID: %)', extensions.ST_AsText(v_geometry_2d), extensions.ST_SRID(v_geometry_2d);

    v_geometry_2d := extensions.ST_Transform(v_geometry_2d, 4326); -- Transform to WGS84
    RAISE NOTICE 'After ST_Transform: % (SRID: %)', extensions.ST_AsText(v_geometry_2d), extensions.ST_SRID(v_geometry_2d);

    v_geometry_2d := extensions.ST_Force2D(v_geometry_2d); -- Ensure 2D

    -- Extract height (example)
    v_base_elevation := (p_properties->>'base_elevation')::double precision;
    v_object_height := (p_properties->>'object_height')::double precision;

  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Error in geometry processing: % (State: %)', SQLERRM, SQLSTATE;
    RETURN FALSE;
  END;

  -- Insert the feature
  INSERT INTO public.geo_features ( -- Explicit schema
    layer_id,
    collection_id,
    geometry_2d,
    properties,
    srid,
    base_elevation_ellipsoidal,
    object_height
  )
  VALUES (
    p_layer_id,
    v_collection_id,
    v_geometry_2d,
    COALESCE(p_properties, '{}'::jsonb),
    4326, -- Stored geometry SRID is 4326
    v_base_elevation,
    v_object_height
  );

  RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Error inserting feature: % (State: %)', SQLERRM, SQLSTATE;
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
        WHERE query LIKE '%import_geo_features%' -- Match either version
        AND query NOT LIKE '%monitor_imports%';

        IF v_count > 0 THEN
            RAISE WARNING 'Found % active import queries at %', v_count, clock_timestamp();

            FOR v_query IN
                SELECT query
                FROM pg_stat_activity
                WHERE query LIKE '%import_geo_features%' -- Match either version
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
DECLARE
    v_total_features integer;
BEGIN
  -- Get total features from the log entry itself
  SELECT total_features INTO v_total_features
  FROM public.realtime_import_logs
  WHERE id = p_import_log_id;

  UPDATE public.realtime_import_logs -- Explicit schema
  SET
    imported_count = p_imported_count,
    failed_count = p_failed_count,
    collection_id = COALESCE(p_collection_id, collection_id),
    layer_id = COALESCE(p_layer_id, layer_id),
    metadata = COALESCE(p_metadata, metadata),
    status = CASE
      WHEN v_total_features IS NOT NULL AND p_imported_count + p_failed_count >= v_total_features THEN 'completed'
      WHEN p_metadata->>'error' IS NOT NULL THEN 'failed' -- Check if an error is logged in metadata
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
DECLARE
  v_project_id uuid;
BEGIN
  -- Determine project_id based on INSERT or DELETE
  IF TG_OP = 'INSERT' THEN
    v_project_id := NEW.project_id;
  ELSIF TG_OP = 'DELETE' THEN
    v_project_id := OLD.project_id;
  ELSE -- Should not happen for INSERT/DELETE triggers, but good practice
    RETURN NULL;
  END IF;

  -- Update the projects table with the new total storage
  UPDATE public.projects -- Explicit schema
  SET storage_used = (
    SELECT COALESCE(SUM(size), 0)
    FROM public.project_files -- Explicit schema
    WHERE project_id = v_project_id
  )
  WHERE id = v_project_id;

  -- Return appropriate value based on operation
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    RETURN OLD; -- Return OLD for DELETE trigger
  END IF;
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
-- Name: projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projects (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY, -- MODIFIED: Added PRIMARY KEY
    owner_id uuid NOT NULL, -- ADDED: As requested, ensure NOT NULL
    name text NOT NULL,
    description text,
    storage_used bigint DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid, -- Keep existing columns
    updated_by uuid  -- Keep existing columns
);

--
-- Name: project_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_files (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY, -- MODIFIED: Added PRIMARY KEY
    project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE, -- MODIFIED: Added inline FK
    name text NOT NULL,
    size bigint NOT NULL,
    type text NOT NULL, -- Original name from first block
    storage_path text, -- ADDED: From duplicate block / function usage
    uploaded_by uuid,
    is_imported boolean DEFAULT false,
    import_metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    source_file_id uuid, -- ADDED: Cannot be inline FK (self-ref)
    main_file_id uuid,   -- ADDED: Cannot be inline FK (self-ref)
    is_shapefile_component boolean DEFAULT false, -- ADDED: From duplicate block / function usage
    component_type text -- ADDED: From duplicate block / function usage
);

--
-- Name: feature_collections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feature_collections (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY, -- MODIFIED: Added PRIMARY KEY
    project_file_id uuid NOT NULL REFERENCES public.project_files(id) ON DELETE CASCADE, -- MODIFIED: Added inline FK
    name text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: layers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.layers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY, -- VERIFIED: Has PRIMARY KEY
    collection_id uuid NOT NULL REFERENCES public.feature_collections(id) ON DELETE CASCADE, -- VERIFIED: Has inline FK
    name text NOT NULL,
    type text NOT NULL,
    properties jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: geo_features; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.geo_features (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY, -- VERIFIED: Has PRIMARY KEY
    layer_id uuid NOT NULL REFERENCES public.layers(id) ON DELETE CASCADE, -- VERIFIED: Has inline FK
    collection_id uuid REFERENCES public.feature_collections(id) ON DELETE SET NULL, -- VERIFIED: Has inline FK
    properties jsonb DEFAULT '{}'::jsonb,
    srid integer, -- Target SRID context for reference

    -- FINAL Height/Geometry Columns:
    geometry_2d geometry(Geometry, 4326), -- Correct column name
    base_elevation_ellipsoidal double precision,
    object_height double precision,
    height_mode text,
    height_source text,
    vertical_datum_source text,

    -- Other columns
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Add Indexes using the correct column name
CREATE INDEX idx_geo_features_layer_id ON public.geo_features USING btree (layer_id);
CREATE INDEX idx_geo_features_collection_id ON public.geo_features USING btree (collection_id);
CREATE INDEX idx_geo_features_geometry_2d ON public.geo_features USING gist (geometry_2d); -- Use gist on geometry_2d
CREATE INDEX idx_geo_features_base_elevation ON public.geo_features(base_elevation_ellipsoidal);

-- Add Comments using the correct column name
COMMENT ON COLUMN public.geo_features.geometry_2d IS 'The WGS84 2D footprint of the feature'; -- Correct comment target
COMMENT ON COLUMN public.geo_features.base_elevation_ellipsoidal IS 'The calculated WGS84 ellipsoidal height (meters)';
COMMENT ON COLUMN public.geo_features.object_height IS 'The height of the object itself (meters), relative to its base';
COMMENT ON COLUMN public.geo_features.height_mode IS 'Defines how base_elevation_ellipsoidal relates to the ground (e.g., absolute_ellipsoidal)';
COMMENT ON COLUMN public.geo_features.height_source IS 'Source of the base height info before transformation (e.g., z_coord, attribute:H_MEAN)';
COMMENT ON COLUMN public.geo_features.vertical_datum_source IS 'Original vertical datum of the height source (e.g., LHN95, WGS84)';

-- Ensure the trigger function exists before creating the trigger
-- Trigger creation moved after function definition

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
-- DELETED Duplicate CREATE TABLE public.projects block
--

--
-- DELETED Duplicate CREATE TABLE public.project_files block
--

--
-- DELETED Duplicate CREATE TABLE public.feature_collections block
--



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
    id uuid DEFAULT gen_random_uuid() NOT NULL, -- Use standard gen_random_uuid() if uuid-ossp not needed
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
-- DELETED Redundant Primary Key Constraint for feature_collections
--

--
-- DELETED Redundant Primary Key Constraint for geo_features
--

--
-- Name: import_logs import_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_logs
    ADD CONSTRAINT import_logs_pkey PRIMARY KEY (id);


--
-- DELETED Redundant Primary Key Constraint for layers
--

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
-- DELETED Redundant Primary Key Constraint for project_files
--

--
-- Name: project_members project_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_members
    ADD CONSTRAINT project_members_pkey PRIMARY KEY (project_id, user_id);


--
-- DELETED Redundant Primary Key Constraint for projects
--

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
-- Replaced by idx_geo_features_geometry_2d above
-- CREATE INDEX geo_features_geometry_idx ON public.geo_features USING gist (geometry);


--
-- Name: geo_features_layer_id_idx; Type: INDEX; Schema: public; Owner: -
--
-- Replaced by idx_geo_features_layer_id above
-- CREATE INDEX geo_features_layer_id_idx ON public.geo_features USING btree (layer_id);


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
-- Changed from AFTER UPDATE to BEFORE UPDATE to match other update triggers
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: user_settings update_user_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_user_settings_updated_at BEFORE UPDATE ON public.user_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: feature_collections feature_collections_project_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
-- FK is now defined inline in CREATE TABLE public.feature_collections
-- ALTER TABLE ONLY public.feature_collections
--     ADD CONSTRAINT feature_collections_project_file_id_fkey FOREIGN KEY (project_file_id) REFERENCES public.project_files(id) ON DELETE CASCADE;


--
-- Name: geo_features geo_features_layer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
-- FK is now defined inline in CREATE TABLE public.geo_features
-- ALTER TABLE ONLY public.geo_features
--    ADD CONSTRAINT geo_features_layer_id_fkey FOREIGN KEY (layer_id) REFERENCES public.layers(id) ON DELETE CASCADE;

--
-- Name: geo_features geo_features_collection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
-- FK is now defined inline in CREATE TABLE public.geo_features
-- ALTER TABLE ONLY public.geo_features
--    ADD CONSTRAINT geo_features_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.feature_collections(id) ON DELETE SET NULL;

--
-- Name: layers layers_collection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
-- FK is now defined inline in CREATE TABLE public.layers
-- ALTER TABLE ONLY public.layers
--     ADD CONSTRAINT layers_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.feature_collections(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: project_files project_files_main_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
-- FK retained: Self-referencing FK cannot be inline
ALTER TABLE ONLY public.project_files
    ADD CONSTRAINT project_files_main_file_id_fkey FOREIGN KEY (main_file_id) REFERENCES public.project_files(id) ON DELETE CASCADE;


--
-- Name: project_files project_files_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
-- FK is now defined inline in CREATE TABLE public.project_files
-- ALTER TABLE ONLY public.project_files
--    ADD CONSTRAINT project_files_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: project_files project_files_source_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
-- FK retained: Self-referencing FK cannot be inline
ALTER TABLE ONLY public.project_files
    ADD CONSTRAINT project_files_source_file_id_fkey FOREIGN KEY (source_file_id) REFERENCES public.project_files(id) ON DELETE CASCADE;


--
-- Name: project_files project_files_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
-- FK retained: References auth.users which might be created later or managed separately
ALTER TABLE ONLY public.project_files
    ADD CONSTRAINT project_files_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: project_members project_members_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
-- FK retained: References projects(id) - could be inline but often kept separate for clarity or if tables are managed differently
ALTER TABLE ONLY public.project_members
    ADD CONSTRAINT project_members_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: project_members project_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
-- FK retained: References auth.users
ALTER TABLE ONLY public.project_members
    ADD CONSTRAINT project_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: projects projects_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
-- FK retained: References auth.users
ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: realtime_import_logs realtime_import_logs_collection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
-- FK retained: References feature_collections(id)
ALTER TABLE ONLY public.realtime_import_logs
    ADD CONSTRAINT realtime_import_logs_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.feature_collections(id) ON DELETE CASCADE;


--
-- Name: realtime_import_logs realtime_import_logs_layer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
-- FK retained: References layers(id)
ALTER TABLE ONLY public.realtime_import_logs
    ADD CONSTRAINT realtime_import_logs_layer_id_fkey FOREIGN KEY (layer_id) REFERENCES public.layers(id) ON DELETE CASCADE;


--
-- Name: realtime_import_logs realtime_import_logs_project_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
-- FK retained: References project_files(id)
ALTER TABLE ONLY public.realtime_import_logs
    ADD CONSTRAINT realtime_import_logs_project_file_id_fkey FOREIGN KEY (project_file_id) REFERENCES public.project_files(id) ON DELETE CASCADE;


--
-- Name: user_settings user_settings_default_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
-- FK retained: References projects(id)
ALTER TABLE ONLY public.user_settings
    ADD CONSTRAINT user_settings_default_project_id_fkey FOREIGN KEY (default_project_id) REFERENCES public.projects(id) ON DELETE SET NULL;


--
-- Name: user_settings user_settings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
-- FK retained: References auth.users
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
-- Duplicate Policy? Keep both for now, assuming they might have subtle differences or history
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
-- Duplicate Policy?
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
-- Duplicate Policy?
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
-- Duplicate Policy?
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
-- Updated to check owner or member status
CREATE POLICY "Users can delete files from their projects" ON public.project_files FOR DELETE USING (
    (uploaded_by = auth.uid()) -- Uploader can delete
    OR
    (project_id IN (SELECT p.id FROM public.projects p WHERE p.owner_id = auth.uid())) -- Project owner can delete
    OR
    (project_id IN (SELECT pm.project_id FROM public.project_members pm WHERE pm.user_id = auth.uid() AND pm.role = 'admin')) -- Project admin can delete
);


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
-- Duplicate Policy?
CREATE POLICY "Users can insert their feature collections" ON public.feature_collections FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.project_files
  WHERE ((project_files.id = feature_collections.project_file_id) AND (project_files.uploaded_by = auth.uid())))));


--
-- Name: geo_features Users can insert their features; Type: POLICY; Schema: public; Owner: -
-- Duplicate Policy?
CREATE POLICY "Users can insert their features" ON public.geo_features FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM ((public.layers l
     JOIN public.feature_collections fc ON ((fc.id = l.collection_id)))
     JOIN public.project_files pf ON ((pf.id = fc.project_file_id)))
  WHERE ((l.id = geo_features.layer_id) AND (pf.uploaded_by = auth.uid())))));


--
-- Name: layers Users can insert their layers; Type: POLICY; Schema: public; Owner: -
-- Duplicate Policy?
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
-- Allow owners or admins to update
CREATE POLICY "Users can update their own projects" ON public.projects FOR UPDATE USING (
    (auth.uid() = owner_id) -- Owner can update
    OR
    (id IN (SELECT pm.project_id FROM public.project_members pm WHERE pm.user_id = auth.uid() AND pm.role = 'admin')) -- Admin can update
);


--
-- Name: user_settings Users can update their own settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own settings" ON public.user_settings FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: project_files Users can update their project files; Type: POLICY; Schema: public; Owner: -
-- Updated to check owner, uploader, or member role
CREATE POLICY "Users can update their project files" ON public.project_files FOR UPDATE TO authenticated USING (
    (uploaded_by = auth.uid()) -- Uploader can update
    OR
    (project_id IN (SELECT p.id FROM public.projects p WHERE p.owner_id = auth.uid())) -- Project owner can update
    OR
    (project_id IN (SELECT pm.project_id FROM public.project_members pm WHERE pm.user_id = auth.uid() AND pm.role IN ('admin', 'editor'))) -- Project admin/editor can update
) WITH CHECK ( -- Check remains the same as USING clause
     (uploaded_by = auth.uid())
    OR
    (project_id IN (SELECT p.id FROM public.projects p WHERE p.owner_id = auth.uid()))
    OR
    (project_id IN (SELECT pm.project_id FROM public.project_members pm WHERE pm.user_id = auth.uid() AND pm.role IN ('admin', 'editor')))
);


--
-- Name: project_files Users can upload files to their projects; Type: POLICY; Schema: public; Owner: -
-- Allow owner or members (any role) to upload
CREATE POLICY "Users can upload files to their projects" ON public.project_files FOR INSERT WITH CHECK (
    (project_id IN (SELECT p.id FROM public.projects p WHERE p.owner_id = auth.uid())) -- Owner can upload
    OR
    (EXISTS ( SELECT 1 FROM public.project_members pm WHERE pm.project_id = project_files.project_id AND pm.user_id = auth.uid())) -- Any member can upload
);


--
-- Name: feature_collections Users can view feature collections for their project files; Type: POLICY; Schema: public; Owner: -
-- Allow owner or members of the project to view
CREATE POLICY "Users can view feature collections for their project files" ON public.feature_collections FOR SELECT TO authenticated USING (
    (EXISTS ( SELECT 1 FROM public.project_files pf WHERE pf.id = feature_collections.project_file_id AND (
        pf.uploaded_by = auth.uid() -- Uploader can view
        OR
        pf.project_id IN (SELECT p.id FROM public.projects p WHERE p.owner_id = auth.uid()) -- Project owner can view
        OR
        pf.project_id IN (SELECT pm.project_id FROM public.project_members pm WHERE pm.user_id = auth.uid()) -- Project members can view
    )))
);


--
-- Name: geo_features Users can view features for their layers; Type: POLICY; Schema: public; Owner: -
-- Allow owner or members of the project to view
CREATE POLICY "Users can view features for their layers" ON public.geo_features FOR SELECT TO authenticated USING (
    (EXISTS ( SELECT 1 FROM public.layers l
        JOIN public.feature_collections fc ON fc.id = l.collection_id
        JOIN public.project_files pf ON pf.id = fc.project_file_id
        WHERE l.id = geo_features.layer_id AND (
            pf.uploaded_by = auth.uid() -- Uploader can view
            OR
            pf.project_id IN (SELECT p.id FROM public.projects p WHERE p.owner_id = auth.uid()) -- Project owner can view
            OR
            pf.project_id IN (SELECT pm.project_id FROM public.project_members pm WHERE pm.user_id = auth.uid()) -- Project members can view
        )
    ))
);


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
-- Allow owner or members of the project to view
CREATE POLICY "Users can view layers for their feature collections" ON public.layers FOR SELECT TO authenticated USING (
    (EXISTS ( SELECT 1 FROM public.feature_collections fc
        JOIN public.project_files pf ON pf.id = fc.project_file_id
        WHERE fc.id = layers.collection_id AND (
            pf.uploaded_by = auth.uid() -- Uploader can view
            OR
            pf.project_id IN (SELECT p.id FROM public.projects p WHERE p.owner_id = auth.uid()) -- Project owner can view
            OR
            pf.project_id IN (SELECT pm.project_id FROM public.project_members pm WHERE pm.user_id = auth.uid()) -- Project members can view
        )
    ))
);


--
-- Name: project_files Users can view project files; Type: POLICY; Schema: public; Owner: -
-- Allow owner or members to view
CREATE POLICY "Users can view project files" ON public.project_files FOR SELECT USING (
    (project_id IN (SELECT p.id FROM public.projects p WHERE p.owner_id = auth.uid())) -- Owner can view
    OR
    (EXISTS ( SELECT 1 FROM public.project_members pm WHERE pm.project_id = project_files.project_id AND pm.user_id = auth.uid())) -- Member can view
);


--
-- Name: feature_collections Users can view their feature collections; Type: POLICY; Schema: public; Owner: -
-- Duplicate Policy? Replaced by broader policy above. Commenting out.
-- CREATE POLICY "Users can view their feature collections" ON public.feature_collections FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
--    FROM public.project_files
--   WHERE ((project_files.id = feature_collections.project_file_id) AND (project_files.uploaded_by = auth.uid())))));


--
-- Name: geo_features Users can view their features; Type: POLICY; Schema: public; Owner: -
-- Duplicate Policy? Replaced by broader policy above. Commenting out.
-- CREATE POLICY "Users can view their features" ON public.geo_features FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
--    FROM ((public.layers l
--      JOIN public.feature_collections fc ON ((fc.id = l.collection_id)))
--      JOIN public.project_files pf ON ((pf.id = fc.project_file_id)))
--   WHERE ((l.id = geo_features.layer_id) AND (pf.uploaded_by = auth.uid())))));


--
-- Name: layers Users can view their layers; Type: POLICY; Schema: public; Owner: -
-- Duplicate Policy? Replaced by broader policy above. Commenting out.
-- CREATE POLICY "Users can view their layers" ON public.layers FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
--    FROM (public.feature_collections fc
--      JOIN public.project_files pf ON ((pf.id = fc.project_file_id)))
--   WHERE ((fc.id = layers.collection_id) AND (pf.uploaded_by = auth.uid())))));


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
-- More specific policy name, likely preferred over generic "Enable delete..."
CREATE POLICY project_members_delete_policy ON public.project_members FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.projects
  WHERE ((projects.id = project_members.project_id) AND (projects.owner_id = auth.uid())))));


--
-- Name: project_members project_members_insert_policy; Type: POLICY; Schema: public; Owner: -
-- More specific policy name
CREATE POLICY project_members_insert_policy ON public.project_members FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.projects
  WHERE ((projects.id = project_members.project_id) AND (projects.owner_id = auth.uid())))));


--
-- Name: project_members project_members_select_policy; Type: POLICY; Schema: public; Owner: -
-- More specific policy name
CREATE POLICY project_members_select_policy ON public.project_members FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.projects
  WHERE ((projects.id = project_members.project_id) AND (projects.owner_id = auth.uid()))))));


--
-- Name: project_members project_members_update_policy; Type: POLICY; Schema: public; Owner: -
-- More specific policy name
CREATE POLICY project_members_update_policy ON public.project_members FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.projects
  WHERE ((projects.id = project_members.project_id) AND (projects.owner_id = auth.uid())))));


--
-- Name: projects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

--
-- Name: projects projects_delete_policy; Type: POLICY; Schema: public; Owner: -
-- More specific policy name
CREATE POLICY projects_delete_policy ON public.projects FOR DELETE TO authenticated USING ((owner_id = auth.uid()));


--
-- Name: projects projects_insert_policy; Type: POLICY; Schema: public; Owner: -
-- More specific policy name
CREATE POLICY projects_insert_policy ON public.projects FOR INSERT TO authenticated WITH CHECK ((owner_id = auth.uid()));


--
-- Name: projects projects_select_policy; Type: POLICY; Schema: public; Owner: -
-- More specific policy name, allows members to view projects they are part of
CREATE POLICY projects_select_policy ON public.projects FOR SELECT TO authenticated USING (
    (owner_id = auth.uid()) -- Owner can view
    OR
    (EXISTS ( SELECT 1 FROM public.project_members pm WHERE pm.project_id = projects.id AND pm.user_id = auth.uid())) -- Member can view
);


--
-- Name: projects projects_update_policy; Type: POLICY; Schema: public; Owner: -
-- More specific policy name, already updated above to include admins. Keeping this version consistent.
CREATE POLICY projects_update_policy ON public.projects FOR UPDATE TO authenticated USING (
    (owner_id = auth.uid())
    OR
    (id IN (SELECT pm.project_id FROM public.project_members pm WHERE pm.user_id = auth.uid() AND pm.role = 'admin'))
);


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
-- Grant execute on functions in the public schema as needed
GRANT EXECUTE ON FUNCTION public.begin_transaction() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_file_import_status(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_function_details(text) TO authenticated, service_role; -- Or restrict as needed
GRANT EXECUTE ON FUNCTION public.commit_transaction() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.debug_check_import(uuid) TO authenticated, service_role; -- Restrict if sensitive
GRANT EXECUTE ON FUNCTION public.enable_rls_on_spatial_ref_sys() TO postgres; -- Likely only admin needed
GRANT EXECUTE ON FUNCTION public.force_mark_file_as_imported(uuid, jsonb) TO service_role; -- Likely service only
GRANT EXECUTE ON FUNCTION public.get_available_layers() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_imported_files(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_layer_features(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_layer_features_geojson(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_project_files_with_companions(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_project_member_counts(uuid[]) TO authenticated, service_role; -- Needs SECURITY DEFINER check
GRANT EXECUTE ON FUNCTION public.get_shapefile_companions(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.import_geo_features(uuid, text, jsonb, integer, integer) TO service_role; -- Likely service only
GRANT EXECUTE ON FUNCTION public.import_geo_features_test(uuid, text, json, jsonb, integer, integer) TO authenticated, service_role; -- For testing
GRANT EXECUTE ON FUNCTION public.import_geo_features_with_transform(uuid, text, jsonb, integer, integer, integer) TO service_role; -- Likely service only
GRANT EXECUTE ON FUNCTION public.import_single_feature(uuid, jsonb, jsonb, integer) TO service_role; -- Likely service only
GRANT EXECUTE ON FUNCTION public.log_import(uuid, text, text, jsonb) TO service_role; -- Likely service only
GRANT EXECUTE ON FUNCTION public.log_import_message(text, text, jsonb) TO service_role; -- Likely service only
GRANT EXECUTE ON FUNCTION public.log_import_operation(text, jsonb) TO service_role; -- Likely service only
GRANT EXECUTE ON FUNCTION public.monitor_imports() TO service_role; -- Likely service only
GRANT EXECUTE ON FUNCTION public.monitor_imports_v2() TO service_role; -- Likely service only
GRANT EXECUTE ON FUNCTION public.monitor_imports_v3() TO service_role; -- Likely service only
GRANT EXECUTE ON FUNCTION public.rollback_transaction() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.test_warnings() TO authenticated, service_role; -- For testing
GRANT EXECUTE ON FUNCTION public.track_import_progress(uuid, integer, integer, integer, integer, integer) TO service_role; -- Likely service only
GRANT EXECUTE ON FUNCTION public.update_import_progress(uuid, integer, integer, uuid, uuid, jsonb) TO service_role; -- Likely service only
GRANT EXECUTE ON FUNCTION public.update_project_file_import_status(uuid, boolean, text) TO service_role; -- Likely service only
-- Trigger functions are executed by the system, don't need direct grants typically

-- You might need to grant execute on specific plv8 functions if applicable later
-- Example: GRANT EXECUTE ON FUNCTION extensions.plv8_js_func(text) TO authenticated;