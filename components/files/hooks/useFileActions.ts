import { useState, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import { ProjectFile, FileUploadResult } from '../types';
import { LogManager } from '@/core/logging/log-manager';

interface UseFileActionsProps {
  projectId: string;
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
}

interface CompanionFile {
  name: string;
  size: number;
}

const SOURCE = 'FileActions';
const logManager = LogManager.getInstance();

const logger = {
  info: (message: string, data?: any) => {
    logManager.info(SOURCE, message, data);
  },
  warn: (message: string, error?: any) => {
    logManager.warn(SOURCE, message, error);
  },
  error: (message: string, error?: any) => {
    logManager.error(SOURCE, message, error);
  }
};

export function useFileActions({ projectId, onSuccess, onError }: UseFileActionsProps) {
  const [isLoading, setIsLoading] = useState(false);
  const supabase = createClient();

  const loadFiles = useCallback(async (): Promise<ProjectFile[]> => {
    setIsLoading(true);
    try {
      // Get all files for the project
      const { data: allFiles, error: filesError } = await supabase
        .from('project_files')
        .select('*')
        .eq('project_id', projectId)
        .order('uploaded_at', { ascending: false });

      if (filesError) throw filesError;

      // Separate files into main files and their companions
      const mainFiles = allFiles?.filter(file => !file.main_file_id) || [];
      const companionFiles = allFiles?.filter(file => file.main_file_id) || [];

      // Create a map of companion files by main file ID
      const companionsByMainFile = companionFiles.reduce((acc, file) => {
        if (file.main_file_id) {
          if (!acc[file.main_file_id]) {
            acc[file.main_file_id] = [];
          }
          acc[file.main_file_id].push(file);
        }
        return acc;
      }, {} as Record<string, ProjectFile[]>);

      // Attach companion files to their main files
      const filesWithCompanions = mainFiles.map(file => ({
        ...file,
        companions: companionsByMainFile[file.id] || []
      }));

      logger.info('Files loaded', {
        totalFiles: allFiles?.length,
        mainFiles: mainFiles.length,
        companionFiles: companionFiles.length
      });

      return filesWithCompanions;
    } catch (error) {
      logger.error('Failed to load files', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  const handleUploadComplete = useCallback(async (uploadedFile: FileUploadResult) => {
    setIsLoading(true);
    const supabase = createClient();
    
    try {
      logger.info('Starting file upload transaction', {
        fileName: uploadedFile.name,
        fileType: uploadedFile.type,
        fileSize: uploadedFile.size,
        hasRelatedFiles: !!uploadedFile.relatedFiles
      });

      // Start a transaction
      const { error: txError } = await supabase.rpc('begin_transaction');
      if (txError) {
        logger.error('Failed to start transaction', txError);
        throw txError;
      }
      logger.info('Transaction started successfully');

      try {
        const storagePath = `${projectId}/${uploadedFile.name}`;
        const fileExt = uploadedFile.name.toLowerCase();
        const isShapefile = fileExt.endsWith('.shp');
        const isGeoJson = fileExt.endsWith('.geojson');
        
        logger.info('Inserting main file record', {
          fileName: uploadedFile.name,
          storagePath,
          isShapefile,
          isGeoJson
        });

        // Insert main file record
        const { data: mainFile, error: mainError } = await supabase
          .from('project_files')
          .insert({
            project_id: projectId,
            name: uploadedFile.name,
            size: uploadedFile.size,
            file_type: uploadedFile.type,
            storage_path: storagePath,
            is_imported: false,
            is_shapefile_component: false,
            metadata: uploadedFile.relatedFiles ? {
              relatedFiles: uploadedFile.relatedFiles
            } : null
          })
          .select()
          .single();

        if (mainError) {
          logger.error('Failed to insert main file record', {
            error: mainError,
            fileName: uploadedFile.name
          });
          throw mainError;
        }
        logger.info('Main file record inserted successfully', {
          fileId: mainFile.id,
          fileName: mainFile.name
        });

        // Handle companion files for both Shapefiles and GeoJSON
        if (uploadedFile.relatedFiles && (isShapefile || isGeoJson)) {
          logger.info('Processing companion files', {
            mainFileId: mainFile.id,
            fileType: isShapefile ? 'Shapefile' : 'GeoJSON',
            companionCount: Object.keys(uploadedFile.relatedFiles).length
          });

          const companionInserts = Object.entries(uploadedFile.relatedFiles).map(([ext, file]) => ({
            project_id: projectId,
            name: file.name,
            size: file.size,
            file_type: ext === '.qmd' ? 'application/xml' : 'application/octet-stream',
            storage_path: `${projectId}/${file.name}`,
            is_imported: false,
            is_shapefile_component: isShapefile,
            main_file_id: mainFile.id,
            component_type: ext.substring(1) // Set component_type for all companion files
          }));

          const { error: companionError } = await supabase
            .from('project_files')
            .insert(companionInserts);

          if (companionError) {
            logger.error('Failed to insert companion files', {
              error: companionError,
              mainFileId: mainFile.id,
              companions: companionInserts.map(c => c.name)
            });
            throw companionError;
          }
          logger.info('Companion files inserted successfully', {
            mainFileId: mainFile.id,
            count: companionInserts.length,
            companions: companionInserts.map(c => c.name)
          });
        }

        logger.info('Committing transaction');
        // Commit transaction
        const { error: commitError } = await supabase.rpc('commit_transaction');
        if (commitError) {
          logger.error('Failed to commit transaction', commitError);
          throw commitError;
        }
        logger.info('Transaction committed successfully');

        await refreshProjectStorage();

        onSuccess?.(uploadedFile.relatedFiles
          ? `${isShapefile ? 'Shapefile' : 'GeoJSON'} and related components uploaded successfully`
          : 'File uploaded successfully');

        return mainFile;
      } catch (error) {
        // Rollback on any error
        logger.warn('Error during transaction, rolling back', error);
        const { error: rollbackError } = await supabase.rpc('rollback_transaction');
        if (rollbackError) {
          logger.error('Failed to rollback transaction', rollbackError);
        } else {
          logger.info('Transaction rolled back successfully');
        }
        throw error;
      }
    } catch (error) {
      logger.error('Error uploading file', {
        error,
        fileName: uploadedFile.name,
        stack: error instanceof Error ? error.stack : undefined
      });
      onError?.('Failed to save uploaded file to the database');
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [projectId, onSuccess, onError]);

  const handleImport = useCallback(async (result: any, sourceFile: ProjectFile) => {
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
      const importMetadata = {
        sourceFile: {
          id: sourceFile.id,
          name: sourceFile.name
        },
        importedLayers: result.layers?.map((layer: string) => ({
          name: layer,
          featureCount: result.features.filter((f: any) => f.properties?.layer === layer).length,
          featureTypes: result.statistics?.featureTypes || {}
        })) || [],
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
          metadata: importMetadata
        })
        .select()
        .single();

      if (dbError) throw dbError;

      onSuccess?.('File imported and converted to GeoJSON successfully');
      return importedFile;
    } catch (error) {
      logger.error('Import error', error);
      onError?.(error instanceof Error ? error.message : 'Failed to import and convert file');
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [projectId, supabase, onSuccess, onError]);

  const handleDelete = useCallback(async (fileId: string) => {
    setIsLoading(true);
    try {
      // Start a transaction
      const { error: txError } = await supabase.rpc('begin_transaction');
      if (txError) throw txError;

      try {
        // Get all related files (main file and companions)
        const { data: fileToDelete, error: mainFileError } = await supabase
          .from('project_files')
          .select('*')
          .eq('id', fileId)
          .single();

        if (mainFileError) throw mainFileError;
        if (!fileToDelete) throw new Error('File not found');

        logger.info('Main file to delete', {
          id: fileToDelete.id,
          name: fileToDelete.name,
          project_id: fileToDelete.project_id,
          storage_path: fileToDelete.storage_path
        });

        // Get companion files if this is a main file
        const { data: companionFiles, error: companionError } = await supabase
          .from('project_files')
          .select('*')
          .eq('main_file_id', fileId);

        if (companionError) throw companionError;

        logger.info('Companion files', companionFiles?.map((f: ProjectFile) => ({
          id: f.id,
          name: f.name,
          project_id: f.project_id,
          storage_path: f.storage_path
        })));

        // First, let's try to list files in the bucket to see what's actually there
        const { data: bucketFiles, error: listError } = await supabase.storage
          .from('project-files')
          .list(fileToDelete.project_id);

        if (listError) {
          logger.error('Error listing bucket files', listError);
        } else {
          logger.info('Files in bucket', bucketFiles);
        }

        // Use the storage_path directly from the database records
        const storagePaths = [
          fileToDelete.storage_path,
          ...(companionFiles || []).map((f: ProjectFile) => f.storage_path)
        ];

        logger.info('Attempting to delete storage paths', storagePaths);

        // Delete from storage first
        const { error: storageError } = await supabase.storage
          .from('project-files')
          .remove(storagePaths);
        
        if (storageError) {
          logger.error('Failed to delete files from storage', storageError);
          throw storageError;
        }

        logger.info('Storage deletion completed successfully');

        // Delete from database (cascade will handle companion files)
        const { error: dbError } = await supabase
          .from('project_files')
          .delete()
          .eq('id', fileId);

        if (dbError) throw dbError;

        logger.info('Database deletion completed successfully');

        // Commit transaction
        const { error: commitError } = await supabase.rpc('commit_transaction');
        if (commitError) throw commitError;

        await refreshProjectStorage();
        onSuccess?.('File and related components deleted successfully');
      } catch (error) {
        // Rollback on any error
        await supabase.rpc('rollback_transaction');
        throw error;
      }
    } catch (error) {
      logger.error('Delete error', error);
      onError?.(error instanceof Error ? error.message : 'Failed to delete file');
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [projectId, supabase, onSuccess, onError]);

  const handleDownload = useCallback(async (fileId: string) => {
    setIsLoading(true);
    try {
      // Get file info from database
      const { data: file, error: dbError } = await supabase
        .from('project_files')
        .select('*')
        .eq('id', fileId)
        .single();

      if (dbError) throw dbError;
      if (!file) throw new Error('File not found');

      // Get download URL
      const { data: urlData, error: urlError } = await supabase.storage
        .from('project-files')
        .createSignedUrl(file.storage_path, 60); // URL valid for 60 seconds

      if (urlError) throw urlError;

      // If this is a shapefile, also get companion file URLs
      const companionUrls: Record<string, string> = {};
      if (file.metadata?.relatedFiles) {
        const companions = Object.entries(file.metadata.relatedFiles) as [string, CompanionFile][];
        for (const [ext, companionFile] of companions) {
          const companionPath = `${projectId}/${companionFile.name}`;
          const { data: companionUrlData, error: companionError } = await supabase.storage
            .from('project-files')
            .createSignedUrl(companionPath, 60);

          if (companionError) {
            logger.error(`Failed to get URL for companion file ${ext}`, companionError);
            continue;
          }

          if (companionUrlData) {
            companionUrls[ext] = companionUrlData.signedUrl;
          }
        }
      }

      // Start downloads
      const downloadFile = async (url: string, filename: string) => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to download ${filename}`);
        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(downloadUrl);
      };

      // Download main file
      await downloadFile(urlData.signedUrl, file.name);

      // Download companion files
      for (const [ext, url] of Object.entries(companionUrls)) {
        const companionName = file.metadata?.relatedFiles[ext]?.name;
        if (companionName) {
          await downloadFile(url, companionName);
        }
      }

      onSuccess?.('Files downloaded successfully');
    } catch (error) {
      logger.error('Download error', error);
      onError?.(error instanceof Error ? error.message : 'Failed to download file');
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
      logger.info('Updated storage usage', data.storage_used);
    } catch (error) {
      logger.error('Error refreshing storage', error);
    }
  }, [projectId, supabase]);

  return {
    isLoading,
    loadFiles,
    handleUploadComplete,
    handleImport,
    handleDelete,
    handleDownload,
    refreshProjectStorage
  };
} 