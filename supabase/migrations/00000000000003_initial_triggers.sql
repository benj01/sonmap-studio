-- Create auth trigger for automatic profile creation
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- Create triggers for updated_at columns
CREATE TRIGGER set_timestamp
    BEFORE UPDATE ON public.projects
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_set_timestamp();

CREATE TRIGGER set_timestamp
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_set_timestamp();

CREATE TRIGGER set_timestamp
    BEFORE UPDATE ON public.project_files
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_set_timestamp();

CREATE TRIGGER set_timestamp
    BEFORE UPDATE ON public.feature_collections
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_set_timestamp();

CREATE TRIGGER set_timestamp
    BEFORE UPDATE ON public.vertical_datums
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_set_timestamp();

CREATE TRIGGER set_timestamp
    BEFORE UPDATE ON public.layers
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_set_timestamp();

CREATE TRIGGER set_timestamp
    BEFORE UPDATE ON public.geo_features
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_set_timestamp();

CREATE TRIGGER set_timestamp
    BEFORE UPDATE ON public.realtime_import_logs
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_set_timestamp();

CREATE TRIGGER set_timestamp
    BEFORE UPDATE ON public.user_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_set_timestamp();

-- Create trigger on project_files to set uploaded_by on insert
CREATE TRIGGER set_project_files_uploaded_by
    BEFORE INSERT ON public.project_files
    FOR EACH ROW
    EXECUTE FUNCTION public.set_uploaded_by();

-- Create trigger on project_files to delete companions
CREATE TRIGGER trigger_delete_shapefile_companions
    AFTER DELETE ON public.project_files
    FOR EACH ROW
    WHEN (OLD.is_shapefile_component = false AND OLD.component_type = 'shp') -- Trigger only when deleting the main .shp file
    EXECUTE FUNCTION public.delete_shapefile_companions();

-- Create triggers on project_files to update project storage usage
CREATE TRIGGER update_project_storage_on_insert
    AFTER INSERT ON public.project_files
    FOR EACH ROW
    EXECUTE FUNCTION public.update_project_storage();

CREATE TRIGGER update_project_storage_on_delete
    AFTER DELETE ON public.project_files
    FOR EACH ROW
    EXECUTE FUNCTION public.update_project_storage(); 