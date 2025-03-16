'use client';

import { useState, useEffect } from 'react';
import * as Cesium from 'cesium';
import { useCesium } from '../context/CesiumContext';
import { LogManager } from '@/core/logging/log-manager';

const SOURCE = 'useCesiumLayers';
const logManager = LogManager.getInstance();

const logger = {
  info: (message: string, data?: any) => {
    logManager.info(SOURCE, message, data);
    console.log(`[${SOURCE}] ${message}`, data);
  },
  warn: (message: string, error?: any) => {
    logManager.warn(SOURCE, message, error);
    console.warn(`[${SOURCE}] ${message}`, error);
  },
  error: (message: string, error?: any) => {
    logManager.error(SOURCE, message, error);
    console.error(`[${SOURCE}] ${message}`, error);
  },
  debug: (message: string, data?: any) => {
    logManager.debug(SOURCE, message, data);
    console.debug(`[${SOURCE}] ${message}`, data);
  }
};

export interface CesiumLayer {
  id: string;
  name: string;
  type: '3d-tiles' | 'terrain' | 'point-cloud' | 'imagery' | 'vector';
  visible: boolean;
  source: any; // This could be a Cesium3DTileset, TerrainProvider, etc.
  entity?: Cesium.Entity;
  dataSource?: Cesium.DataSource;
  imageryProvider?: Cesium.ImageryProvider;
  tileset?: Cesium.Cesium3DTileset;
  options?: any;
}

export function useCesiumLayers(projectId: string) {
  const { viewer, isInitialized } = useCesium();
  const [layers, setLayers] = useState<CesiumLayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load layers from the database
  useEffect(() => {
    if (!isInitialized || !viewer) return;

    async function loadLayers() {
      try {
        setLoading(true);
        logger.debug('Loading 3D layers for project', { projectId });
        
        // TODO: Implement actual layer loading from database
        // For now, we'll just set up some example layers
        
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
      } catch (err: any) {
        logger.error('Error loading 3D layers', err);
        setError(err.message || 'Failed to load 3D layers');
        setLoading(false);
      }
    }

    loadLayers();
  }, [isInitialized, viewer, projectId]);

  // Toggle layer visibility
  const toggleLayerVisibility = (layerId: string) => {
    if (!viewer) return;
    
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
            } else if (layer.source) {
              viewer.terrainProvider = layer.source;
            }
          } else if (layer.type === 'imagery' && layer.source) {
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
        } catch (err) {
          logger.error(`Error toggling visibility for layer ${layer.id}`, err);
        }
        
        return { ...layer, visible: newVisibility };
      })
    );
  };

  // Add a new layer
  const addLayer = (layer: Omit<CesiumLayer, 'id'>) => {
    if (!viewer) return;
    
    const newLayer: CesiumLayer = {
      ...layer,
      id: `layer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };
    
    setLayers(prevLayers => [...prevLayers, newLayer]);
    return newLayer.id;
  };

  // Remove a layer
  const removeLayer = (layerId: string) => {
    if (!viewer) return;
    
    const layerToRemove = layers.find(layer => layer.id === layerId);
    if (!layerToRemove) return;
    
    try {
      // Clean up the layer resources
      if (layerToRemove.type === 'imagery' && layerToRemove.source) {
        viewer.imageryLayers.remove(layerToRemove.source);
      } else if (layerToRemove.type === '3d-tiles' && layerToRemove.tileset) {
        viewer.scene.primitives.remove(layerToRemove.tileset);
      } else if (layerToRemove.entity) {
        viewer.entities.remove(layerToRemove.entity);
      } else if (layerToRemove.dataSource) {
        viewer.dataSources.remove(layerToRemove.dataSource);
      }
    } catch (err) {
      logger.error(`Error removing layer ${layerId}`, err);
    }
    
    setLayers(prevLayers => prevLayers.filter(layer => layer.id !== layerId));
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