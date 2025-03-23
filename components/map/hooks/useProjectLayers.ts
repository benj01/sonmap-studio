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

        // Get all feature collections for this project's files
        const { data: collections, error: collectionsError } = await supabase
          .from('feature_collections')
          .select(`
            id,
            name,
            project_file_id,
            layers (
              id,
              name,
              type,
              properties
            )
          `)
          .eq('project_files.project_id', projectId)
          .order('created_at', { ascending: false });

        if (collectionsError) {
          throw collectionsError;
        }

        // Add each layer to the store
        collections?.forEach(collection => {
          collection.layers?.forEach(layer => {
            logger.debug('Adding layer to store', {
              layerId: layer.id,
              name: layer.name,
              type: layer.type
            });

            addLayer(layer.id, true, collection.id, {
              name: layer.name,
              type: layer.type,
              properties: layer.properties || {},
              fileId: collection.project_file_id
            });
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