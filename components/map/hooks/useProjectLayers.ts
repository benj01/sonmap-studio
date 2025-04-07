'use client';

import { useEffect, useRef } from 'react';
import createClient from '@/utils/supabase/client';
import { useLayerStore } from '@/store/layers/layerStore';
import { useMapInstanceStore } from '@/store/map/mapInstanceStore';
import { LogManager } from '@/core/logging/log-manager';
import type { Feature, Geometry } from 'geojson';

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

interface ProjectLayer {
  id: string;
  name: string;
  type: string;
  properties: Record<string, any>;
  features?: Feature<Geometry>[];
}

interface ImportedFile {
  id: string;
  collections: {
    layers: ProjectLayer[];
  };
}

// Helper function to analyze geometry types
function analyzeGeometryTypes(features: Feature<Geometry>[]): { hasPolygons: boolean; hasLines: boolean; hasPoints: boolean } {
  const types = {
    hasPolygons: false,
    hasLines: false,
    hasPoints: false
  };

  for (const feature of features) {
    const geometryType = feature.geometry.type.toLowerCase();
    if (geometryType.includes('polygon')) {
      types.hasPolygons = true;
    } else if (geometryType.includes('line') || geometryType.includes('linestring')) {
      types.hasLines = true;
    } else if (geometryType.includes('point')) {
      types.hasPoints = true;
    }
  }

  return types;
}

export function useProjectLayers(projectId: string) {
  const supabase = createClient();
  const { addLayer, setInitialLoadComplete } = useLayerStore();
  const mapboxInstance = useMapInstanceStore(state => state.mapInstances.mapbox.instance);
  const mountCount = useRef(0);
  const isInitialized = useRef(false);
  const currentProjectId = useRef(projectId);

  useEffect(() => {
    // Skip first mount in development due to strict mode
    if (process.env.NODE_ENV === 'development' && mountCount.current === 0) {
      mountCount.current += 1;
      logger.debug('Skipping first mount in development');
      return;
    }

    // Reset initialization if projectId changes
    if (currentProjectId.current !== projectId) {
      logger.info('Project ID changed, resetting initialization', {
        oldProjectId: currentProjectId.current,
        newProjectId: projectId
      });
      isInitialized.current = false;
      currentProjectId.current = projectId;
    }

    // Skip if already initialized for this project
    if (isInitialized.current) {
      logger.debug('Project layers already initialized for this project');
      return;
    }

    let isMounted = true;
    let loadedLayers = new Set<string>();

    async function loadProjectLayers() {
      try {
        logger.info('Starting to load project layers', { projectId });

        // Get all imported files for the project
        const { data: importedFiles, error: filesError } = await supabase
          .from('project_files')
          .select('*')
          .eq('project_id', projectId)
          .eq('is_imported', true)
          .not('import_metadata', 'is', null);

        if (filesError) {
          logger.error('Error fetching imported files', { error: filesError });
          throw filesError;
        }

        if (!importedFiles?.length) {
          logger.info('No imported files found for project', { projectId });
          setInitialLoadComplete(true);
          isInitialized.current = true;
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
          for (const layer of collections.layers as ProjectLayer[]) {
            if (!isMounted) {
              logger.info('Component unmounted, stopping layer loading');
              return;
            }

            logger.info(`Adding layer to store`, {
              layerId: layer.id,
              name: layer.name,
              type: layer.type,
              fileId: importedFile.id
            });

            // Analyze geometry types before adding layer
            const geometryTypes = layer.features ? analyzeGeometryTypes(layer.features) : {
              hasPolygons: false,
              hasLines: false,
              hasPoints: false
            };
            
            logger.debug(`Analyzed geometry types for layer ${layer.id}`, {
              geometryTypes,
              featureCount: layer.features?.length || 0
            });

            addLayer(
              layer.id,
              true, // initially visible
              layer.id, // use layer id as source id
              {
                name: layer.name,
                type: layer.type,
                fileId: importedFile.id,
                properties: layer.properties || {},
                geometryTypes
              }
            );

            loadedLayers.add(layer.id);
          }
        }

        logger.info('Successfully loaded all project layers', {
          projectId,
          layerCount: loadedLayers.size,
          layerIds: Array.from(loadedLayers)
        });
        setInitialLoadComplete(true);
        isInitialized.current = true;
        logger.info('Project layers initialization complete', { projectId });
      } catch (error) {
        logger.error('Error loading project layers', { error });
        isInitialized.current = false;
      }
    }

    loadProjectLayers();

    return () => {
      isMounted = false;
    };
  }, [projectId, addLayer, setInitialLoadComplete]);

  return {
    isInitialized: isInitialized.current
  };
} 