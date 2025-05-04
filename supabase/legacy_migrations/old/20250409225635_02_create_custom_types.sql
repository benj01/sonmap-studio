-- Custom ENUM types
CREATE TYPE public.project_status AS ENUM (
    'active',
    'archived',
    'deleted'
);

-- Add other custom types (DOMAINs, etc.) here if they exist in the original dump and were missed.