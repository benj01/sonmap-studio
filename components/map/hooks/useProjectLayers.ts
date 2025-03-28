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

        // First get the main shapefile that has been imported
        const { data: mainFile, error: mainFileError } = await supabase
          .from('project_files')
          .select('*')
          .eq('project_id', projectId)
          .eq('is_imported', true)
          .single();

        if (mainFileError) {
          logger.error('Error fetching main file', { error: mainFileError });
          throw mainFileError;
        }

        if (!mainFile) {
          logger.error('No imported file found for project', { projectId });
          return;
        }

        logger.info('Found main imported file', { 
          fileId: mainFile?.id,
          name: mainFile?.name,
          hasImportMetadata: !!mainFile?.import_metadata,
          collectionId: mainFile?.import_metadata?.collection_id
        });

        if (!mainFile.import_metadata?.collection_id) {
          logger.error('Main file missing collection_id in import_metadata', {
            fileId: mainFile.id,
            importMetadata: mainFile.import_metadata
          });
          return;
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
          .eq('id', mainFile.import_metadata.collection_id)
          .single();

        logger.info('Feature collection query result', {
          collections,
          error: collectionsError,
          collectionId: mainFile.import_metadata.collection_id
        });

        if (collectionsError) {
          logger.error('Error fetching feature collection', { error: collectionsError });
          throw collectionsError;
        }

        if (!collections) {
          logger.error('No feature collection found', { 
            collectionId: mainFile.import_metadata.collection_id,
            mainFile
          });
          return;
        }

        logger.info('Feature collection loaded', { 
          collectionId: collections.id,
          name: collections.name,
          layerCount: collections.layers?.length,
          layers: collections.layers?.map(l => ({ id: l.id, name: l.name, type: l.type }))
        });

        if (!collections.layers?.length) {
          logger.error('Feature collection has no layers', { collectionId: collections.id });
          return;
        }

        // Add each layer to the store
        collections.layers.forEach((layer, index) => {
          logger.info(`Adding layer ${index + 1}/${collections.layers.length} to store`, {
            layerId: layer.id,
            name: layer.name,
            type: layer.type,
            fileId: mainFile.id
          });

          addLayer(layer.id, true, collections.id, {
            name: layer.name,
            type: layer.type,
            properties: layer.properties || {},
            fileId: mainFile.id
          });
        });

        logger.info('Successfully loaded all project layers', {
          projectId,
          layerCount: collections.layers.length
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