-- Define Row Level Security (RLS) policies
-- Prioritize specific policy names and consolidated/updated logic from the dump analysis.

-- Policies for public.projects
-- Policy: Owners can manage their projects, members can view projects they belong to.
CREATE POLICY projects_select_policy ON public.projects
    FOR SELECT TO authenticated USING (
        (owner_id = auth.uid()) -- Owner can view
        OR
        (EXISTS ( SELECT 1 FROM public.project_members pm WHERE pm.project_id = projects.id AND pm.user_id = auth.uid())) -- Member can view
    );

CREATE POLICY projects_insert_policy ON public.projects
    FOR INSERT TO authenticated WITH CHECK ((owner_id = auth.uid()));

-- Policy: Owners or Admins can update projects.
CREATE POLICY projects_update_policy ON public.projects
    FOR UPDATE TO authenticated USING (
        (auth.uid() = owner_id) -- Owner can update
        OR
        (id IN (SELECT pm.project_id FROM public.project_members pm WHERE pm.user_id = auth.uid() AND pm.role = 'admin')) -- Admin can update
    ) WITH CHECK ( -- Check should likely mirror USING clause for updates
        (auth.uid() = owner_id)
        OR
        (id IN (SELECT pm.project_id FROM public.project_members pm WHERE pm.user_id = auth.uid() AND pm.role = 'admin'))
    );


CREATE POLICY projects_delete_policy ON public.projects
    FOR DELETE TO authenticated USING ((owner_id = auth.uid()));


-- Policies for public.profiles
CREATE POLICY profiles_select_policy ON public.profiles
    FOR SELECT TO authenticated USING ((id = auth.uid()));

CREATE POLICY profiles_insert_policy ON public.profiles
    FOR INSERT TO authenticated WITH CHECK ((id = auth.uid()));

CREATE POLICY profiles_update_policy ON public.profiles
    FOR UPDATE TO authenticated USING ((id = auth.uid())) WITH CHECK ((id = auth.uid()));

-- No DELETE policy for profiles by default, usually handled via user deletion cascade.


-- Policies for public.project_files
-- Policy: Members can view files in their projects.
CREATE POLICY project_files_select_policy ON public.project_files
    FOR SELECT TO authenticated USING (
        EXISTS ( SELECT 1 FROM public.project_members pm WHERE pm.project_id = project_files.project_id AND pm.user_id = auth.uid() AND pm.joined_at IS NOT NULL)
        OR
        (EXISTS ( SELECT 1 FROM public.projects p WHERE p.id = project_files.project_id AND p.owner_id = auth.uid())) -- Owner can always view
    );

-- Policy: Members can upload files to projects they are part of.
CREATE POLICY project_files_insert_policy ON public.project_files
    FOR INSERT TO authenticated WITH CHECK (
        EXISTS ( SELECT 1 FROM public.project_members pm WHERE pm.project_id = project_files.project_id AND pm.user_id = auth.uid() AND pm.joined_at IS NOT NULL)
        OR
        (EXISTS ( SELECT 1 FROM public.projects p WHERE p.id = project_files.project_id AND p.owner_id = auth.uid())) -- Owner can upload
    );


-- Policy: Uploader, Owner, or Admin/Editor can update file details (e.g., name, import status).
CREATE POLICY project_files_update_policy ON public.project_files
    FOR UPDATE TO authenticated USING (
        (uploaded_by = auth.uid()) -- Uploader can update
        OR
        (project_id IN (SELECT p.id FROM public.projects p WHERE p.owner_id = auth.uid())) -- Project owner can update
        OR
        (project_id IN (SELECT pm.project_id FROM public.project_members pm WHERE pm.user_id = auth.uid() AND pm.role IN ('admin', 'editor') AND pm.joined_at IS NOT NULL)) -- Project admin/editor can update
    ) WITH CHECK ( -- Check mirrors USING
        (uploaded_by = auth.uid())
        OR
        (project_id IN (SELECT p.id FROM public.projects p WHERE p.owner_id = auth.uid()))
        OR
        (project_id IN (SELECT pm.project_id FROM public.project_members pm WHERE pm.user_id = auth.uid() AND pm.role IN ('admin', 'editor') AND pm.joined_at IS NOT NULL))
    );

-- Policy: Uploader, Owner, or Admin can delete files.
CREATE POLICY project_files_delete_policy ON public.project_files
    FOR DELETE TO authenticated USING (
        (uploaded_by = auth.uid()) -- Uploader can delete
        OR
        (project_id IN (SELECT p.id FROM public.projects p WHERE p.owner_id = auth.uid())) -- Project owner can delete
        OR
        (project_id IN (SELECT pm.project_id FROM public.project_members pm WHERE pm.user_id = auth.uid() AND pm.role = 'admin' AND pm.joined_at IS NOT NULL)) -- Project admin can delete
    );


