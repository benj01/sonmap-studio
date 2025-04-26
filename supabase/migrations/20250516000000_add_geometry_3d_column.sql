-- Migration to add geometry_3d column to geo_features table
-- This migration enhances the geo_features table with a 3D geometry column
-- and updates relevant functions to use both 2D and 3D geometries

-- Add geometry_3d column to store full 3D geometry data
ALTER TABLE public.geo_features ADD COLUMN IF NOT EXISTS geometry_3d geometry(GeometryZ, 4326);
COMMENT ON COLUMN public.geo_features.geometry_3d IS 'The WGS84 3D geometry with Z coordinates preserved (EPSG:4326)';

-- Create index on geometry_3d column
CREATE INDEX IF NOT EXISTS idx_geo_features_geometry_3d ON public.geo_features USING gist (geometry_3d);

-- Update import functions to preserve 3D geometry data

-- Function to handle coordinate transformation during import
CREATE OR REPLACE FUNCTION public.transform_and_store_geometries(
    p_geometry jsonb, 
    p_source_srid integer
) RETURNS TABLE(geometry_2d geometry, geometry_3d geometry) AS $$
DECLARE
    v_geom geometry;
    v_geom_2d geometry;
    v_geom_3d geometry;
BEGIN
    -- Create geometry from GeoJSON
    v_geom := ST_SetSRID(ST_GeomFromGeoJSON(p_geometry::text), p_source_srid);
    
    -- Transform to WGS84
    v_geom := ST_Transform(v_geom, 4326);
    
    -- Create 2D version for efficient querying
    v_geom_2d := ST_Force2D(v_geom);
    
    -- Create 3D version with Z values preserved
    -- If the original geometry doesn't have Z values, Force3D will add them with Z=0
    v_geom_3d := CASE 
                    WHEN ST_CoordDim(v_geom) >= 3 THEN v_geom
                    ELSE ST_Force3D(v_geom) 
                  END;
    
    RETURN QUERY SELECT v_geom_2d, v_geom_3d;
END;
$$ LANGUAGE plpgsql;

-- Update get_layer_features_geojson function to include Z values
CREATE OR REPLACE FUNCTION public.get_layer_features_geojson(p_layer_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER 
    SET search_path TO 'public', 'extensions'
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
                    -- Use geometry_3d if it exists, otherwise fall back to geometry_2d
                    'geometry', ST_AsGeoJSON(
                        COALESCE(gf.geometry_3d, gf.geometry_2d)
                    )::jsonb,
                    'properties', gf.properties
                ) ORDER BY gf.id
            ),
            '[]'::jsonb
        )
    )
    INTO v_features
    FROM public.geo_features gf
    WHERE gf.layer_id = p_layer_id;

    RETURN v_features;
END;
$$;

-- Update get_layer_features function to include Z values
CREATE OR REPLACE FUNCTION public.get_layer_features(p_layer_id uuid) 
RETURNS TABLE(id uuid, properties jsonb, geojson text, srid integer)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        f.id,
        f.properties,
        -- Use geometry_3d if it exists, otherwise fall back to geometry_2d
        ST_AsGeoJSON(COALESCE(f.geometry_3d, f.geometry_2d)) as geojson,
        4326 as srid
    FROM public.geo_features f
    WHERE f.layer_id = p_layer_id;
END;
$$;

-- Backfill geometry_3d from geometry_2d if z-coordinate information exists
-- This helps existing features take advantage of the new column
DO $$
DECLARE
    v_updated_count INTEGER := 0;
BEGIN
    -- For features with height values in properties, attempt to create 3D geometries
    UPDATE public.geo_features 
    SET geometry_3d = ST_Translate(
        ST_Force3D(geometry_2d), 
        0, 
        0, 
        COALESCE(base_elevation_ellipsoidal, 
                (properties->>'height')::float, 
                (properties->>'lv95_height')::float, 
                0)
    )
    WHERE geometry_3d IS NULL 
      AND (base_elevation_ellipsoidal IS NOT NULL 
           OR (properties->>'height') IS NOT NULL 
           OR (properties->>'lv95_height') IS NOT NULL);
    
    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    RAISE NOTICE 'Updated % features with 3D geometries', v_updated_count;
END $$;