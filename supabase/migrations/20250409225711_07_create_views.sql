-- Create views for simplified data access

CREATE VIEW public.recent_import_logs AS
 SELECT import_logs.id,
    import_logs."timestamp",
    import_logs.level,
    import_logs.message,
    import_logs.details
   FROM public.import_logs
  WHERE (import_logs."timestamp" > (CURRENT_TIMESTAMP - '00:05:00'::interval)) -- Last 5 minutes
  ORDER BY import_logs."timestamp" DESC;

COMMENT ON VIEW public.recent_import_logs IS 'Provides a view of import log entries from the last 5 minutes.';

-- Add other views here if needed