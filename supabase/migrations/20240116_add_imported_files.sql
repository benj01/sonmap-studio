-- Add new columns to project_files table
ALTER TABLE project_files
ADD COLUMN source_file_id UUID REFERENCES project_files(id),
ADD COLUMN is_imported BOOLEAN DEFAULT false,
ADD COLUMN import_metadata JSONB;

-- Add index for faster lookups of imported files
CREATE INDEX idx_project_files_source_file ON project_files(source_file_id) WHERE source_file_id IS NOT NULL;

-- Add index for filtering imported files
CREATE INDEX idx_project_files_is_imported ON project_files(is_imported) WHERE is_imported = true;

-- Add function to get all related imported files
CREATE OR REPLACE FUNCTION get_imported_files(source_file_id UUID)
RETURNS TABLE (
    id UUID,
    name TEXT,
    file_type TEXT,
    storage_path TEXT,
    import_metadata JSONB,
    uploaded_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        project_files.id,
        project_files.name,
        project_files.file_type,
        project_files.storage_path,
        project_files.import_metadata,
        project_files.uploaded_at
    FROM project_files
    WHERE project_files.source_file_id = $1
    ORDER BY project_files.uploaded_at DESC;
END;
$$ LANGUAGE plpgsql;
