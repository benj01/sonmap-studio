-- supabase/migrations/YYYYMMDDHHMMSS_add_realtime_log_policies.sql

-- Add INSERT policy for realtime_import_logs based on live version
-- Allows authenticated users to insert logs for files in projects they can access
CREATE POLICY "Users can insert import logs for their projects"
ON public.realtime_import_logs
FOR INSERT TO authenticated -- Granting to authenticated is sufficient locally
WITH CHECK (
    (
        project_file_id IN (
            SELECT pf.id
            FROM
                public.project_files pf
                JOIN public.projects p ON pf.project_id = p.id
            WHERE
                (p.owner_id = auth.uid()) -- User owns the project associated with the file
                OR (
                    EXISTS ( -- User is a member of the project associated with the file
                        SELECT 1
                        FROM public.project_members pm
                        WHERE pm.project_id = p.id AND pm.user_id = auth.uid()
                        -- Note: Live policy didn't explicitly check pm.joined_at IS NOT NULL, mirroring that here.
                    )
                )
        )
    )
);

-- Add UPDATE policy for realtime_import_logs based on live version
-- Allows authenticated users to update logs for files in projects they can access
CREATE POLICY "Users can update import logs for their projects"
ON public.realtime_import_logs
FOR UPDATE TO authenticated
USING ( -- Check existing rows based on project access
    (
        project_file_id IN (
            SELECT pf.id
            FROM public.project_files pf JOIN public.projects p ON pf.project_id = p.id
            WHERE (p.owner_id = auth.uid()) OR (EXISTS ( SELECT 1 FROM public.project_members pm WHERE pm.project_id = p.id AND pm.user_id = auth.uid()))
        )
    )
)
WITH CHECK ( -- Check new data based on project access
    (
        project_file_id IN (
            SELECT pf.id
            FROM public.project_files pf JOIN public.projects p ON pf.project_id = p.id
            WHERE (p.owner_id = auth.uid()) OR (EXISTS ( SELECT 1 FROM public.project_members pm WHERE pm.project_id = p.id AND pm.user_id = auth.uid()))
        )
    )
);

-- Add DELETE policy for realtime_import_logs based on live version
-- Allows authenticated users to delete logs for files in projects they can access
CREATE POLICY "Users can delete import logs for their projects"
ON public.realtime_import_logs
FOR DELETE TO authenticated
USING ( -- Check rows to be deleted based on project access
    (
        project_file_id IN (
            SELECT pf.id
            FROM public.project_files pf JOIN public.projects p ON pf.project_id = p.id
            WHERE (p.owner_id = auth.uid()) OR (EXISTS ( SELECT 1 FROM public.project_members pm WHERE pm.project_id = p.id AND pm.user_id = auth.uid()))
        )
    )
);