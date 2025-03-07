CREATE OR REPLACE FUNCTION import_geo_features_with_transform(
  p_project_file_id UUID,
  p_collection_name TEXT,
  p_features JSONB,
  p_source_srid INTEGER DEFAULT 2056,
  p_batch_size INTEGER DEFAULT 100
)
RETURNS TABLE(
  collection_id UUID,
  layer_id UUID,
  imported_count INTEGER,
  failed_count INTEGER,
  debug_info JSONB
) 
LANGUAGE plpgsql
SECURITY DEFINER
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
  v_geometry GEOMETRY;
  v_raw_geometry GEOMETRY;
  v_cleaned_geometry GEOMETRY;
  v_debug JSONB;
  v_last_error TEXT;
  v_last_state TEXT;
  v_index_name TEXT;
  v_geom_type TEXT;
  v_start_time TIMESTAMPTZ;
  v_timeout_seconds INTEGER := 60; -- Increased to 60 seconds for complex repairs
  v_feature_errors JSONB := '[]'::JSONB;
BEGIN
  -- Create collection and layer
  INSERT INTO feature_collections (name, project_file_id)
  VALUES (p_collection_name, p_project_file_id)
  RETURNING id INTO v_collection_id;
  
  INSERT INTO layers (name, collection_id, type)
  VALUES (p_collection_name, v_collection_id, 'vector')
  RETURNING id INTO v_layer_id;

  -- Process all features
  FOR v_feature IN SELECT * FROM jsonb_array_elements(p_features)
  LOOP
    BEGIN
      v_start_time := clock_timestamp();
      
      -- Get geometry type
      v_geom_type := v_feature->'geometry'->>'type';
      
      -- Use ST_GeomFromGeoJSON for initial parsing
      BEGIN
        v_raw_geometry := ST_GeomFromGeoJSON(v_feature->'geometry');
        
        -- First clean duplicate vertices
        v_cleaned_geometry := ST_RemoveRepeatedPoints(v_raw_geometry);
        IF NOT ST_Equals(v_cleaned_geometry, v_raw_geometry) THEN
          v_cleaned_count := v_cleaned_count + 1;
          v_raw_geometry := v_cleaned_geometry;
        END IF;
        
        -- Check if geometry is valid
        IF NOT ST_IsValid(v_raw_geometry) THEN
          -- Set a higher timeout for small datasets
          PERFORM set_config('statement_timeout', (v_timeout_seconds * 1000)::text, true);
          
          BEGIN
            -- First try a zero buffer to fix minor self-intersections
            v_geometry := ST_Buffer(v_raw_geometry, 0.0);
            IF NOT ST_IsValid(v_geometry) THEN
              -- If still invalid, use ST_MakeValid
              v_geometry := ST_MakeValid(v_raw_geometry);
            END IF;
            
            -- Check geometry type after repair (ST_MakeValid might return MULTIPOLYGON)
            IF ST_GeometryType(v_geometry) = 'ST_MultiPolygon' THEN
              -- Extract the largest polygon if it's a MULTIPOLYGON
              v_geometry := (
                SELECT geom
                FROM (
                  SELECT (ST_Dump(v_geometry)).geom AS geom,
                         ST_Area((ST_Dump(v_geometry)).geom) AS area
                ) sub
                ORDER BY area DESC
                LIMIT 1
              );
            END IF;
            
            -- Transform to 3D and target SRID
            v_geometry := ST_Force3D(
              ST_Transform(
                ST_SetSRID(v_geometry, p_source_srid),
                4326
              )
            );
            v_repaired_count := v_repaired_count + 1;
          EXCEPTION WHEN OTHERS THEN
            -- Log detailed error including self-intersection reason
            v_skipped_count := v_skipped_count + 1;
            v_feature_errors := v_feature_errors || jsonb_build_object(
              'feature_index', v_imported_count + v_failed_count,
              'error', SQLERRM,
              'error_state', SQLSTATE,
              'invalid_reason', ST_IsValidReason(v_raw_geometry),
              'geometry_type_after_repair', ST_GeometryType(v_raw_geometry)
            );
            PERFORM set_config('statement_timeout', '0', true);
            CONTINUE;
          END;
          
          -- Reset timeout
          PERFORM set_config('statement_timeout', '0', true);
        ELSE
          -- Valid geometry, just transform
          v_geometry := ST_Force3D(
            ST_Transform(
              ST_SetSRID(v_raw_geometry, p_source_srid),
              4326
            )
          );
        END IF;
      EXCEPTION WHEN OTHERS THEN
        -- Handle parsing failure with fallback logic
        CASE v_geom_type
          WHEN 'Polygon' THEN
            BEGIN
              WITH 
              rings AS (
                SELECT jsonb_array_elements(v_feature->'geometry'->'coordinates') AS ring
              ),
              coords AS (
                SELECT 
                  (point->0)::float8 as x,
                  (point->1)::float8 as y
                FROM rings,
                jsonb_array_elements(ring) as point
              ),
              points AS (
                SELECT ST_MakePoint(x, y) as geom
                FROM coords
              ),
              raw_geom AS (
                SELECT ST_MakePolygon(ST_MakeLine(array_agg(geom))) as geom
                FROM points
              )
              SELECT geom INTO v_raw_geometry
              FROM raw_geom;

              -- Check if geometry is valid and repair if needed
              IF NOT ST_IsValid(v_raw_geometry) THEN
                PERFORM set_config('statement_timeout', (v_timeout_seconds * 1000)::text, true);
                
                BEGIN
                  v_geometry := ST_Buffer(v_raw_geometry, 0.0);
                  IF NOT ST_IsValid(v_geometry) THEN
                    v_geometry := ST_MakeValid(v_raw_geometry);
                  END IF;
                  
                  -- Handle MULTIPOLYGON result
                  IF ST_GeometryType(v_geometry) = 'ST_MultiPolygon' THEN
                    v_geometry := (
                      SELECT geom
                      FROM (
                        SELECT (ST_Dump(v_geometry)).geom AS geom,
                               ST_Area((ST_Dump(v_geometry)).geom) AS area
                      ) sub
                      ORDER BY area DESC
                      LIMIT 1
                    );
                  END IF;
                  
                  v_geometry := ST_Force3D(
                    ST_Transform(
                      ST_SetSRID(v_geometry, p_source_srid),
                      4326
                    )
                  );
                  v_repaired_count := v_repaired_count + 1;
                EXCEPTION WHEN OTHERS THEN
                  v_skipped_count := v_skipped_count + 1;
                  v_feature_errors := v_feature_errors || jsonb_build_object(
                    'feature_index', v_imported_count + v_failed_count,
                    'error', SQLERRM,
                    'error_state', SQLSTATE,
                    'invalid_reason', ST_IsValidReason(v_raw_geometry)
                  );
                  PERFORM set_config('statement_timeout', '0', true);
                  CONTINUE;
                END;
                
                PERFORM set_config('statement_timeout', '0', true);
              ELSE
                v_geometry := ST_Force3D(
                  ST_Transform(
                    ST_SetSRID(v_raw_geometry, p_source_srid),
                    4326
                  )
                );
              END IF;
            EXCEPTION WHEN OTHERS THEN
              v_skipped_count := v_skipped_count + 1;
              v_feature_errors := v_feature_errors || jsonb_build_object(
                'feature_index', v_imported_count + v_failed_count,
                'error', SQLERRM,
                'error_state', SQLSTATE
              );
              CONTINUE;
            END;

          WHEN 'LineString' THEN
            BEGIN
              WITH 
              coords AS (
                SELECT 
                  (point->0)::float8 as x,
                  (point->1)::float8 as y
                FROM jsonb_array_elements(v_feature->'geometry'->'coordinates') as point
              ),
              points AS (
                SELECT ST_MakePoint(x, y) as geom
                FROM coords
              ),
              raw_geom AS (
                SELECT ST_MakeLine(array_agg(geom)) as geom
                FROM points
              )
              SELECT geom INTO v_raw_geometry
              FROM raw_geom;

              -- Check if geometry is valid and repair if needed
              IF NOT ST_IsValid(v_raw_geometry) THEN
                PERFORM set_config('statement_timeout', (v_timeout_seconds * 1000)::text, true);
                
                BEGIN
                  v_geometry := ST_Force3D(
                    ST_Transform(
                      ST_SetSRID(
                        ST_MakeValid(v_raw_geometry),
                        p_source_srid
                      ),
                      4326
                    )
                  );
                  v_repaired_count := v_repaired_count + 1;
                EXCEPTION WHEN OTHERS THEN
                  v_skipped_count := v_skipped_count + 1;
                  v_feature_errors := v_feature_errors || jsonb_build_object(
                    'feature_index', v_imported_count + v_failed_count,
                    'error', SQLERRM,
                    'error_state', SQLSTATE
                  );
                  PERFORM set_config('statement_timeout', '0', true);
                  CONTINUE;
                END;
                
                PERFORM set_config('statement_timeout', '0', true);
              ELSE
                v_geometry := ST_Force3D(
                  ST_Transform(
                    ST_SetSRID(v_raw_geometry, p_source_srid),
                    4326
                  )
                );
              END IF;
            EXCEPTION WHEN OTHERS THEN
              RAISE EXCEPTION 'Failed to process LineString: %', SQLERRM;
            END;
            
          WHEN 'MultiPolygon' THEN
            BEGIN
              PERFORM set_config('statement_timeout', (v_timeout_seconds * 1000)::text, true);
              
              BEGIN
                v_raw_geometry := ST_GeomFromGeoJSON(v_feature->'geometry');
                
                IF NOT ST_IsValid(v_raw_geometry) THEN
                  v_geometry := ST_Force3D(
                    ST_Transform(
                      ST_SetSRID(
                        ST_MakeValid(v_raw_geometry),
                        p_source_srid
                      ),
                      4326
                    )
                  );
                  v_repaired_count := v_repaired_count + 1;
                ELSE
                  v_geometry := ST_Force3D(
                    ST_Transform(
                      ST_SetSRID(v_raw_geometry, p_source_srid),
                      4326
                    )
                  );
                END IF;
              EXCEPTION WHEN OTHERS THEN
                v_skipped_count := v_skipped_count + 1;
                v_feature_errors := v_feature_errors || jsonb_build_object(
                  'feature_index', v_imported_count + v_failed_count,
                  'error', SQLERRM,
                  'error_state', SQLSTATE
                );
                PERFORM set_config('statement_timeout', '0', true);
                CONTINUE;
              END;
              
              PERFORM set_config('statement_timeout', '0', true);
            EXCEPTION WHEN OTHERS THEN
              RAISE EXCEPTION 'Failed to process MultiPolygon: %', SQLERRM;
            END;

          ELSE
            v_skipped_count := v_skipped_count + 1;
            v_feature_errors := v_feature_errors || jsonb_build_object(
              'feature_index', v_imported_count + v_failed_count,
              'error', format('Unsupported geometry type: %s', v_geom_type),
              'error_state', 'GEOM_TYPE'
            );
            CONTINUE;
        END CASE;
      END;

      -- Ensure we don't spend too much time on a single feature
      IF (EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)) > v_timeout_seconds) THEN
        v_skipped_count := v_skipped_count + 1;
        v_feature_errors := v_feature_errors || jsonb_build_object(
          'feature_index', v_imported_count + v_failed_count,
          'error', format('Feature processing timeout after %s seconds', v_timeout_seconds),
          'error_state', 'TIMEOUT'
        );
        CONTINUE;
      END IF;

      -- Insert the feature
      INSERT INTO geo_features (
        geometry, 
        properties, 
        srid, 
        layer_id
      )
      VALUES (
        v_geometry,
        COALESCE(v_feature->'properties', '{}'::jsonb),
        4326,
        v_layer_id
      );
      
      v_imported_count := v_imported_count + 1;
      
    EXCEPTION WHEN OTHERS THEN
      v_failed_count := v_failed_count + 1;
      v_last_error := SQLERRM;
      v_last_state := SQLSTATE;
      
      -- Record specific feature errors
      v_feature_errors := v_feature_errors || jsonb_build_object(
        'feature_index', v_imported_count + v_failed_count,
        'error', v_last_error,
        'error_state', v_last_state
      );
    END;
  END LOOP;

  -- Create spatial index with a safe name
  v_index_name := 'idx_' || replace(v_layer_id::text, '-', '_') || '_geom';
  
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I ON geo_features USING GIST (geometry) WHERE layer_id = %L',
    v_index_name,
    v_layer_id
  );

  -- Prepare final debug info
  v_debug := jsonb_build_object(
    'stage', CASE 
      WHEN v_failed_count = 0 AND v_skipped_count = 0 THEN 'success'
      WHEN v_imported_count = 0 THEN 'complete_failure'
      ELSE 'partial_success'
    END,
    'total_features', jsonb_array_length(p_features),
    'last_error', v_last_error,
    'last_error_state', v_last_state,
    'index_name', v_index_name,
    'repaired_count', v_repaired_count,
    'cleaned_count', v_cleaned_count,
    'skipped_count', v_skipped_count,
    'repair_summary', CASE 
      WHEN v_repaired_count > 0 OR v_cleaned_count > 0
      THEN format('%s geometries were repaired and %s had duplicate vertices removed', 
                 v_repaired_count, 
                 v_cleaned_count)
      ELSE 'No geometries needed repair or cleaning'
    END,
    'skipped_summary', CASE
      WHEN v_skipped_count > 0
      THEN format('%s of %s geometries were skipped due to complexity or errors',
                 v_skipped_count,
                 jsonb_array_length(p_features))
      ELSE 'No geometries were skipped'
    END,
    'feature_errors', v_feature_errors
  );

  -- Return results with debug info
  RETURN QUERY SELECT v_collection_id, v_layer_id, v_imported_count, v_failed_count, v_debug;
END;
$$;