-- Enable Row Level Security on all relevant tables
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.layers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geo_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.realtime_import_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vertical_datums ENABLE ROW LEVEL SECURITY;

-- Projects policies
-- SIMPLIFIED SELECT POLICY (Attempt 2)
CREATE POLICY "Users can view projects they own" -- Renamed slightly for clarity
    ON public.projects
    FOR SELECT
    USING (owner_id = auth.uid()); -- Only check owner_id

-- CORRECTED INSERT POLICY
CREATE POLICY "Users can create projects for themselves"
    ON public.projects
    FOR INSERT
    WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can update their own projects"
    ON public.projects
    FOR UPDATE
    USING (owner_id = auth.uid());

CREATE POLICY "Users can delete their own projects"
    ON public.projects
    FOR DELETE
    USING (owner_id = auth.uid());

-- Project members policies
CREATE POLICY "Users can view project memberships"
    ON public.project_members
    FOR SELECT
    USING (
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.projects
            WHERE id = project_members.project_id
            AND owner_id = auth.uid()
        )
    );

CREATE POLICY "Project owners can manage members"
    ON public.project_members
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.projects
            WHERE id = project_members.project_id
            AND owner_id = auth.uid()
        )
    );

-- Project files policies
CREATE POLICY "Users can view their own project files"
    ON public.project_files
    FOR SELECT
    USING (
        uploaded_by = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.projects p
            JOIN public.project_members pm ON p.id = pm.project_id
            WHERE p.id = project_files.project_id
            AND pm.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create project files"
    ON public.project_files
    FOR INSERT
    WITH CHECK (
        uploaded_by = auth.uid() AND
        EXISTS (
            SELECT 1 FROM public.projects p
            JOIN public.project_members pm ON p.id = pm.project_id
            WHERE p.id = project_files.project_id
            AND pm.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update their own project files"
    ON public.project_files
    FOR UPDATE
    USING (uploaded_by = auth.uid());

CREATE POLICY "Users can delete their own project files"
    ON public.project_files
    FOR DELETE
    USING (uploaded_by = auth.uid());

-- Feature collections policies
CREATE POLICY "Users can view their own feature collections"
    ON public.feature_collections
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.project_files pf
            WHERE pf.id = feature_collections.project_file_id
            AND (
                pf.uploaded_by = auth.uid() OR
                EXISTS (
                    SELECT 1 FROM public.projects p
                    JOIN public.project_members pm ON p.id = pm.project_id
                    WHERE p.id = pf.project_id
                    AND pm.user_id = auth.uid()
                )
            )
        )
    );

CREATE POLICY "Users can manage their own feature collections"
    ON public.feature_collections
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.project_files pf
            WHERE pf.id = feature_collections.project_file_id
            AND pf.uploaded_by = auth.uid()
        )
    );

-- Layers policies
CREATE POLICY "Users can view their own layers"
    ON public.layers
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.feature_collections fc
            JOIN public.project_files pf ON pf.id = fc.project_file_id
            WHERE fc.id = layers.collection_id
            AND (
                pf.uploaded_by = auth.uid() OR
                EXISTS (
                    SELECT 1 FROM public.projects p
                    JOIN public.project_members pm ON p.id = pm.project_id
                    WHERE p.id = pf.project_id
                    AND pm.user_id = auth.uid()
                )
            )
        )
    );

CREATE POLICY "Users can manage their own layers"
    ON public.layers
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.feature_collections fc
            JOIN public.project_files pf ON pf.id = fc.project_file_id
            WHERE fc.id = layers.collection_id
            AND pf.uploaded_by = auth.uid()
        )
    );

-- Geo features policies
CREATE POLICY "Users can view their own geo features"
    ON public.geo_features
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.layers l
            JOIN public.feature_collections fc ON fc.id = l.collection_id
            JOIN public.project_files pf ON pf.id = fc.project_file_id
            WHERE l.id = geo_features.layer_id
            AND (
                pf.uploaded_by = auth.uid() OR
                EXISTS (
                    SELECT 1 FROM public.projects p
                    JOIN public.project_members pm ON p.id = pm.project_id
                    WHERE p.id = pf.project_id
                    AND pm.user_id = auth.uid()
                )
            )
        )
    );

CREATE POLICY "Users can manage their own geo features"
    ON public.geo_features
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.layers l
            JOIN public.feature_collections fc ON fc.id = l.collection_id
            JOIN public.project_files pf ON pf.id = fc.project_file_id
            WHERE l.id = geo_features.layer_id
            AND pf.uploaded_by = auth.uid()
        )
    );

-- Vertical datums policies
CREATE POLICY "Anyone can view vertical datums"
    ON public.vertical_datums
    FOR SELECT
    USING (true);

CREATE POLICY "Only authenticated users can modify vertical datums"
    ON public.vertical_datums
    FOR ALL
    USING (auth.uid() IS NOT NULL);

-- User settings policies
CREATE POLICY "Users can view their own settings"
    ON public.user_settings
    FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can manage their own settings"
    ON public.user_settings
    FOR ALL
    USING (user_id = auth.uid());

-- Profiles policies
CREATE POLICY "Users can view their own profile"
    ON public.profiles
    FOR SELECT
    USING (id = auth.uid());

CREATE POLICY "Users can update their own profile"
    ON public.profiles
    FOR UPDATE
    USING (id = auth.uid());

-- Realtime import logs policies
CREATE POLICY "Users can view their own import logs"
    ON public.realtime_import_logs
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.project_files pf
            WHERE pf.id = realtime_import_logs.project_file_id
            AND (
                pf.uploaded_by = auth.uid() OR
                EXISTS (
                    SELECT 1 FROM public.projects p
                    JOIN public.project_members pm ON p.id = pm.project_id
                    WHERE p.id = pf.project_id
                    AND pm.user_id = auth.uid()
                )
            )
        )
    );

CREATE POLICY "Users can manage their own import logs"
    ON public.realtime_import_logs
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.project_files pf
            WHERE pf.id = realtime_import_logs.project_file_id
            AND pf.uploaded_by = auth.uid()
        )
    );

-- Grant basic permissions to authenticated users
GRANT USAGE ON SCHEMA public TO authenticated;

-- Grant permissions on application tables only
GRANT ALL ON TABLE public.projects TO authenticated;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.project_files TO authenticated;
GRANT ALL ON TABLE public.feature_collections TO authenticated;
GRANT ALL ON TABLE public.layers TO authenticated;
GRANT ALL ON TABLE public.geo_features TO authenticated;
GRANT ALL ON TABLE public.project_members TO authenticated;
GRANT ALL ON TABLE public.realtime_import_logs TO authenticated;
GRANT ALL ON TABLE public.user_settings TO authenticated;
GRANT ALL ON TABLE public.vertical_datums TO authenticated;
GRANT ALL ON TABLE public.feature_terrain_cache TO authenticated;
GRANT ALL ON TABLE public.import_logs TO authenticated;

-- Grant sequence permissions
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Grant function permissions (excluding PostGIS functions)
GRANT EXECUTE ON FUNCTION public.trigger_set_timestamp TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_uploaded_by TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_shapefile_companions TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_project_storage TO authenticated; 