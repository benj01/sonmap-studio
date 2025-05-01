-- Create core tables in dependency order
-- Use inline PRIMARY KEY constraints where possible
-- Use inline FOREIGN KEY constraints referencing tables created *within this file* where simple

-- projects: Referenced by many others
CREATE TABLE public.projects (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    status text DEFAULT 'active'::text,
    metadata jsonb DEFAULT '{}'::jsonb,
    storage_used bigint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid REFERENCES auth.users(id),
    updated_by uuid REFERENCES auth.users(id)
);
COMMENT ON COLUMN public.projects.storage_used IS 'Total size of associated project files in bytes';

-- profiles: Linked to auth.users
CREATE TABLE public.profiles (
    id uuid PRIMARY KEY NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    username text UNIQUE,
    full_name text,
    avatar_url text,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);
COMMENT ON TABLE public.profiles IS 'Stores public user profile information.';

-- project_files: References projects
CREATE TABLE public.project_files (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    name text NOT NULL,
    size bigint NOT NULL,
    file_type text NOT NULL,
    storage_path text UNIQUE,
    uploaded_by uuid REFERENCES auth.users(id),
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    is_imported boolean DEFAULT false NOT NULL,
    import_metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    source_file_id uuid REFERENCES public.project_files(id),
    main_file_id uuid REFERENCES public.project_files(id) ON DELETE CASCADE,
    is_shapefile_component boolean DEFAULT false NOT NULL,
    component_type text CHECK (component_type = ANY (ARRAY['shp'::text, 'shx'::text, 'dbf'::text, 'prj'::text, 'qmd'::text]))
);
COMMENT ON TABLE public.project_files IS 'Stores information about uploaded files, including main data files and companions.';
COMMENT ON COLUMN public.project_files.component_type IS 'Type of component if part of a multi-file format like Shapefile (e.g., shp, dbf, prj)';
COMMENT ON COLUMN public.project_files.main_file_id IS 'References the main file (e.g., .shp) if this is a companion file.';
COMMENT ON COLUMN public.project_files.source_file_id IS 'Optional reference to the original source file if this file was derived (e.g., GeoJSON from Shapefile).';

