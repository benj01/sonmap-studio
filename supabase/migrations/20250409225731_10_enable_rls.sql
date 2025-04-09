-- Enable Row Level Security (RLS) on tables that require it

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.layers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geo_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.realtime_import_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- Example call to enable RLS on PostGIS tables (use cautiously)
-- SELECT public.enable_rls_on_spatial_ref_sys();

-- Note: import_logs does not have RLS enabled by default, assuming logs might be accessed by service role mainly. Enable if needed.
-- ALTER TABLE public.import_logs ENABLE ROW LEVEL SECURITY;