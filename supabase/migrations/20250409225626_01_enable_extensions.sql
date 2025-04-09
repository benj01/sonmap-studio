-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions; -- Correct for postgis
CREATE EXTENSION IF NOT EXISTS plv8; -- Correct for plv8 (must be in pg_catalog)
-- CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions; -- Uncomment if needed

-- Grant usage on extensions schema (Needed for other roles to use functions within)
-- Note: Supabase typically handles default grants, but explicitly granting usage is safe.
GRANT USAGE ON SCHEMA extensions TO postgres;
GRANT USAGE ON SCHEMA extensions TO authenticated;
GRANT USAGE ON SCHEMA extensions TO service_role;

COMMENT ON SCHEMA public IS 'standard public schema';