-- Policies for public.feature_collections
-- Policy: Project members can view collections associated with files in their projects.
CREATE POLICY feature_collections_select_policy ON public.feature_collections
    FOR SELECT TO authenticated USING (
        EXISTS ( SELECT 1 FROM public.project_files pf
                 WHERE pf.id = feature_collections.project_file_id AND (
                    (pf.project_id IN (SELECT p.id FROM public.projects p WHERE p.owner_id = auth.uid())) -- Project owner
                    OR
                    (pf.project_id IN (SELECT pm.project_id FROM public.project_members pm WHERE pm.user_id = auth.uid() AND pm.joined_at IS NOT NULL)) -- Project members
                 )
        )
    );

-- Policy: Users who can update the corresponding project file can insert/update/delete collections.
-- (Simplified - assumes if you can manage the file, you can manage its derived collections)
CREATE POLICY feature_collections_manage_policy ON public.feature_collections
    FOR ALL TO authenticated USING ( -- Applies to INSERT, UPDATE, DELETE
        EXISTS ( SELECT 1 FROM public.project_files pf
                 WHERE pf.id = feature_collections.project_file_id AND (
                    (pf.uploaded_by = auth.uid()) -- Uploader
                    OR
                    (pf.project_id IN (SELECT p.id FROM public.projects p WHERE p.owner_id = auth.uid())) -- Project owner
                    OR
                    (pf.project_id IN (SELECT pm.project_id FROM public.project_members pm WHERE pm.user_id = auth.uid() AND pm.role IN ('admin', 'editor') AND pm.joined_at IS NOT NULL)) -- Project admin/editor
                 )
        )
    ) WITH CHECK ( -- Check mirrors USING
        EXISTS ( SELECT 1 FROM public.project_files pf
                 WHERE pf.id = feature_collections.project_file_id AND (
                    (pf.uploaded_by = auth.uid())
                    OR
                    (pf.project_id IN (SELECT p.id FROM public.projects p WHERE p.owner_id = auth.uid()))
                    OR
                    (pf.project_id IN (SELECT pm.project_id FROM public.project_members pm WHERE pm.user_id = auth.uid() AND pm.role IN ('admin', 'editor') AND pm.joined_at IS NOT NULL))
                 )
        )
    );


-- Policies for public.layers
-- Policy: Project members can view layers within collections they can view.
CREATE POLICY layers_select_policy ON public.layers
    FOR SELECT TO authenticated USING (
        EXISTS ( SELECT 1 FROM public.feature_collections fc
                 JOIN public.project_files pf ON pf.id = fc.project_file_id
                 WHERE fc.id = layers.collection_id AND (
                    (pf.project_id IN (SELECT p.id FROM public.projects p WHERE p.owner_id = auth.uid())) -- Project owner
                    OR
                    (pf.project_id IN (SELECT pm.project_id FROM public.project_members pm WHERE pm.user_id = auth.uid() AND pm.joined_at IS NOT NULL)) -- Project members
                 )
        )
    );

-- Policy: Users who can manage the parent collection can manage layers within it.
CREATE POLICY layers_manage_policy ON public.layers
    FOR ALL TO authenticated USING ( -- Applies to INSERT, UPDATE, DELETE
       EXISTS ( SELECT 1 FROM public.feature_collections fc
                 JOIN public.project_files pf ON pf.id = fc.project_file_id
                 WHERE fc.id = layers.collection_id AND (
                    (pf.uploaded_by = auth.uid()) -- Uploader
                    OR
                    (pf.project_id IN (SELECT p.id FROM public.projects p WHERE p.owner_id = auth.uid())) -- Project owner
                    OR
                    (pf.project_id IN (SELECT pm.project_id FROM public.project_members pm WHERE pm.user_id = auth.uid() AND pm.role IN ('admin', 'editor') AND pm.joined_at IS NOT NULL)) -- Project admin/editor
                 )
        )
    ) WITH CHECK ( -- Check mirrors USING
       EXISTS ( SELECT 1 FROM public.feature_collections fc
                 JOIN public.project_files pf ON pf.id = fc.project_file_id
                 WHERE fc.id = layers.collection_id AND (
                    (pf.uploaded_by = auth.uid())
                    OR
                    (pf.project_id IN (SELECT p.id FROM public.projects p WHERE p.owner_id = auth.uid()))
                    OR
                    (pf.project_id IN (SELECT pm.project_id FROM public.project_members pm WHERE pm.user_id = auth.uid() AND pm.role IN ('admin', 'editor') AND pm.joined_at IS NOT NULL))
                 )
        )
    );


-- Policies for public.geo_features
-- Policy: Project members can view features within layers they can view.
CREATE POLICY geo_features_select_policy ON public.geo_features
    FOR SELECT TO authenticated USING (
        EXISTS ( SELECT 1 FROM public.layers l
                 JOIN public.feature_collections fc ON fc.id = l.collection_id
                 JOIN public.project_files pf ON pf.id = fc.project_file_id
                 WHERE l.id = geo_features.layer_id AND (
                    (pf.project_id IN (SELECT p.id FROM public.projects p WHERE p.owner_id = auth.uid())) -- Project owner
                    OR
                    (pf.project_id IN (SELECT pm.project_id FROM public.project_members pm WHERE pm.user_id = auth.uid() AND pm.joined_at IS NOT NULL)) -- Project members
                 )
        )
    );

