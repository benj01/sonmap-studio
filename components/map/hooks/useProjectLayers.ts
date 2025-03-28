'use client';

import { useEffect } from 'react';
import createClient from '@/utils/supabase/client';
import { useLayerStore } from '@/store/layers/layerStore';
import { useMapInstanceStore } from '@/store/map/mapInstanceStore';
import { LogManager } from '@/core/logging/log-manager';

const SOURCE = 'useProjectLayers';
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
  },
  debug: (message: string, data?: any) => {
    logManager.debug(SOURCE, message, data);
  }
};

export function useProjectLayers(projectId: string) {
  const supabase = createClient();
  const { addLayer } = useLayerStore();
  const mapboxInstance = useMapInstanceStore(state => state.mapInstances.mapbox.instance);

  useEffect(() => {
    async function loadProjectLayers() {
      try {
        logger.info('Starting to load project layers', { projectId });

        // Get all imported files for the project
        const { data: importedFiles, error: filesError } = await supabase
          .from('project_files')
          .select('*')
          .eq('project_id', projectId)
          .eq('is_imported', true)
          .not('import_metadata', 'is', null);  // Ensure it has import metadata

        if (filesError) {
          logger.error('Error fetching imported files', { error: filesError });
          throw filesError;
        }

        if (!importedFiles?.length) {
          logger.error('No imported files found for project', { projectId });
          return;
        }

        logger.info('Found imported files', { 
          count: importedFiles.length,
          files: importedFiles.map(f => ({
            id: f.id,
            name: f.name,
            hasImportMetadata: !!f.import_metadata,
            collectionId: f.import_metadata?.collection_id
          }))
        });

        // Process each imported file
        for (const importedFile of importedFiles) {
          if (!importedFile.import_metadata?.collection_id) {
            logger.warn('File missing collection_id in import_metadata', {
              fileId: importedFile.id,
              importMetadata: importedFile.import_metadata
            });
            continue;
          }

          // Get the feature collection and its layers
          const { data: collections, error: collectionsError } = await supabase
            .from('feature_collections')
            .select(`
              id,
              name,
              layers (
                id,
                name,
                type,
                properties
              )
            `)
            .eq('id', importedFile.import_metadata.collection_id)
            .single();

          if (collectionsError) {
            logger.error('Error fetching feature collection', { 
              error: collectionsError,
              fileId: importedFile.id 
            });
            continue;
          }

          if (!collections || !collections.layers?.length) {
            logger.warn('No layers found in feature collection', { 
              fileId: importedFile.id,
              collectionId: importedFile.import_metadata.collection_id
            });
            continue;
          }

          logger.info('Feature collection loaded', { 
            fileId: importedFile.id,
            collectionId: collections.id,
            name: collections.name,
            layerCount: collections.layers.length,
            layers: collections.layers.map(l => ({ id: l.id, name: l.name, type: l.type }))
          });

          // Add each layer to the store
          collections.layers.forEach((layer, index) => {
            logger.info(`Adding layer ${index + 1}/${collections.layers.length} to store`, {
              layerId: layer.id,
              name: layer.name,
              type: layer.type,
              fileId: importedFile.id
            });

            addLayer(
              layer.id,
              true, // initially visible
              layer.id, // use layer id as source id
              {
                name: layer.name,
                type: layer.type,
                fileId: importedFile.id,
                properties: layer.properties || {}
              }
            );

            // Update layer status to complete and explicitly clear any errors
            const store = useLayerStore.getState();
            store.updateLayerStatus(layer.id, 'complete', undefined);
          });
        }

        logger.info('Successfully loaded all project layers', {
          projectId,
          fileCount: importedFiles.length
        });

      } catch (error) {
        logger.error('Error loading project layers', { 
          error: error instanceof Error ? error.message : error,
          stack: error instanceof Error ? error.stack : undefined,
          projectId 
        });
      }
    }

    if (projectId) {
      logger.info('Project ID provided, starting layer load', { projectId });
      loadProjectLayers();
    } else {
      logger.error('No project ID provided, skipping layer load');
    }

    return () => {
      logger.info('Cleaning up project layers', { projectId });
      // TODO: Add cleanup logic to remove layers when project changes
    };
  }, [projectId, addLayer]);

  return {
    // Return any necessary values or functions
  };
} 