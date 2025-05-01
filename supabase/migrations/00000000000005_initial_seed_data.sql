-- Populate vertical_datums table with essential reference systems
-- These are the core vertical datums needed for the application to function properly
-- WGS84 Ellipsoid is the reference for CesiumJS
-- LHN95 is the Swiss national height system
-- EGM2008 is a global geoid model commonly used for height transformations
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
        3855, -- This EPSG might represent a compound CRS, but often associated with EGM2008 height component
        'orthometric', -- Representing height above MSL/Geoid
        'Earth Gravitational Model 2008 height. Represents height above the geoid (approximates Mean Sea Level).',
        'Global (approximated)',
        'geoid_grid', -- Transformation method often involves using the EGM2008 grid
        '{
            "grid_source": "cesium_internal_or_external_grid",
            "model": "EGM2008"
        }'::jsonb
    )
ON CONFLICT (name) DO NOTHING; 