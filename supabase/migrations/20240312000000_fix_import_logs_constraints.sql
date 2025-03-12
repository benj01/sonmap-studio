-- Add delete policy for realtime_import_logs
CREATE POLICY "Users can delete import logs for their projects" ON realtime_import_logs
  FOR DELETE USING (
    project_file_id IN (
      SELECT id FROM project_files
      WHERE project_id IN (
        SELECT project_id FROM project_members
        WHERE user_id = auth.uid()
      )
    )
  );

-- First, check if the table exists
DO $$
BEGIN
  -- Check if the realtime_import_logs table exists
  IF EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'realtime_import_logs'
  ) THEN
    -- Drop existing foreign key constraints if they exist
    IF EXISTS (
      SELECT FROM information_schema.table_constraints
      WHERE constraint_schema = 'public'
      AND table_name = 'realtime_import_logs'
      AND constraint_name = 'realtime_import_logs_collection_id_fkey'
    ) THEN
      ALTER TABLE realtime_import_logs DROP CONSTRAINT realtime_import_logs_collection_id_fkey;
    END IF;

    IF EXISTS (
      SELECT FROM information_schema.table_constraints
      WHERE constraint_schema = 'public'
      AND table_name = 'realtime_import_logs'
      AND constraint_name = 'realtime_import_logs_layer_id_fkey'
    ) THEN
      ALTER TABLE realtime_import_logs DROP CONSTRAINT realtime_import_logs_layer_id_fkey;
    END IF;

    -- Add new foreign key constraints with ON DELETE CASCADE
    ALTER TABLE realtime_import_logs 
      ADD CONSTRAINT realtime_import_logs_collection_id_fkey 
      FOREIGN KEY (collection_id) 
      REFERENCES feature_collections(id) 
      ON DELETE CASCADE;

    ALTER TABLE realtime_import_logs 
      ADD CONSTRAINT realtime_import_logs_layer_id_fkey 
      FOREIGN KEY (layer_id) 
      REFERENCES layers(id) 
      ON DELETE CASCADE;

    -- Make sure project_file_id has ON DELETE CASCADE
    IF EXISTS (
      SELECT FROM information_schema.table_constraints
      WHERE constraint_schema = 'public'
      AND table_name = 'realtime_import_logs'
      AND constraint_name = 'realtime_import_logs_project_file_id_fkey'
    ) THEN
      ALTER TABLE realtime_import_logs DROP CONSTRAINT realtime_import_logs_project_file_id_fkey;
    END IF;

    ALTER TABLE realtime_import_logs 
      ADD CONSTRAINT realtime_import_logs_project_file_id_fkey 
      FOREIGN KEY (project_file_id) 
      REFERENCES project_files(id) 
      ON DELETE CASCADE;
  END IF;
END $$; 