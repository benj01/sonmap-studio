-- Create indexes for faster lookups

-- Indexes on projects
CREATE INDEX idx_projects_owner ON public.projects USING btree (owner_id);

-- Indexes on profiles
CREATE INDEX idx_profiles_username ON public.profiles USING btree (username);

-- Indexes on project_files
CREATE INDEX idx_project_files_project ON public.project_files USING btree (project_id);
CREATE INDEX idx_project_files_uploaded_by ON public.project_files USING btree (uploaded_by); -- Added index on uploaded_by
CREATE INDEX idx_project_files_is_imported ON public.project_files USING btree (is_imported) WHERE (is_imported = true);
CREATE INDEX idx_project_files_main_file ON public.project_files USING btree (main_file_id) WHERE (main_file_id IS NOT NULL);
CREATE INDEX idx_project_files_source_file ON public.project_files USING btree (source_file_id) WHERE (source_file_id IS NOT NULL);
CREATE INDEX idx_project_files_component_type ON public.project_files USING btree (component_type) WHERE (component_type IS NOT NULL);

-- Indexes on feature_collections
CREATE INDEX feature_collections_project_file_idx ON public.feature_collections USING btree (project_file_id);

-- Indexes on layers
CREATE INDEX layers_collection_id_idx ON public.layers USING btree (collection_id);

-- Indexes on geo_features (Using correct column names)
CREATE INDEX idx_geo_features_layer_id ON public.geo_features USING btree (layer_id);
CREATE INDEX idx_geo_features_collection_id ON public.geo_features USING btree (collection_id);
CREATE INDEX idx_geo_features_geometry_2d ON public.geo_features USING gist (geometry_2d); -- Use GIST for spatial data
CREATE INDEX idx_geo_features_base_elevation ON public.geo_features(base_elevation_ellipsoidal); -- Index on height

-- Indexes on import_logs
CREATE INDEX idx_import_logs_timestamp ON public.import_logs USING btree ("timestamp" DESC);
CREATE INDEX idx_import_logs_level ON public.import_logs USING btree (level);

-- Indexes on project_members
CREATE INDEX idx_project_members_user ON public.project_members USING btree (user_id);
-- The PK (project_id, user_id) already provides an index on project_id first

-- Indexes on realtime_import_logs
CREATE INDEX realtime_import_logs_project_file_id_idx ON public.realtime_import_logs USING btree (project_file_id);
CREATE INDEX realtime_import_logs_status_idx ON public.realtime_import_logs USING btree (status);
CREATE INDEX realtime_import_logs_updated_at_idx ON public.realtime_import_logs USING btree (updated_at DESC); -- Added index on updated_at

-- Indexes on user_settings
-- The UNIQUE constraint on user_id already creates an index.