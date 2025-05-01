-- Enable necessary extensions
-- CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS postgis;
-- CREATE EXTENSION IF NOT EXISTS plv8;
-- CREATE EXTENSION IF NOT EXISTS pg_net;
-- CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Grant usage on extensions schema
-- GRANT USAGE ON SCHEMA extensions TO postgres;
-- GRANT USAGE ON SCHEMA extensions TO authenticated;
-- GRANT USAGE ON SCHEMA extensions TO service_role;
-- GRANT USAGE ON SCHEMA extensions TO anon; -- Add grant for anon role
-- GRANT USAGE ON SCHEMA extensions TO authenticator; -- <<< --- ADD THIS MISSING GRANT

-- Grant select on specific PostGIS table needed by the API
-- Grant to roles that will actually query the API (anon/authenticated)
-- Grant to postgres for admin/studio access
-- Grant to authenticator just in case it helps PostgREST introspection (belt-and-suspenders)
-- GRANT SELECT ON TABLE extensions.spatial_ref_sys TO postgres, anon, authenticated, authenticator;



COMMENT ON SCHEMA public IS 'standard public schema';