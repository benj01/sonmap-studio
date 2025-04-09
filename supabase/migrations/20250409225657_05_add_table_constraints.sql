-- Add remaining Primary Key, Foreign Key, and other constraints using ALTER TABLE

-- Primary Keys not defined inline
ALTER TABLE ONLY public.import_logs
    ADD CONSTRAINT import_logs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.project_members
    ADD CONSTRAINT project_members_pkey PRIMARY KEY (project_id, user_id);

-- Unique Constraints (already added inline where possible)
-- ALTER TABLE ONLY public.profiles ADD CONSTRAINT profiles_username_key UNIQUE (username); -- Already inline
-- ALTER TABLE ONLY public.user_settings ADD CONSTRAINT user_settings_user_id_key UNIQUE (user_id); -- Already inline

-- Set default for import_logs.id using sequence
ALTER TABLE ONLY public.import_logs ALTER COLUMN id SET DEFAULT nextval('public.import_logs_id_seq'::regclass);

-- Foreign Keys

-- profiles -> auth.users
ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- projects -> auth.users (owner_id)
ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- If created_by/updated_by are used and should reference users:
-- ALTER TABLE ONLY public.projects
--    ADD CONSTRAINT projects_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
-- ALTER TABLE ONLY public.projects
--    ADD CONSTRAINT projects_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- project_files -> auth.users (uploaded_by)
ALTER TABLE ONLY public.project_files
    ADD CONSTRAINT project_files_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- project_files -> project_files (Self-referencing FKs)
ALTER TABLE ONLY public.project_files
    ADD CONSTRAINT project_files_main_file_id_fkey FOREIGN KEY (main_file_id) REFERENCES public.project_files(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.project_files
    ADD CONSTRAINT project_files_source_file_id_fkey FOREIGN KEY (source_file_id) REFERENCES public.project_files(id) ON DELETE SET NULL; -- Use SET NULL if source deletion shouldn't cascade

-- project_members -> projects
ALTER TABLE ONLY public.project_members
    ADD CONSTRAINT project_members_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

-- project_members -> auth.users
ALTER TABLE ONLY public.project_members
    ADD CONSTRAINT project_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- realtime_import_logs -> feature_collections
ALTER TABLE ONLY public.realtime_import_logs
    ADD CONSTRAINT realtime_import_logs_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.feature_collections(id) ON DELETE CASCADE;

-- realtime_import_logs -> layers
ALTER TABLE ONLY public.realtime_import_logs
    ADD CONSTRAINT realtime_import_logs_layer_id_fkey FOREIGN KEY (layer_id) REFERENCES public.layers(id) ON DELETE CASCADE;

-- realtime_import_logs -> project_files
ALTER TABLE ONLY public.realtime_import_logs
    ADD CONSTRAINT realtime_import_logs_project_file_id_fkey FOREIGN KEY (project_file_id) REFERENCES public.project_files(id) ON DELETE CASCADE;

-- user_settings -> projects (default_project_id)
ALTER TABLE ONLY public.user_settings
    ADD CONSTRAINT user_settings_default_project_id_fkey FOREIGN KEY (default_project_id) REFERENCES public.projects(id) ON DELETE SET NULL;

-- user_settings -> auth.users
ALTER TABLE ONLY public.user_settings
    ADD CONSTRAINT user_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;