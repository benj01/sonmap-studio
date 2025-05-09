'use client';

import { useEffect, useRef } from 'react';
import createClient from '@/utils/supabase/client';
import { useLayerStore } from '@/store/layers/layerStore';
import { dbLogger } from '@/utils/logging/dbLogger';
import type { Feature, Geometry } from 'geojson';

interface ProjectLayer {
  id: string;
  name: string;
  type: string;
  properties: Record<string, unknown>;
  features?: Feature<Geometry>[];
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
  const mountCount = useRef(0);
  const isInitialized = useRef(false);
  const currentProjectId = useRef(projectId);

  useEffect(() => {
    // Create an async function to handle all async operations
    async function initializeProjectLayers() {
      // Skip first mount in development due to strict mode
      if (process.env.NODE_ENV === 'development' && mountCount.current === 0) {
        mountCount.current += 1;
        await dbLogger.debug('Skipping first mount in development', { projectId });
        return;
      }

      // Reset initialization if projectId changes
      if (currentProjectId.current !== projectId) {
        await dbLogger.info('Project ID changed, resetting initialization', {
          oldProjectId: currentProjectId.current,
          newProjectId: projectId
        });
        isInitialized.current = false;
        currentProjectId.current = projectId;
      }

      // Skip if already initialized for this project
      if (isInitialized.current) {
        await dbLogger.debug('Project layers already initialized for this project', { projectId });
        return;
      }
    }

    let isMounted = true;
    const loadedLayers = new Set<string>();

    async function loadProjectLayers() {
      try {
        await dbLogger.info('Starting to load project layers', { projectId });

        // Get all imported files for the project
        const { data: importedFiles, error: filesError } = await supabase
          .from('project_files')
          .select('*')
          .eq('project_id', projectId)
          .eq('is_imported', true)
          .not('import_metadata', 'is', null);

        if (filesError) {
          await dbLogger.error('Error fetching imported files', { error: filesError, projectId });
          throw filesError;
        }

        if (!importedFiles?.length) {
          await dbLogger.info('No imported files found for project', { projectId });
          setInitialLoadComplete(true);
          isInitialized.current = true;
          return;
        }

        await dbLogger.info('Found imported files', { 
          projectId,
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
            await dbLogger.warn('File missing collection_id in import_metadata', {
              projectId,
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
            await dbLogger.error('Error fetching feature collection', { 
              projectId,
              error: collectionsError,
              fileId: importedFile.id 
            });
            continue;
          }

          if (!collections || !collections.layers?.length) {
            await dbLogger.warn('No layers found in feature collection', { 
              projectId,
              fileId: importedFile.id,
              collectionId: importedFile.import_metadata.collection_id
            });
            continue;
          }

          await dbLogger.info('Feature collection loaded', { 
            projectId,
            fileId: importedFile.id,
            collectionId: collections.id,
            name: collections.name,
            layerCount: collections.layers.length,
            layers: collections.layers.map(l => ({ id: l.id, name: l.name, type: l.type }))
          });

          // Add each layer to the store
          for (const layer of collections.layers as ProjectLayer[]) {
            if (!isMounted) {
              await dbLogger.info('Component unmounted, stopping layer loading', { projectId });
              return;
            }

            await dbLogger.info(`Adding layer to store`, {
              projectId,
              layerId: layer.id,
              name: layer.name,
              type: layer.type,
              fileId: importedFile.id
            });

            // Fetch GeoJSON for vector layers
            let geojson = undefined;
            if (layer.type === 'vector') {
              await dbLogger.info('Fetching GeoJSON for vector layer', { projectId, layerId: layer.id });
              const { data: geojsonData, error: geojsonError } = await supabase.rpc('get_layer_features_geojson', { p_layer_id: layer.id });
              if (geojsonError) {
                await dbLogger.error('Error fetching GeoJSON for layer', { projectId, layerId: layer.id, error: geojsonError });
              } else {
                geojson = geojsonData;
                await dbLogger.info('Fetched GeoJSON for layer', { projectId, layerId: layer.id, hasGeojson: !!geojson });
              }
            }

            // Analyze geometry types before adding layer
            const geometryTypes = layer.features ? analyzeGeometryTypes(layer.features) : {
              hasPolygons: false,
              hasLines: false,
              hasPoints: false
            };
            
            await dbLogger.debug(`Analyzed geometry types for layer ${layer.id}`, {
              projectId,
              layerId: layer.id,
              geometryTypes,
              featureCount: layer.features?.length || 0
            });

            // Add geojson to properties if present
            const propertiesWithGeojson = geojson ? { ...layer.properties, geojson } : layer.properties || {};

            addLayer(
              layer.id,
              true, // initially visible
              layer.id, // use layer id as source id
              {
                name: layer.name,
                type: layer.type,
                fileId: importedFile.id,
                properties: propertiesWithGeojson,
                geometryTypes
              }
            );

            loadedLayers.add(layer.id);
          }
        }

        await dbLogger.info('Successfully loaded all project layers', {
          projectId,
          layerCount: loadedLayers.size,
          layerIds: Array.from(loadedLayers)
        });
        setInitialLoadComplete(true);
        isInitialized.current = true;
        await dbLogger.info('Project layers initialization complete', { projectId });
      } catch (error) {
        await dbLogger.error('Error loading project layers', { projectId, error });
        setInitialLoadComplete(true); // Set to true even on error to prevent infinite loading state
      }
    }

    // Create an async IIFE to handle all async operations
    (async () => {
      try {
        await initializeProjectLayers();
        await loadProjectLayers();
      } catch (error) {
        await dbLogger.error('Failed to initialize or load project layers', { projectId, error });
      }
    })().catch(async (error) => {
      await dbLogger.error('Unhandled error in project layers initialization', { projectId, error });
    });

    return () => {
      isMounted = false;
    };
  }, [projectId, supabase, addLayer, setInitialLoadComplete]);
} 