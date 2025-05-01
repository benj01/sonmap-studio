-- Refactor geo_features table
-- 1. Drop old/redundant columns
ALTER TABLE public.geo_features
    DROP COLUMN IF EXISTS geometry_2d,
    DROP COLUMN IF EXISTS geometry_3d,
    DROP COLUMN IF EXISTS srid,
    DROP COLUMN IF EXISTS base_elevation_ellipsoidal,
    DROP COLUMN IF EXISTS object_height,
    DROP COLUMN IF EXISTS height_mode,
    DROP COLUMN IF EXISTS height_source,
    DROP COLUMN IF EXISTS vertical_datum_source,
    DROP COLUMN IF EXISTS original_height_values,
    DROP COLUMN IF EXISTS height_transformation_batch_id;

-- 2. Add new columns
ALTER TABLE public.geo_features
    ADD COLUMN IF NOT EXISTS geometry_original GEOMETRY,
    ADD COLUMN IF NOT EXISTS original_srid INTEGER,
    ADD COLUMN IF NOT EXISTS original_has_z BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS original_vertical_datum_id UUID,
    ADD COLUMN IF NOT EXISTS geometry_wgs84 GEOMETRY(GeometryZ, 4326),
    ADD COLUMN IF NOT EXISTS display_base_elevation DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS display_object_height DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS display_height_mode TEXT CHECK (display_height_mode IN ('clamp_to_ground', 'relative_to_ground', 'absolute')),
    ADD COLUMN IF NOT EXISTS height_calculation_log JSONB DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS height_transformation_status TEXT NOT NULL DEFAULT 'pending' CHECK (height_transformation_status IN ('pending', 'processing', 'complete', 'failed', 'not_required')),
    ADD COLUMN IF NOT EXISTS height_transformed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS height_transformation_error TEXT;

-- 3. Add foreign key constraint
ALTER TABLE public.geo_features
    ADD CONSTRAINT fk_geo_features_original_vertical_datum
    FOREIGN KEY (original_vertical_datum_id)
    REFERENCES public.vertical_datums(id);

-- 4. Add indexes
CREATE INDEX IF NOT EXISTS idx_geo_features_layer_id ON public.geo_features(layer_id);
CREATE INDEX IF NOT EXISTS idx_geo_features_original_srid ON public.geo_features(original_srid);
CREATE INDEX IF NOT EXISTS idx_geo_features_geometry_original_gist ON public.geo_features USING GIST(geometry_original);
CREATE INDEX IF NOT EXISTS idx_geo_features_geometry_wgs84_gist ON public.geo_features USING GIST(geometry_wgs84);

-- 5. Ensure updated_at trigger
DROP TRIGGER IF EXISTS set_geo_features_timestamp ON public.geo_features;
CREATE TRIGGER set_geo_features_timestamp
    BEFORE UPDATE ON public.geo_features
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_set_timestamp();

-- Add comments for better documentation
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