-- feature_collections: References project_files
CREATE TABLE public.feature_collections (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    project_file_id uuid NOT NULL REFERENCES public.project_files(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
COMMENT ON TABLE public.feature_collections IS 'Groups layers originating from a single import file.';

-- vertical_datums: For vertical coordinate reference systems
CREATE TABLE public.vertical_datums (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL UNIQUE,
    epsg_code integer UNIQUE,
    datum_type text NOT NULL CHECK (datum_type IN ('ellipsoidal', 'orthometric', 'geoidal', 'other')),
    description text,
    area_of_use text,
    transformation_method text NOT NULL CHECK (transformation_method IN ('none', 'reframe_api', 'geoid_grid', 'fixed_offset', 'other')),
    transformation_params jsonb DEFAULT '{}',
    created_at timestamp with time zone DEFAULT timezone('utc', now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc', now()) NOT NULL
);
COMMENT ON TABLE public.vertical_datums IS 'Stores information about vertical datums and their transformation methods for 3D visualization.';
COMMENT ON COLUMN public.vertical_datums.datum_type IS 'Type of vertical datum: ellipsoidal (based on ellipsoid), orthometric (based on geoid), geoidal (based on geoid model), or other.';
COMMENT ON COLUMN public.vertical_datums.transformation_method IS 'Method used to transform heights between datums: none, reframe_api, geoid_grid, fixed_offset, or other.';
COMMENT ON COLUMN public.vertical_datums.transformation_params IS 'JSON parameters specific to the transformation method (e.g., grid file paths, offset values).';

-- layers: References feature_collections
CREATE TABLE public.layers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    collection_id uuid NOT NULL REFERENCES public.feature_collections(id) ON DELETE CASCADE,
    name text NOT NULL,
    type text NOT NULL,
    properties jsonb DEFAULT '{}'::jsonb,
    source_name text,
    source_format text,
    feature_type_geom text CHECK (feature_type_geom IN ('Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon', 'GeometryCollection', 'Unknown')),
    feature_count integer,
    default_visibility boolean NOT NULL DEFAULT true,
    style_options jsonb NOT NULL DEFAULT '{}',
    is_terrain_source boolean NOT NULL DEFAULT false,
    has_3d_tiles boolean NOT NULL DEFAULT false,
    tileset_metadata_id uuid,
    default_base_elevation_source text NOT NULL DEFAULT 'terrain_surface' CHECK (default_base_elevation_source IN ('terrain_surface', 'geometry_z', 'attribute', 'none')),
    default_base_elevation_attribute text,
    default_height_top_source text NOT NULL DEFAULT 'none' CHECK (default_height_top_source IN ('attribute', 'fixed_value', 'none')),
    default_height_top_value text,
    default_height_interpretation text NOT NULL DEFAULT 'clamp_to_ground' CHECK (default_height_interpretation IN ('clamp_to_ground', 'relative_to_ground', 'absolute')),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
COMMENT ON TABLE public.layers IS 'Represents a single geospatial layer within a feature collection.';
COMMENT ON COLUMN public.layers.source_name IS 'Original name of the data source.';
COMMENT ON COLUMN public.layers.source_format IS 'Format of the original data source (e.g., Shapefile, GeoJSON).';
COMMENT ON COLUMN public.layers.feature_type_geom IS 'Primary geometry type of features in this layer.';
COMMENT ON COLUMN public.layers.feature_count IS 'Total number of features in the layer.';
COMMENT ON COLUMN public.layers.default_visibility IS 'Whether the layer should be visible by default in the viewer.';
COMMENT ON COLUMN public.layers.style_options IS 'JSON configuration for layer styling in the viewer.';
COMMENT ON COLUMN public.layers.is_terrain_source IS 'Whether this layer can be used as a terrain source.';
COMMENT ON COLUMN public.layers.has_3d_tiles IS 'Whether this layer has been converted to 3D Tiles format.';
COMMENT ON COLUMN public.layers.tileset_metadata_id IS 'Reference to 3D Tiles metadata if applicable.';
COMMENT ON COLUMN public.layers.default_base_elevation_source IS 'Source for base elevation values: terrain_surface, geometry_z, attribute, or none.';
COMMENT ON COLUMN public.layers.default_base_elevation_attribute IS 'Attribute name to use for base elevation when source is attribute.';
COMMENT ON COLUMN public.layers.default_height_top_source IS 'Source for top height values: attribute, fixed_value, or none.';
COMMENT ON COLUMN public.layers.default_height_top_value IS 'Fixed value or attribute name for top height.';
COMMENT ON COLUMN public.layers.default_height_interpretation IS 'How heights should be interpreted: clamp_to_ground, relative_to_ground, or absolute.';

-- geo_features: References layers and feature_collections
CREATE TABLE public.geo_features (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    layer_id uuid NOT NULL REFERENCES public.layers(id) ON DELETE CASCADE,
    collection_id uuid REFERENCES public.feature_collections(id) ON DELETE SET NULL,
    attributes jsonb DEFAULT '{}'::jsonb,
    geometry_original geometry,
    original_srid integer,
    original_has_z boolean NOT NULL DEFAULT false,
    original_vertical_datum_id uuid REFERENCES public.vertical_datums(id),
    geometry_wgs84 geometry(GeometryZ, 4326),
    display_base_elevation double precision,
    display_object_height double precision,
    display_height_mode text CHECK (display_height_mode IN ('clamp_to_ground', 'relative_to_ground', 'absolute')),
    height_calculation_log jsonb DEFAULT '{}',
    height_transformation_status text NOT NULL DEFAULT 'pending' CHECK (height_transformation_status IN ('pending', 'processing', 'complete', 'failed', 'not_required')),
    height_transformed_at timestamp with time zone,
    height_transformation_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
COMMENT ON TABLE public.geo_features IS 'Stores individual geospatial features with transformed geometry and height data.';
COMMENT ON COLUMN public.geo_features.geometry_original IS 'Original geometry as imported, preserving the original coordinate system and Z values if present.';
COMMENT ON COLUMN public.geo_features.original_srid IS 'Spatial Reference System Identifier (SRID) of the original geometry.';
COMMENT ON COLUMN public.geo_features.original_has_z IS 'Flag indicating whether the original geometry included Z values.';
COMMENT ON COLUMN public.geo_features.original_vertical_datum_id IS 'Reference to the vertical datum used in the original geometry.';
COMMENT ON COLUMN public.geo_features.geometry_wgs84 IS 'Processed geometry in WGS84 (EPSG:4326) with ellipsoidal heights, ready for Cesium visualization.';
COMMENT ON COLUMN public.geo_features.display_base_elevation IS 'Calculated base ellipsoidal height for display in Cesium.';
COMMENT ON COLUMN public.geo_features.display_object_height IS 'Extrusion or object height for display in Cesium.';
COMMENT ON COLUMN public.geo_features.display_height_mode IS 'How the feature should be displayed in Cesium: clamp_to_ground, relative_to_ground, or absolute.';
COMMENT ON COLUMN public.geo_features.height_calculation_log IS 'JSON log of height calculation steps and parameters used.';
COMMENT ON COLUMN public.geo_features.height_transformation_status IS 'Status of height transformation process: pending, processing, complete, failed, or not_required.';
COMMENT ON COLUMN public.geo_features.height_transformed_at IS 'Timestamp when height transformation was completed.';
COMMENT ON COLUMN public.geo_features.height_transformation_error IS 'Error message if height transformation failed.';

-- import_logs: For general logging
CREATE TABLE public.import_logs (
    id SERIAL PRIMARY KEY,
    "timestamp" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    level text,
    message text,
    details jsonb
);
COMMENT ON TABLE public.import_logs IS 'Stores general logs related to import processes.';

-- project_members: Join table for projects and users
CREATE TABLE public.project_members (
    project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role text NOT NULL CHECK (role = ANY (ARRAY['viewer'::text, 'editor'::text, 'admin'::text])),
    invited_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    joined_at timestamp with time zone,
    PRIMARY KEY (project_id, user_id)
);
COMMENT ON TABLE public.project_members IS 'Manages user membership and roles within projects.';

-- realtime_import_logs: For tracking specific import jobs
CREATE TABLE public.realtime_import_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    project_file_id uuid NOT NULL REFERENCES public.project_files(id) ON DELETE CASCADE,
    status text NOT NULL CHECK (status = ANY (ARRAY['started'::text, 'processing'::text, 'completed'::text, 'failed'::text])),
    total_features integer DEFAULT 0 NOT NULL,
    imported_count integer DEFAULT 0 NOT NULL,
    failed_count integer DEFAULT 0 NOT NULL,
    collection_id uuid REFERENCES public.feature_collections(id) ON DELETE SET NULL,
    layer_id uuid REFERENCES public.layers(id) ON DELETE SET NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
COMMENT ON TABLE public.realtime_import_logs IS 'Tracks the status and progress of individual file import jobs.';

-- user_settings: User-specific settings
CREATE TABLE public.user_settings (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    max_file_size bigint DEFAULT 52428800,
    default_project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
    theme text DEFAULT 'system'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
COMMENT ON TABLE public.user_settings IS 'Stores user-specific application settings.';