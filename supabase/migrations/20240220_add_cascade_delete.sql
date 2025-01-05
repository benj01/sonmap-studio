-- First remove the existing foreign key constraint
ALTER TABLE project_files
DROP CONSTRAINT project_files_source_file_id_fkey;

-- Add it back with CASCADE delete
ALTER TABLE project_files
ADD CONSTRAINT project_files_source_file_id_fkey
FOREIGN KEY (source_file_id)
REFERENCES project_files(id)
ON DELETE CASCADE;
