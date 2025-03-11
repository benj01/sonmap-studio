-- Enable RLS for realtime_import_logs
ALTER TABLE realtime_import_logs ENABLE ROW LEVEL SECURITY;

-- Add policies for realtime_import_logs
CREATE POLICY "Users can view import logs for their projects" ON realtime_import_logs
  FOR SELECT USING (
    project_file_id IN (
      SELECT id FROM project_files
      WHERE project_id IN (
        SELECT project_id FROM project_members
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can update import logs for their projects" ON realtime_import_logs
  FOR UPDATE USING (
    project_file_id IN (
      SELECT id FROM project_files
      WHERE project_id IN (
        SELECT project_id FROM project_members
        WHERE user_id = auth.uid()
      )
    )
  ) WITH CHECK (
    project_file_id IN (
      SELECT id FROM project_files
      WHERE project_id IN (
        SELECT project_id FROM project_members
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can insert import logs for their projects" ON realtime_import_logs
  FOR INSERT WITH CHECK (
    project_file_id IN (
      SELECT id FROM project_files
      WHERE project_id IN (
        SELECT project_id FROM project_members
        WHERE user_id = auth.uid()
      )
    )
  );

-- Enable realtime for the table
ALTER PUBLICATION supabase_realtime ADD TABLE realtime_import_logs; 