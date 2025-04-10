import { useState, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import { ProjectFile, FileUploadResult } from '../types';
import { LogManager } from '@/core/logging/log-manager';
import { useFileEventStore } from '@/store/fileEventStore';
import { useLayers } from '@/store/layers/hooks';

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
  const emitFileEvent = useFileEventStore(state => state.emitFileEvent);
  const { handleFileDeleted } = useLayers();

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
      const mainFiles = allFiles?.filter((file: ProjectFile) => !file.main_file_id) || [];
      const companionFiles = allFiles?.filter((file: ProjectFile) => file.main_file_id) || [];

      // Create a map of companion files by main file ID
      const companionsByMainFile = companionFiles.reduce((acc: Record<string, ProjectFile[]>, file: ProjectFile) => {
        if (file.main_file_id) {
          if (!acc[file.main_file_id]) {
            acc[file.main_file_id] = [];
          }
          acc[file.main_file_id].push(file);
        }
        return acc;
      }, {});

      // Attach companion files to their main files
      const filesWithCompanions = mainFiles.map((file: ProjectFile) => ({
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
        // Get current user
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError) throw userError;
        if (!user) throw new Error('No authenticated user');

        // Update storage path to include user ID
        const storagePath = `${user.id}/${projectId}/${uploadedFile.name}`;
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
            storage_path: `${user.id}/${projectId}/${file.name}`,
            is_imported: false,
            is_shapefile_component: isShapefile,
            main_file_id: mainFile.id,
            component_type: ext.substring(1)
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
  }, [projectId, onSuccess, onError, refreshProjectStorage]);

  /**
   * @deprecated This function is deprecated and should not be used. 
   * Use the streaming import flow in GeoImportDialog instead.
   * This remains only for reference on how to update file relationships after import.
   */
  const legacyHandleImport = useCallback(async (result: any, sourceFile: ProjectFile) => {
    setIsLoading(true);
    try {
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error('No authenticated user');

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

      // Upload GeoJSON file to storage with user ID in path
      const storagePath = `${user.id}/${projectId}/imported/${geoJsonFile.name}`;
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

      // Update source file to mark it as imported
      const { error: updateError } = await supabase
        .from('project_files')
        .update({ is_imported: true })
        .eq('id', sourceFile.id);

      if (updateError) {
        logger.warn('Failed to update source file import status', updateError);
      }

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

  const handleDelete = useCallback(async (fileId: string, deleteRelated: boolean = true) => {
    try {
      // Note: deleteRelated parameter is kept for backward compatibility but is ignored
      // Database triggers and constraints will always delete related files
      logger.info('Starting file deletion', { fileId });
      const supabase = createClient();
  
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error('No authenticated user');
  
      // First, fetch the file and its feature collections
      const { data: fileToDelete, error: fetchError } = await supabase
        .from('project_files')
        .select(`
          *,
          feature_collections (
            id,
            layers (id)
          )
        `)
        .eq('id', fileId)
        .single();
  
      if (fetchError) throw fetchError;
      if (!fileToDelete) throw new Error('File not found');
  
      logger.info('File fetched', {
        file: {
          id: fileToDelete.id,
          name: fileToDelete.name,
          isImported: fileToDelete.is_imported,
          sourceFileId: fileToDelete.source_file_id,
          featureCollections: fileToDelete.feature_collections
        }
      });
  
      // Initialize arrays for deletion
      let filesToDelete: { id: string; storage_path: string }[] = [{
        id: fileToDelete.id,
        storage_path: fileToDelete.storage_path
      }];

      // Add companion files if this is a main file
      if (!fileToDelete.main_file_id && fileToDelete.metadata?.relatedFiles) {
        const companions = Object.entries(fileToDelete.metadata.relatedFiles) as [string, CompanionFile][];
        for (const [_, companion] of companions) {
          // Get companion file path using the same pattern as the main file
          const companionPath = fileToDelete.storage_path.replace(
            fileToDelete.name,
            companion.name
          );
          filesToDelete.push({
            id: fileToDelete.id, // We use the same ID since companions share the main file's ID
            storage_path: companionPath
          });
        }
        logger.info('Added companion files for deletion', {
          mainFile: fileToDelete.name,
          companions: companions.map(([_, c]: [string, CompanionFile]) => c.name)
        });
      }

      // Note: Due to database triggers and constraints, related files will be deleted automatically
      // The code below is kept for logging purposes to show what will be deleted

      // If this is an imported file and has a source file, log that it will be deleted
      if (fileToDelete.is_imported && fileToDelete.source_file_id) {
        const { data: sourceFile, error: sourceError } = await supabase
          .from('project_files')
          .select('id, name, storage_path')
          .eq('id', fileToDelete.source_file_id)
          .single();

        if (sourceError) {
          logger.warn('Failed to fetch source file', sourceError);
        } else if (sourceFile) {
          logger.info('Source file will be deleted due to database constraints', { 
            sourceFileId: sourceFile.id,
            sourceFileName: sourceFile.name
          });
        }
      }

      // If this is a source file, log that imported files will be deleted
      if (!fileToDelete.is_imported) {
        const { data: importedFiles, error: importedError } = await supabase
          .from('project_files')
          .select('id, name, storage_path')
          .eq('source_file_id', fileToDelete.id)
          .eq('is_imported', true);

        if (importedError) {
          logger.warn('Failed to fetch imported files', importedError);
        } else if (importedFiles?.length > 0) {
          logger.info('Imported files will be deleted due to database constraints', { 
            count: importedFiles.length,
            files: importedFiles.map(f => f.name)
          });
        }
      }

      // If this is an imported file, clean up PostGIS data
      if (fileToDelete.is_imported && fileToDelete.feature_collections) {
        for (const collection of fileToDelete.feature_collections) {
          if (collection.layers) {
            // First, delete any import logs that reference these layers or collections
            logger.info('Deleting import logs for collection', { collectionId: collection.id });
            const { error: importLogsError } = await supabase
              .from('realtime_import_logs')
              .delete()
              .or(`collection_id.eq.${collection.id},layer_id.in.(${collection.layers.map((l: { id: string }) => l.id).join(',')})`);

            if (importLogsError) {
              logger.warn('Failed to delete import logs', importLogsError);
            }

            // Delete geo_features for each layer
            for (const layer of collection.layers) {
              logger.info('Deleting geo_features for layer', { layerId: layer.id });
              const { error: featuresError } = await supabase
                .from('geo_features')
                .delete()
                .eq('layer_id', layer.id);

              if (featuresError) {
                logger.warn('Failed to delete geo_features', featuresError);
              }
            }

            // Delete layers
            logger.info('Deleting layers for collection', { collectionId: collection.id });
            const { error: layersError } = await supabase
              .from('layers')
              .delete()
              .eq('collection_id', collection.id);

            if (layersError) {
              logger.warn('Failed to delete layers', layersError);
            }
          }

          // Delete feature collection
          logger.info('Deleting feature collection', { collectionId: collection.id });
          const { error: collectionError } = await supabase
            .from('feature_collections')
            .delete()
            .eq('id', collection.id);

          if (collectionError) {
            logger.warn('Failed to delete feature collection', collectionError);
          }
        }
      }
  
      // Delete files from storage
      for (const file of filesToDelete) {
        logger.info('Deleting from storage', { 
          fileId: file.id,
          storagePath: file.storage_path 
        });
  
        try {
          const { error: storageError } = await supabase.storage
            .from('project-files')
            .remove([file.storage_path]);
        
          if (storageError) {
            logger.warn('Storage deletion failed', { 
              error: storageError,
              fileId: file.id,
              storagePath: file.storage_path
            });
          } else {
            logger.info('Successfully deleted from storage', {
              fileId: file.id,
              storagePath: file.storage_path
            });
          }
        } catch (e) {
          logger.warn('Storage deletion attempt failed', { 
            error: e,
            fileId: file.id,
            storagePath: file.storage_path
          });
        }
      }
  
      // Delete from project_files table
      const fileIds = [...new Set(filesToDelete.map((f: { id: string }) => f.id))]; // Remove duplicates since companions share the same ID
      logger.info('Deleting from project_files', { fileIds });
      
      const { error: dbError } = await supabase
        .from('project_files')
        .delete()
        .in('id', fileIds);
  
      if (dbError) {
        logger.error('Database deletion failed', {
          error: dbError,
          fileIds
        });
        throw dbError;
      }
  
      logger.info('File deletion completed successfully', {
        deletedFiles: fileIds,
        deletedPaths: filesToDelete.map((f: { storage_path: string }) => f.storage_path)
      });
  
      // Refresh storage usage after successful deletion
      await refreshProjectStorage();

      // Notify layer store about the deletion
      handleFileDeleted(fileId);

      // Emit file deletion event
      emitFileEvent({
        type: 'delete',
        fileId: fileToDelete.id
      });

      onSuccess?.();
    } catch (error) {
      logger.error('File deletion failed', error);
      throw error;
    }
  }, [projectId, refreshProjectStorage, emitFileEvent, handleFileDeleted]);

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

  return {
    isLoading,
    loadFiles,
    handleUploadComplete,
    handleImport: legacyHandleImport,
    handleDelete,
    handleDownload,
    refreshProjectStorage,
    legacyHandleImport,
  };
} 