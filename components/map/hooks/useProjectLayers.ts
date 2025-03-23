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
        logger.debug('Loading project layers', { projectId });

        // First get the main shapefile that has been imported
        const { data: mainFile, error: mainFileError } = await supabase
          .from('project_files')
          .select('*')
          .eq('project_id', projectId)
          .eq('is_imported', true)
          .single();

        if (mainFileError) {
          throw mainFileError;
        }

        logger.debug('Found main imported file', { 
          fileId: mainFile.id,
          name: mainFile.name,
          importMetadata: mainFile.import_metadata
        });

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

        if (collectionsError) {
          throw collectionsError;
        }

        logger.debug('Feature collection loaded', { 
          collectionId: collections.id,
          name: collections.name,
          layerCount: collections.layers?.length
        });

        // Add each layer to the store
        collections.layers?.forEach(layer => {
          logger.debug('Adding layer to store', {
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

      } catch (error) {
        logger.error('Error loading project layers', error);
      }
    }

    if (projectId) {
      loadProjectLayers();
    }

    return () => {
      // Cleanup if needed
    };
  }, [projectId, addLayer]);

  return {
    // Return any necessary values or functions
  };
} 