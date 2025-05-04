-- Create indexes for query performance
-- Feature collections indexes
CREATE INDEX IF NOT EXISTS idx_feature_collections_project_file_id 
    ON public.feature_collections(project_file_id);

-- Layers indexes
CREATE INDEX IF NOT EXISTS idx_layers_collection_id 
    ON public.layers(collection_id);

-- Geo features indexes
CREATE INDEX IF NOT EXISTS idx_geo_features_layer_id 
    ON public.geo_features(layer_id);

CREATE INDEX IF NOT EXISTS idx_geo_features_collection_id 
    ON public.geo_features(collection_id);

CREATE INDEX IF NOT EXISTS idx_geo_features_original_srid 
    ON public.geo_features(original_srid);

CREATE INDEX IF NOT EXISTS idx_geo_features_geometry_original_gist 
    ON public.geo_features USING GIST(geometry_original);

CREATE INDEX IF NOT EXISTS idx_geo_features_geometry_wgs84_gist 
    ON public.geo_features USING GIST(geometry_wgs84);

CREATE INDEX IF NOT EXISTS idx_geo_features_height_transformation_status 
    ON public.geo_features(height_transformation_status);

-- Vertical datums indexes
CREATE INDEX IF NOT EXISTS idx_vertical_datums_epsg_code 
    ON public.vertical_datums(epsg_code);

CREATE INDEX IF NOT EXISTS idx_vertical_datums_name 
    ON public.vertical_datums(name);

-- Project files indexes
CREATE INDEX IF NOT EXISTS idx_project_files_name 
    ON public.project_files(name);

-- Indexes for feature_collections table
CREATE INDEX IF NOT EXISTS idx_feature_collections_name ON public.feature_collections(name);

-- Indexes for layers table
CREATE INDEX IF NOT EXISTS idx_layers_name ON public.layers(name);
CREATE INDEX IF NOT EXISTS idx_layers_type ON public.layers(type);

-- Index for feature_terrain_cache table
CREATE INDEX IF NOT EXISTS idx_feature_terrain_cache_feature_id 
    ON public.feature_terrain_cache(feature_id);
