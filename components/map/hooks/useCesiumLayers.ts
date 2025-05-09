'use client';

import { useState, useEffect } from 'react';
import * as Cesium from 'cesium';
import { useMapInstanceStore } from '@/store/map/mapInstanceStore';
import { dbLogger } from '@/utils/logging/dbLogger';

const SOURCE = 'useCesiumLayers';

export interface CesiumLayer {
  id: string;
  name: string;
  type: '3d-tiles' | 'terrain' | 'point-cloud' | 'imagery' | 'vector';
  visible: boolean;
  source: Cesium.TerrainProvider | Cesium.ImageryLayer | Cesium.Cesium3DTileset | Cesium.Entity | Cesium.DataSource;
  entity?: Cesium.Entity;
  dataSource?: Cesium.DataSource;
  imageryProvider?: Cesium.ImageryProvider;
  tileset?: Cesium.Cesium3DTileset;
  options?: {
    maximumScreenSpaceError?: number;
    maximumMemoryUsage?: number;
    shadows?: boolean;
    [key: string]: unknown;
  };
}

// Type guard for Cesium Viewer
function isCesiumViewer(instance: unknown): instance is Cesium.Viewer {
  return instance !== null && 
         typeof instance === 'object' && 
         'terrainProvider' in instance && 
         'imageryLayers' in instance &&
         'scene' in instance &&
         'entities' in instance &&
         'dataSources' in instance;
}

export function useCesiumLayers(projectId: string) {
  const cesiumInstance = useMapInstanceStore(state => state.mapInstances.cesium.instance);
  const cesiumStatus = useMapInstanceStore(state => state.mapInstances.cesium.status);
  const [layers, setLayers] = useState<CesiumLayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load layers from the database
  useEffect(() => {
    if (!cesiumInstance || cesiumStatus !== 'ready' || !isCesiumViewer(cesiumInstance)) return;

    const viewer = cesiumInstance as Cesium.Viewer;

    async function loadLayers() {
      try {
        setLoading(true);
        await dbLogger.debug('Loading 3D layers for project', { source: SOURCE, projectId });
        
        // Example: Add a Cesium World Terrain layer
        const terrainProvider = await Cesium.createWorldTerrainAsync();
        viewer.terrainProvider = terrainProvider;
        
        // Example: Add an imagery layer
        const imageryProvider = new Cesium.OpenStreetMapImageryProvider({
          url: 'https://a.tile.openstreetmap.org/'
        });
        const imageryLayer = viewer.imageryLayers.addImageryProvider(imageryProvider);
        
        setLayers([
          {
            id: 'terrain-layer',
            name: 'World Terrain',
            type: 'terrain',
            visible: true,
            source: terrainProvider
          },
          {
            id: 'imagery-layer',
            name: 'OpenStreetMap',
            type: 'imagery',
            visible: true,
            source: imageryLayer,
            imageryProvider
          }
        ]);
        
        setLoading(false);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to load 3D layers';
        await dbLogger.error('Error loading 3D layers', { source: SOURCE, error, projectId });
        setError(errorMessage);
        setLoading(false);
      }
    }

    // Start loading layers and handle any errors
    loadLayers().catch(async (error) => {
      await dbLogger.error('Unhandled error in loadLayers', { source: SOURCE, error });
    });
  }, [cesiumInstance, cesiumStatus, projectId]);

  // Toggle layer visibility
  const toggleLayerVisibility = async (layerId: string) => {
    if (!cesiumInstance || !isCesiumViewer(cesiumInstance)) return;

    const viewer = cesiumInstance as Cesium.Viewer;
    
    setLayers(prevLayers => 
      prevLayers.map(layer => {
        if (layer.id !== layerId) return layer;
        
        const newVisibility = !layer.visible;
        
        // Update the actual Cesium layer visibility
        try {
          if (layer.type === 'terrain') {
            // For terrain, we can't really toggle visibility, but we can switch to EllipsoidTerrainProvider
            if (!newVisibility) {
              viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
            } else if (layer.source instanceof Cesium.TerrainProvider) {
              viewer.terrainProvider = layer.source;
            }
          } else if (layer.type === 'imagery' && layer.source instanceof Cesium.ImageryLayer) {
            // For imagery layers, we can set the alpha to 0
            layer.source.alpha = newVisibility ? 1.0 : 0.0;
            layer.source.show = newVisibility;
          } else if (layer.type === '3d-tiles' && layer.tileset) {
            // For 3D tiles, we can set the show property
            layer.tileset.show = newVisibility;
          } else if (layer.entity) {
            // For entities, we can set the show property
            layer.entity.show = newVisibility;
          } else if (layer.dataSource) {
            // For data sources, we can set the show property
            layer.dataSource.show = newVisibility;
          }
        } catch (error) {
          (async () => {
            await dbLogger.error(`Error toggling visibility for layer ${layer.id}`, { 
              source: SOURCE, 
              error, 
              layerId: layer.id,
              layerType: layer.type 
            });
          })().catch(console.error);
        }
        
        return { ...layer, visible: newVisibility };
      })
    );
  };

  // Add a new layer
  const addLayer = async (layer: Omit<CesiumLayer, 'id'>) => {
    if (!cesiumInstance || !isCesiumViewer(cesiumInstance)) return;
    
    const newLayer: CesiumLayer = {
      ...layer,
      id: `layer-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    };
    
    try {
      await dbLogger.debug('Adding new layer', { source: SOURCE, layerId: newLayer.id, layerType: newLayer.type });
      setLayers(prevLayers => [...prevLayers, newLayer]);
      return newLayer.id;
    } catch (error) {
      await dbLogger.error('Error adding new layer', { source: SOURCE, error, layer: newLayer });
      throw error;
    }
  };

  // Remove a layer
  const removeLayer = async (layerId: string) => {
    if (!cesiumInstance || !isCesiumViewer(cesiumInstance)) return;

    const viewer = cesiumInstance as Cesium.Viewer;
    
    const layerToRemove = layers.find(layer => layer.id === layerId);
    if (!layerToRemove) return;
    
    try {
      // Clean up the layer resources
      if (layerToRemove.type === 'imagery' && layerToRemove.source instanceof Cesium.ImageryLayer) {
        viewer.imageryLayers.remove(layerToRemove.source);
      } else if (layerToRemove.type === '3d-tiles' && layerToRemove.tileset) {
        viewer.scene.primitives.remove(layerToRemove.tileset);
      } else if (layerToRemove.entity) {
        viewer.entities.remove(layerToRemove.entity);
      } else if (layerToRemove.dataSource) {
        viewer.dataSources.remove(layerToRemove.dataSource);
      }
      
      await dbLogger.debug('Removed layer', { source: SOURCE, layerId });
      setLayers(prevLayers => prevLayers.filter(layer => layer.id !== layerId));
    } catch (error) {
      await dbLogger.error(`Error removing layer ${layerId}`, { source: SOURCE, error, layerId });
      throw error;
    }
  };

  return {
    layers,
    loading,
    error,
    toggleLayerVisibility,
    addLayer,
    removeLayer
  };
} 