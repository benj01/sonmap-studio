import { useState, useCallback } from 'react';
import { createClient } from 'utils/supabase/client';
import { ProjectFile, FileUploadResult } from '../types';
import { LoaderResult, ImportMetadata } from 'types/geo';
import { COORDINATE_SYSTEMS } from '../../geo-loader/types/coordinates';

interface UseFileActionsProps {
  projectId: string;
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
}

export function useFileActions({ projectId, onSuccess, onError }: UseFileActionsProps) {
  const [isLoading, setIsLoading] = useState(false);
  const supabase = createClient();

  const loadFiles = useCallback(async (): Promise<ProjectFile[]> => {
    setIsLoading(true);
    try {
      // First get all non-imported files
      const { data: sourceFiles, error: sourceError } = await supabase
        .from('project_files')
        .select('*')
        .eq('project_id', projectId)
        .is('is_imported', false)
        .order('uploaded_at', { ascending: false });

      if (sourceError) throw sourceError;

      // Then get all imported files
      const { data: importedFiles, error: importError } = await supabase
        .from('project_files')
        .select('*')
        .eq('project_id', projectId)
        .eq('is_imported', true)
        .order('uploaded_at', { ascending: false });

      if (importError) throw importError;

      // Group imported files by their source file
      const importedBySource = importedFiles?.reduce((acc, file) => {
        if (file.source_file_id) {
          if (!acc[file.source_file_id]) {
            acc[file.source_file_id] = [];
          }
          acc[file.source_file_id].push(file);
        }
        return acc;
      }, {} as Record<string, ProjectFile[]>);

      // Attach imported files to their source files
      return sourceFiles?.map(file => ({
        ...file,
        importedFiles: importedBySource[file.id] || []
      })) || [];
    } catch (error) {
      console.error('Error loading files:', error);
      onError?.('Failed to load files');
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [projectId, supabase, onError]);

  const handleUploadComplete = useCallback(async (uploadedFile: FileUploadResult) => {
    setIsLoading(true);
    try {
      const storagePath = `${projectId}/${uploadedFile.name}`;
      
      const { data: newFile, error } = await supabase
        .from('project_files')
        .insert({
          project_id: projectId,
          name: uploadedFile.name,
          size: uploadedFile.size,
          file_type: uploadedFile.type,
          storage_path: storagePath,
          is_imported: false,
          metadata: uploadedFile.relatedFiles ? {
            relatedFiles: uploadedFile.relatedFiles
          } : null
        })
        .select()
        .single();

      if (error) throw error;

      await refreshProjectStorage();

      onSuccess?.(uploadedFile.relatedFiles
        ? 'Shapefile and related components uploaded successfully'
        : 'File uploaded successfully');

      return newFile;
    } catch (error) {
      console.error('Error uploading file:', error);
      onError?.('Failed to save uploaded file to the database');
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [projectId, supabase, onSuccess, onError]);

  const handleImport = useCallback(async (result: LoaderResult, sourceFile: ProjectFile) => {
    setIsLoading(true);
    try {
      // Check if file was already imported
      const { data: existingImport } = await supabase
        .from('project_files')
        .select('id')
        .eq('source_file_id', sourceFile.id)
        .eq('is_imported', true)
        .single();

      if (existingImport) {
        throw new Error('This file has already been imported. Please delete the existing import first.');
      }

      // Create GeoJSON file from import result
      const geoJsonContent = JSON.stringify({
        type: 'FeatureCollection',
        features: result.features
      });

      // Create a Blob and File from the GeoJSON content
      const blob = new Blob([geoJsonContent], { type: 'application/geo+json' });
      const geoJsonFile = new File([blob], `${sourceFile.name}.geojson`, { type: 'application/geo+json' });

      // Upload GeoJSON file to storage
      const storagePath = `${projectId}/imported/${geoJsonFile.name}`;
      const { error: uploadError } = await supabase.storage
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
      const { data: importedFile, error: dbError } = await supabase
        .from('project_files')
        .insert({
          project_id: projectId,
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

      onSuccess?.('File imported and converted to GeoJSON successfully');
      return importedFile;
    } catch (error) {
      console.error('Import error:', error);
      onError?.(error instanceof Error ? error.message : 'Failed to import and convert file');
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [projectId, supabase, onSuccess, onError]);

  const handleDelete = useCallback(async (fileId: string) => {
    setIsLoading(true);
    try {
      // Get all related imported files
      const { data: importedFiles } = await supabase
        .from('project_files')
        .select('storage_path')
        .eq('source_file_id', fileId);

      // Get the source file's storage path
      const { data: sourceFile } = await supabase
        .from('project_files')
        .select('storage_path')
        .eq('id', fileId)
        .single();

      if (!sourceFile) throw new Error('File not found');

      // Collect all storage paths to delete
      const storagePaths = [
        sourceFile.storage_path.replace(/^projects\//, ''),
        ...(importedFiles || []).map((f: { storage_path: string }) => 
          f.storage_path.replace(/^projects\//, '')
        )
      ];

      // Delete all files from storage
      const { error: storageError } = await supabase.storage
        .from('project-files')
        .remove(storagePaths);

      if (storageError) throw storageError;

      // Delete from database (cascade will handle imported files)
      const { error: dbError } = await supabase
        .from('project_files')
        .delete()
        .eq('id', fileId);

      if (dbError) throw dbError;

      await refreshProjectStorage();
      onSuccess?.('File and related imports deleted successfully');
    } catch (error) {
      console.error('Delete error:', error);
      onError?.(error instanceof Error ? error.message : 'Failed to delete file');
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [projectId, supabase, onSuccess, onError]);

  const refreshProjectStorage = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('storage_used')
        .eq('id', projectId)
        .single();

      if (error) throw error;
      console.log('Updated storage usage:', data.storage_used);
    } catch (error) {
      console.error('Error refreshing storage:', error);
    }
  }, [projectId, supabase]);

  return {
    isLoading,
    loadFiles,
    handleUploadComplete,
    handleImport,
    handleDelete,
    refreshProjectStorage
  };
} 