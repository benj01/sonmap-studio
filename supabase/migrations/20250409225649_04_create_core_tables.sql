-- Create core tables in dependency order
-- Use inline PRIMARY KEY constraints where possible
-- Use inline FOREIGN KEY constraints referencing tables created *within this file* where simple

-- projects: Referenced by many others
CREATE TABLE public.projects (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    owner_id uuid NOT NULL, -- FK to auth.users added later
    name text NOT NULL,
    description text,
    storage_used bigint DEFAULT 0 NOT NULL, -- Added NOT NULL based on default
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid, -- FK to auth.users might be needed later if used
    updated_by uuid  -- FK to auth.users might be needed later if used
);
COMMENT ON COLUMN public.projects.storage_used IS 'Total size of associated project files in bytes';

-- profiles: Linked to auth.users
CREATE TABLE public.profiles (
    id uuid PRIMARY KEY NOT NULL, -- FK to auth.users added later
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
    type text NOT NULL, -- e.g., 'Shapefile', 'GeoJSON', 'Companion'
    storage_path text UNIQUE, -- Added UNIQUE constraint as paths should be unique
    uploaded_by uuid, -- FK to auth.users added later
    is_imported boolean DEFAULT false NOT NULL,
    import_metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    source_file_id uuid, -- Self-ref FK added later
    main_file_id uuid,   -- Self-ref FK added later
    is_shapefile_component boolean DEFAULT false NOT NULL,
    component_type text -- e.g., 'shp', 'shx', 'dbf', 'prj'
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

-- layers: References feature_collections
CREATE TABLE public.layers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    collection_id uuid NOT NULL REFERENCES public.feature_collections(id) ON DELETE CASCADE,
    name text NOT NULL,
    type text NOT NULL, -- e.g., 'vector', 'raster' (initially 'auto' or 'Feature'?)
    properties jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
COMMENT ON TABLE public.layers IS 'Represents a single geospatial layer within a feature collection.';

-- geo_features: References layers and feature_collections (FINAL SCHEMA)
CREATE TABLE public.geo_features (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    layer_id uuid NOT NULL REFERENCES public.layers(id) ON DELETE CASCADE,
    collection_id uuid REFERENCES public.feature_collections(id) ON DELETE SET NULL, -- Optional direct link for easier queries
    properties jsonb DEFAULT '{}'::jsonb,
    srid integer, -- SRID context of the *original* data or transformation process, if needed for reference

    -- Corrected Height/Geometry Columns:
    geometry_2d geometry(Geometry, 4326), -- WGS84 2D footprint
    base_elevation_ellipsoidal double precision, -- WGS84 Ellipsoidal height (meters)
    object_height double precision, -- Object height relative to base (meters)
    height_mode text, -- e.g., 'absolute_ellipsoidal', 'relative_to_ground'
    height_source text, -- Origin of base height (e.g., 'z_coord', 'attribute:H_MEAN')
    vertical_datum_source text, -- Original vertical datum (e.g., 'LHN95', 'WGS84')

    -- Timestamps
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);
COMMENT ON TABLE public.geo_features IS 'Stores individual geospatial features with transformed geometry and height data.';
COMMENT ON COLUMN public.geo_features.geometry_2d IS 'The WGS84 2D footprint of the feature (EPSG:4326)';
COMMENT ON COLUMN public.geo_features.base_elevation_ellipsoidal IS 'The calculated WGS84 ellipsoidal height of the feature base (in meters)';
COMMENT ON COLUMN public.geo_features.object_height IS 'The height of the object itself (in meters), relative to its base_elevation_ellipsoidal';
COMMENT ON COLUMN public.geo_features.height_mode IS 'Defines how base_elevation_ellipsoidal relates to the conceptual ground (e.g., absolute_ellipsoidal)';
COMMENT ON COLUMN public.geo_features.height_source IS 'Indicates where the base height information originated before transformation (e.g., z_coord, attribute:H_MEAN)';
COMMENT ON COLUMN public.geo_features.vertical_datum_source IS 'Original vertical datum of the height_source (e.g., LHN95, WGS84, unknown)';
COMMENT ON COLUMN public.geo_features.srid IS 'Reference SRID, often the source SRID (e.g., 2056) or target context SRID if different from geometry.';

-- import_logs: For general logging
CREATE TABLE public.import_logs (
    id integer NOT NULL, -- PK constraint added later
    "timestamp" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    level text,
    message text,
    details jsonb
);
ALTER SEQUENCE public.import_logs_id_seq OWNED BY public.import_logs.id;
COMMENT ON TABLE public.import_logs IS 'Stores general logs related to import processes.';

-- project_members: Join table for projects and users
CREATE TABLE public.project_members (
    project_id uuid NOT NULL, -- PK/FK added later
    user_id uuid NOT NULL, -- PK/FK added later
    role text NOT NULL CHECK (role = ANY (ARRAY['viewer'::text, 'editor'::text, 'admin'::text])),
    invited_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    joined_at timestamp with time zone
);
COMMENT ON TABLE public.project_members IS 'Manages user membership and roles within projects.';

-- realtime_import_logs: For tracking specific import jobs
CREATE TABLE public.realtime_import_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY, -- Use UUID PK
    project_file_id uuid NOT NULL, -- FK added later
    status text NOT NULL CHECK (status = ANY (ARRAY['started'::text, 'processing'::text, 'completed'::text, 'failed'::text])),
    total_features integer DEFAULT 0 NOT NULL,
    imported_count integer DEFAULT 0 NOT NULL,
    failed_count integer DEFAULT 0 NOT NULL,
    collection_id uuid, -- FK added later
    layer_id uuid, -- FK added later
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
COMMENT ON TABLE public.realtime_import_logs IS 'Tracks the status and progress of individual file import jobs.';

-- user_settings: User-specific settings
CREATE TABLE public.user_settings (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY, -- Use UUID PK
    user_id uuid NOT NULL UNIQUE, -- FK to auth.users added later
    max_file_size bigint DEFAULT 52428800, -- 50 MiB
    default_project_id uuid, -- FK to projects added later
    theme text DEFAULT 'system'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
COMMENT ON TABLE public.user_settings IS 'Stores user-specific application settings.';