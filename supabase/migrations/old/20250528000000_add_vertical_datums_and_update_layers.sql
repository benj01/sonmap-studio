-- Create vertical_datums table
CREATE TABLE IF NOT EXISTS public.vertical_datums (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    epsg_code INTEGER UNIQUE,
    datum_type TEXT NOT NULL CHECK (datum_type IN ('ellipsoidal', 'orthometric', 'geoidal', 'other')),
    description TEXT,
    area_of_use TEXT,
    transformation_method TEXT NOT NULL CHECK (transformation_method IN ('none', 'reframe_api', 'geoid_grid', 'fixed_offset', 'other')),
    transformation_params JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- Add trigger for vertical_datums
CREATE TRIGGER set_vertical_datums_timestamp
    BEFORE UPDATE ON public.vertical_datums
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_set_timestamp();

-- Modify layers table
ALTER TABLE public.layers
    ADD COLUMN IF NOT EXISTS source_name TEXT,
    ADD COLUMN IF NOT EXISTS source_format TEXT,
    ADD COLUMN IF NOT EXISTS feature_type_geom TEXT CHECK (feature_type_geom IN ('Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon', 'GeometryCollection', 'Unknown')),
    ADD COLUMN IF NOT EXISTS feature_count INTEGER,
    ADD COLUMN IF NOT EXISTS default_visibility BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS style_options JSONB NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS is_terrain_source BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS has_3d_tiles BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS tileset_metadata_id UUID,
    ADD COLUMN IF NOT EXISTS default_base_elevation_source TEXT NOT NULL DEFAULT 'terrain_surface' CHECK (default_base_elevation_source IN ('terrain_surface', 'geometry_z', 'attribute', 'none')),
    ADD COLUMN IF NOT EXISTS default_base_elevation_attribute TEXT,
    ADD COLUMN IF NOT EXISTS default_height_top_source TEXT NOT NULL DEFAULT 'none' CHECK (default_height_top_source IN ('attribute', 'fixed_value', 'none')),
    ADD COLUMN IF NOT EXISTS default_height_top_value TEXT,
    ADD COLUMN IF NOT EXISTS default_height_interpretation TEXT NOT NULL DEFAULT 'clamp_to_ground' CHECK (default_height_interpretation IN ('clamp_to_ground', 'relative_to_ground', 'absolute'));

-- Add or replace trigger for layers
DROP TRIGGER IF EXISTS set_layers_timestamp ON public.layers;
CREATE TRIGGER set_layers_timestamp
    BEFORE UPDATE ON public.layers
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_set_timestamp();

-- Add comments for better documentation
COMMENT ON TABLE public.vertical_datums IS 'Stores information about vertical datums and their transformation methods for 3D visualization.';
COMMENT ON COLUMN public.vertical_datums.datum_type IS 'Type of vertical datum: ellipsoidal (based on ellipsoid), orthometric (based on geoid), geoidal (based on geoid model), or other.';
COMMENT ON COLUMN public.vertical_datums.transformation_method IS 'Method used to transform heights between datums: none, reframe_api, geoid_grid, fixed_offset, or other.';
COMMENT ON COLUMN public.vertical_datums.transformation_params IS 'JSON parameters specific to the transformation method (e.g., grid file paths, offset values).';

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