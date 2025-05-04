-- Create function to update import progress
CREATE OR REPLACE FUNCTION update_import_progress(
  p_import_log_id uuid,
  p_imported_count integer,
  p_failed_count integer,
  p_collection_id uuid default null,
  p_layer_id uuid default null,
  p_metadata jsonb default null
) RETURNS void AS $$
BEGIN
  UPDATE realtime_import_logs
  SET
    imported_count = p_imported_count,
    failed_count = p_failed_count,
    collection_id = COALESCE(p_collection_id, collection_id),
    layer_id = COALESCE(p_layer_id, layer_id),
    metadata = COALESCE(p_metadata, metadata),
    status = CASE
      WHEN p_imported_count + p_failed_count >= total_features THEN 'completed'
      ELSE 'processing'
    END,
    updated_at = now()
  WHERE id = p_import_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; 