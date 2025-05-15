'use client';

import { useEffect, useRef, useState } from 'react';
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
  console.log('useProjectLayers: running', { projectId });
  const supabase = createClient();
  const addLayer = useLayerStore(state => state.addLayer);
  const setInitialLoadComplete = useLayerStore(state => state.setInitialLoadComplete);
  const updateLayerStatus = useLayerStore(state => state.updateLayerStatus);
  const mountCount = useRef(0);
  const [isInitialized, setIsInitialized] = useState(false);
  const currentProjectId = useRef(projectId);
  const isLoadingRef = useRef(false);

  useEffect(() => {
    // Create an async function to handle all async operations
    async function initializeProjectLayers() {
      // Skip if already loading
      if (isLoadingRef.current) {
        await dbLogger.debug('Project layers loading already in progress', { projectId });
        return;
      }

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
        setIsInitialized(false);
        currentProjectId.current = projectId;
      }

      // Skip if already initialized for this project
      if (isInitialized && currentProjectId.current === projectId) {
        await dbLogger.debug('Project layers already initialized for this project', { projectId });
        return;
      }

      isLoadingRef.current = true;
      try {
        await loadProjectLayers();
      } finally {
        isLoadingRef.current = false;
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
          if (isMounted) {
            setInitialLoadComplete(true);
            setIsInitialized(true);
          }
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
          if (!isMounted) {
            await dbLogger.info('Component unmounted, stopping layer loading', { projectId });
            return;
          }

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
                if (geojson && Array.isArray(geojson.features)) {
                  layer.features = geojson.features;
                  await dbLogger.debug('Set layer.features from GeoJSON', {
                    layerId: layer.id,
                    featureCount: layer.features ? layer.features.length : 0,
                    sampleFeature: layer.features && layer.features.length > 0 ? layer.features[0] : null
                  });
                }
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

            if (isMounted) {
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
              // Set setupStatus to 'complete' after adding the layer
              updateLayerStatus(layer.id, 'complete');
            }

            loadedLayers.add(layer.id);
          }
        }

        await dbLogger.info('Successfully loaded all project layers', {
          projectId,
          layerCount: loadedLayers.size,
          layerIds: Array.from(loadedLayers)
        });
        if (isMounted) {
          setIsInitialized(true);
          setInitialLoadComplete(true);
        }
        await dbLogger.info('Project layers initialization complete', { projectId });
      } catch (error) {
        await dbLogger.error('Error loading project layers', { error, projectId });
        if (isMounted) {
          setIsInitialized(false);
          setInitialLoadComplete(true);
        }
      }
    }

    initializeProjectLayers();

    return () => {
      isMounted = false;
    };
  }, [projectId]);

  return { isInitialized };
} 