-- Populate vertical_datums table with essential reference systems
INSERT INTO public.vertical_datums (
    name,
    epsg_code,
    datum_type,
    description,
    area_of_use,
    transformation_method,
    transformation_params
) VALUES
    (
        'WGS84 Ellipsoid',
        NULL,
        'ellipsoidal',
        'World Geodetic System 1984 ellipsoid height. Reference for CesiumJS.',
        'Global',
        'none',
        '{}'::jsonb
    ),
    (
        'LHN95',
        5729,
        'orthometric',
        'Swiss National Height Network 1995 (LN02 based). Uses CHGeo2004 geoid.',
        'Switzerland and Liechtenstein',
        'reframe_api',
        '{
            "api_endpoint": "https://geodesy.geo.admin.ch/reframe/lv95towgs84",
            "api_type": "swisstopo_reframe",
            "source_crs_implicit": "EPSG:2056",
            "target_crs_implicit": "EPSG:4326+5773"
        }'::jsonb
    ),
    (
        'EGM2008 Geoid',
        3855,
        'orthometric',
        'Earth Gravitational Model 2008 height. Represents height above the geoid (approximates Mean Sea Level).',
        'Global (approximated)',
        'geoid_grid',
        '{
            "grid_source": "cesium_internal_or_external_grid",
            "model": "EGM2008"
        }'::jsonb
    )
ON CONFLICT (name) DO NOTHING;

-- Add comments for better documentation
COMMENT ON TABLE public.vertical_datums IS 'Reference systems for vertical datums and their transformation methods.';

-- Add specific comments for each datum
COMMENT ON COLUMN public.vertical_datums.epsg_code IS 'EPSG code for the vertical CRS, if applicable. NULL for reference ellipsoids.';
COMMENT ON COLUMN public.vertical_datums.datum_type IS 'Type of vertical datum: ellipsoidal (based on ellipsoid), orthometric (based on geoid), geoidal (based on geoid model), or other.';
COMMENT ON COLUMN public.vertical_datums.transformation_method IS 'Method used to transform heights between datums: none, reframe_api, geoid_grid, fixed_offset, or other.';
COMMENT ON COLUMN public.vertical_datums.transformation_params IS 'JSON parameters specific to the transformation method (e.g., API endpoints, grid file paths, offset values).'; 