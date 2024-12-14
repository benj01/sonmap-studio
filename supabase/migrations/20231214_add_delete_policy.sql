-- Create DELETE policy for project_files table
CREATE POLICY "Users can delete files from their projects" ON project_files
FOR DELETE
USING (
  auth.uid() IN (
    SELECT user_id
    FROM project_members
    WHERE project_id = project_files.project_id
  )
);
