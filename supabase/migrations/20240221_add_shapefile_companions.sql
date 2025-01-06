-- Add new columns for shapefile companion files
ALTER TABLE project_files
ADD COLUMN is_shapefile_component BOOLEAN DEFAULT false,
ADD COLUMN main_file_id UUID REFERENCES project_files(id) ON DELETE CASCADE,
ADD COLUMN component_type TEXT CHECK (component_type IN ('shp', 'shx', 'dbf', 'prj'));

-- Add index for component type lookups
CREATE INDEX idx_project_files_component_type ON project_files(component_type) WHERE component_type IS NOT NULL;

-- Add index for faster lookups of shapefile components
CREATE INDEX idx_project_files_main_file ON project_files(main_file_id) WHERE main_file_id IS NOT NULL;

-- Add function to get all companion files for a shapefile
CREATE OR REPLACE FUNCTION get_shapefile_companions(main_file_id UUID)
RETURNS TABLE (
    id UUID,
    name TEXT,
    file_type TEXT,
    storage_path TEXT,
    component_type TEXT,
    uploaded_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        project_files.id,
        project_files.name,
        project_files.file_type,
        project_files.storage_path,
        project_files.component_type,
        project_files.uploaded_at
    FROM project_files
    WHERE project_files.main_file_id = $1
    ORDER BY project_files.component_type;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to delete companion files when main file is deleted
CREATE OR REPLACE FUNCTION delete_shapefile_companions()
RETURNS TRIGGER AS $$
BEGIN
    -- Delete all companion files
    DELETE FROM project_files
    WHERE main_file_id = OLD.id;
    
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_delete_shapefile_companions
    BEFORE DELETE ON project_files
    FOR EACH ROW
    WHEN (OLD.is_shapefile_component = false)
    EXECUTE FUNCTION delete_shapefile_companions();

-- Add function to get all files with their companions
CREATE OR REPLACE FUNCTION get_project_files_with_companions(project_id_param UUID)
RETURNS TABLE (
    id UUID,
    name TEXT,
    file_type TEXT,
    storage_path TEXT,
    size BIGINT,
    uploaded_at TIMESTAMPTZ,
    is_shapefile_component BOOLEAN,
    companion_files JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pf.id,
        pf.name,
        pf.file_type,
        pf.storage_path,
        pf.size,
        pf.uploaded_at,
        pf.is_shapefile_component,
        (
            SELECT jsonb_agg(jsonb_build_object(
                'id', c.id,
                'name', c.name,
                'component_type', c.component_type,
                'storage_path', c.storage_path,
                'size', c.size
            ))
            FROM project_files c
            WHERE c.main_file_id = pf.id
        ) as companion_files
    FROM project_files pf
    WHERE 
        pf.project_id = project_id_param 
        AND pf.main_file_id IS NULL
    ORDER BY pf.uploaded_at DESC;
END;
$$ LANGUAGE plpgsql;
