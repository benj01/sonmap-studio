-- Update function to properly filter out shapefile components from main results
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
        AND pf.is_shapefile_component = false  -- Add this filter to exclude companion files from main results
    ORDER BY pf.uploaded_at DESC;
END;
$$ LANGUAGE plpgsql;
