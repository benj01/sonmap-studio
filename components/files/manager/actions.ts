import { createClient } from 'utils/supabase/client';
import { FileActionsProps, ProjectFile, FileUploadResult } from './types';
import { LoaderResult, ImportMetadata } from 'types/geo';
import { COORDINATE_SYSTEMS } from '../../geo-loader/types/coordinates';

export class FileActions {
  private supabase = createClient();
  private projectId: string;
  private onRefresh: () => Promise<void>;
  private onError: (message: string) => void;
  private onSuccess: (message: string) => void;

  constructor({ projectId, onRefresh, onError, onSuccess }: FileActionsProps) {
    this.projectId = projectId;
    this.onRefresh = onRefresh;
    this.onError = onError;
    this.onSuccess = onSuccess;
  }

  async loadFiles(): Promise<ProjectFile[]> {
    try {
      const { data: allFiles, error } = await this.supabase
        .from('project_files')
        .select('*')
        .eq('project_id', this.projectId)
        .order('uploaded_at', { ascending: false });

      if (error) throw error;
      return allFiles;
    } catch (error) {
      console.error('Error loading files:', error);
      this.onError('Failed to load files');
      throw error;
    }
  }

  async handleUploadComplete(uploadedFile: FileUploadResult) {
    try {
      const storagePath = `${this.projectId}/${uploadedFile.name}`;
      
      const { data: newFile, error } = await this.supabase
        .from('project_files')
        .insert({
          project_id: this.projectId,
          name: uploadedFile.name,
          size: uploadedFile.size,
          file_type: uploadedFile.type,
          storage_path: storagePath,
          metadata: uploadedFile.relatedFiles ? {
            relatedFiles: uploadedFile.relatedFiles
          } : null
        })
        .select()
        .single();

      if (error) throw error;

      await this.refreshProjectStorage();

      this.onSuccess(uploadedFile.relatedFiles
        ? 'Shapefile and related components uploaded successfully'
        : 'File uploaded successfully');

      return newFile;
    } catch (error) {
      console.error('Error uploading file:', error);
      this.onError('Failed to save uploaded file to the database');
      throw error;
    }
  }

  async handleImport(result: LoaderResult, sourceFile: ProjectFile) {
    try {
      // Create GeoJSON file from import result
      const geoJsonContent = JSON.stringify({
        type: 'FeatureCollection',
        features: result.features
      });

      // Create a Blob and File from the GeoJSON content
      const blob = new Blob([geoJsonContent], { type: 'application/geo+json' });
      const geoJsonFile = new File([blob], `${sourceFile.name}.geojson`, { type: 'application/geo+json' });

      // Upload GeoJSON file to storage
      const storagePath = `${this.projectId}/imported/${geoJsonFile.name}`;
      const { error: uploadError } = await this.supabase.storage
        .from('project-files')
        .upload(storagePath, geoJsonFile);

      if (uploadError) throw uploadError;

      // Create import metadata
      const importMetadata: ImportMetadata = {
        sourceFile: {
          id: sourceFile.id,
          name: sourceFile.name
        },
        importedLayers: result.layers.map(layer => ({
          name: layer,
          featureCount: result.features.filter(f => f.properties?.layer === layer).length,
          featureTypes: result.statistics?.featureTypes || {}
        })),
        coordinateSystem: {
          source: result.coordinateSystem || COORDINATE_SYSTEMS.WGS84,
          target: COORDINATE_SYSTEMS.WGS84
        },
        statistics: {
          totalFeatures: result.features.length,
          failedTransformations: result.statistics?.failedTransformations,
          errors: result.statistics?.errors
        },
        importedAt: new Date().toISOString()
      };

      // Save imported file record
      const { data: importedFile, error: dbError } = await this.supabase
        .from('project_files')
        .insert({
          project_id: this.projectId,
          name: geoJsonFile.name,
          size: geoJsonFile.size,
          file_type: 'application/geo+json',
          storage_path: storagePath,
          source_file_id: sourceFile.id,
          is_imported: true,
          import_metadata: importMetadata
        })
        .select()
        .single();

      if (dbError) throw dbError;

      this.onSuccess('File imported and converted to GeoJSON successfully');
      return importedFile;
    } catch (error) {
      console.error('Import error:', error);
      this.onError('Failed to import and convert file');
      throw error;
    }
  }

  async handleDelete(fileId: string) {
    try {
      // Get all related imported files
      const { data: importedFiles } = await this.supabase
        .rpc('get_imported_files', { source_file_id: fileId });

      // Collect all storage paths to delete
      const storagePaths = [
        fileId,
        ...(importedFiles || []).map((f: { storage_path: string }) => 
          f.storage_path.replace(/^projects\//, '')
        )
      ];

      // Delete all files from storage
      const { error: storageError } = await this.supabase.storage
        .from('project-files')
        .remove(storagePaths);

      if (storageError) throw storageError;

      // Delete from database (cascade will handle imported files)
      const { error: dbError } = await this.supabase
        .from('project_files')
        .delete()
        .eq('id', fileId);

      if (dbError) throw dbError;

      await this.refreshProjectStorage();
      this.onSuccess('File and related imports deleted successfully');
    } catch (error) {
      console.error('Delete error:', error);
      this.onError(error instanceof Error ? error.message : 'Failed to delete file');
      // Refresh files list to ensure UI is in sync
      await this.onRefresh();
      throw error;
    }
  }

  private async refreshProjectStorage() {
    try {
      const { data, error } = await this.supabase
        .from('projects')
        .select('storage_used')
        .eq('id', this.projectId)
        .single();

      if (error) throw error;
      console.log('Updated storage usage:', data.storage_used);
    } catch (error) {
      console.error('Error refreshing storage:', error);
    }
  }
}
