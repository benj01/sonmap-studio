-- Create triggers to automate actions

-- Trigger on projects table to update 'updated_at'
CREATE TRIGGER update_projects_updated_at
BEFORE UPDATE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at(); -- Use consolidated function

-- Trigger on profiles table (typically handled by Supabase auth trigger, but ensure if needed)
-- CREATE TRIGGER on_auth_user_created
-- AFTER INSERT ON auth.users
-- FOR EACH ROW EXECUTE FUNCTION public.handle_new_user(); -- This needs to be setup in Supabase Auth Hooks usually

-- Trigger on project_files table to set 'uploaded_by' on insert
CREATE TRIGGER set_project_files_uploaded_by
BEFORE INSERT ON public.project_files
FOR EACH ROW EXECUTE FUNCTION public.set_uploaded_by();

-- Trigger on project_files table to update 'updated_at' on update
CREATE TRIGGER update_project_files_updated_at
BEFORE UPDATE ON public.project_files
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at(); -- Use consolidated function

-- Triggers on project_files table to update project storage usage
CREATE TRIGGER update_project_storage_on_insert
AFTER INSERT ON public.project_files
FOR EACH ROW EXECUTE FUNCTION public.update_project_storage();

CREATE TRIGGER update_project_storage_on_delete
AFTER DELETE ON public.project_files
FOR EACH ROW EXECUTE FUNCTION public.update_project_storage();

-- Trigger on project_files to delete companions
CREATE TRIGGER trigger_delete_shapefile_companions
AFTER DELETE ON public.project_files
FOR EACH ROW
WHEN (OLD.is_shapefile_component = false AND OLD.component_type = 'shp') -- Trigger only when deleting the main .shp file
EXECUTE FUNCTION public.delete_shapefile_companions();


-- Trigger on feature_collections table to update 'updated_at'
CREATE TRIGGER update_feature_collections_updated_at
BEFORE UPDATE ON public.feature_collections
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Trigger on layers table to update 'updated_at'
CREATE TRIGGER update_layers_updated_at
BEFORE UPDATE ON public.layers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Trigger on geo_features table to update 'updated_at'
CREATE TRIGGER update_geo_features_updated_at
BEFORE UPDATE ON public.geo_features
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Trigger on user_settings table to update 'updated_at'
CREATE TRIGGER update_user_settings_updated_at
BEFORE UPDATE ON public.user_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at(); -- Use consolidated function

-- Trigger on realtime_import_logs table to update 'updated_at'
CREATE TRIGGER update_realtime_import_logs_updated_at
BEFORE UPDATE ON public.realtime_import_logs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at(); -- Add trigger for this table if needed