-- Policy: Users who can manage the parent layer can manage features within it.
CREATE POLICY geo_features_manage_policy ON public.geo_features
    FOR ALL TO authenticated USING ( -- Applies to INSERT, UPDATE, DELETE
        EXISTS ( SELECT 1 FROM public.layers l
                 JOIN public.feature_collections fc ON fc.id = l.collection_id
                 JOIN public.project_files pf ON pf.id = fc.project_file_id
                 WHERE l.id = geo_features.layer_id AND (
                    (pf.uploaded_by = auth.uid()) -- Uploader
                    OR
                    (pf.project_id IN (SELECT p.id FROM public.projects p WHERE p.owner_id = auth.uid())) -- Project owner
                    OR
                    (pf.project_id IN (SELECT pm.project_id FROM public.project_members pm WHERE pm.user_id = auth.uid() AND pm.role IN ('admin', 'editor') AND pm.joined_at IS NOT NULL)) -- Project admin/editor
                 )
        )
    ) WITH CHECK ( -- Check mirrors USING
        EXISTS ( SELECT 1 FROM public.layers l
                 JOIN public.feature_collections fc ON fc.id = l.collection_id
                 JOIN public.project_files pf ON pf.id = fc.project_file_id
                 WHERE l.id = geo_features.layer_id AND (
                    (pf.uploaded_by = auth.uid())
                    OR
                    (pf.project_id IN (SELECT p.id FROM public.projects p WHERE p.owner_id = auth.uid()))
                    OR
                    (pf.project_id IN (SELECT pm.project_id FROM public.project_members pm WHERE pm.user_id = auth.uid() AND pm.role IN ('admin', 'editor') AND pm.joined_at IS NOT NULL))
                 )
        )
    );


-- Policies for public.project_members (Using specific names)
-- Option 1: Only allow users to see their own membership directly
CREATE POLICY project_members_select_policy ON public.project_members
    FOR SELECT TO authenticated USING (
        (user_id = auth.uid()) -- User can see their own memberships
    );

CREATE POLICY project_members_insert_policy ON public.project_members
    FOR INSERT TO authenticated WITH CHECK (
        EXISTS ( SELECT 1 FROM public.projects p WHERE p.id = project_members.project_id AND p.owner_id = auth.uid()) -- Only owner can insert/invite
    );

CREATE POLICY project_members_update_policy ON public.project_members
    FOR UPDATE TO authenticated USING (
        EXISTS ( SELECT 1 FROM public.projects p WHERE p.id = project_members.project_id AND p.owner_id = auth.uid()) -- Only owner can update roles
    ) WITH CHECK (
        EXISTS ( SELECT 1 FROM public.projects p WHERE p.id = project_members.project_id AND p.owner_id = auth.uid())
    );

CREATE POLICY project_members_delete_policy ON public.project_members
    FOR DELETE TO authenticated USING (
        EXISTS ( SELECT 1 FROM public.projects p WHERE p.id = project_members.project_id AND p.owner_id = auth.uid()) -- Only owner can delete/remove members
        OR
        (user_id = auth.uid()) -- User can remove themselves (leave project) - Added this common case
    );


-- Policies for public.realtime_import_logs
-- Policy: Project members can view logs related to files in their projects.
CREATE POLICY realtime_import_logs_select_policy ON public.realtime_import_logs
    FOR SELECT TO authenticated USING (
        EXISTS ( SELECT 1 FROM public.project_files pf
                 WHERE pf.id = realtime_import_logs.project_file_id AND (
                    (pf.project_id IN (SELECT p.id FROM public.projects p WHERE p.owner_id = auth.uid()))
                    OR
                    (pf.project_id IN (SELECT pm.project_id FROM public.project_members pm WHERE pm.user_id = auth.uid() AND pm.joined_at IS NOT NULL))
                 )
        )
    );

-- Policy: Allow service role full access for inserting/updating logs during processing.
CREATE POLICY realtime_import_logs_service_policy ON public.realtime_import_logs
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Policy: Users (owner/admin) can potentially delete old/failed logs? (Optional)
-- CREATE POLICY realtime_import_logs_delete_policy ON public.realtime_import_logs
--     FOR DELETE TO authenticated USING ( ... check owner/admin role ... );


-- Policies for public.user_settings
CREATE POLICY user_settings_select_policy ON public.user_settings
    FOR SELECT TO authenticated USING ((user_id = auth.uid()));

CREATE POLICY user_settings_insert_policy ON public.user_settings
    FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));

CREATE POLICY user_settings_update_policy ON public.user_settings
    FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

-- No DELETE policy for user_settings by default.