'use client';

import { createContext, useContext, useState, ReactNode } from 'react';
import { dbLogger } from '@/utils/logging/dbLogger';
import type { Matrix4 } from 'cesium';

const SOURCE = 'SharedLayerContext';

// Define style types for each layer type
export interface VectorLayerStyle {
  paint?: {
    'line-color'?: string;
    'line-width'?: number;
    'fill-color'?: string;
    'fill-opacity'?: number;
    [key: string]: string | number | undefined;
  };
  layout?: {
    'line-cap'?: string;
    'line-join'?: string;
    [key: string]: string | undefined;
  };
}

export interface TilesetStyle {
  // Core Cesium3DTileset options
  maximumScreenSpaceError?: number;
  show?: boolean;
  modelMatrix?: Matrix4;
  // Additional options for our application
  opacity?: number;
  color?: string;
  colorBlendMode?: 'highlight' | 'mix' | 'replace';
  colorBlendAmount?: number;
}

export interface ImageryStyle {
  minimumLevel?: number;
  maximumLevel?: number;
  tileWidth?: number;
  tileHeight?: number;
  credit?: string;
}

export interface TerrainStyle {
  requestVertexNormals?: boolean;
  requestWaterMask?: boolean;
  requestMetadata?: boolean;
}

// Define source types
export interface LayerSource {
  url?: string;
  format?: string;
  type?: string;
  [key: string]: string | undefined;
}

// Define the shared layer type
export interface SharedLayer {
  id: string;
  name: string;
  type: 'vector' | '3d-tiles' | 'imagery' | 'terrain';
  visible: boolean;
  metadata: {
    sourceType: '2d' | '3d';
    geojson?: Record<string, unknown>;
    source2D?: LayerSource;
    source3D?: LayerSource;
    style?: VectorLayerStyle | TilesetStyle | ImageryStyle | TerrainStyle;
  };
  selected: boolean;
}

// Define the context shape
interface SharedLayerContextType {
  layers: SharedLayer[];
  addLayer: (layer: SharedLayer) => Promise<void>;
  removeLayer: (layerId: string) => Promise<void>;
  toggleLayerVisibility: (layerId: string) => Promise<void>;
  updateLayer: (layerId: string, updates: Partial<SharedLayer>) => Promise<void>;
  getLayer: (layerId: string) => SharedLayer | undefined;
}

// Create the context with default values
const SharedLayerContext = createContext<SharedLayerContextType>({
  layers: [],
  addLayer: async () => {},
  removeLayer: async () => {},
  toggleLayerVisibility: async () => {},
  updateLayer: async () => {},
  getLayer: () => undefined,
});

interface SharedLayerProviderProps {
  children: ReactNode;
}

export function SharedLayerProvider({ children }: SharedLayerProviderProps) {
  const [layers, setLayers] = useState<SharedLayer[]>([]);

  const addLayer = async (layer: SharedLayer): Promise<void> => {
    try {
      await dbLogger.debug('addLayer.start', { source: SOURCE, layerId: layer.id });
      setLayers(prevLayers => [...prevLayers, layer]);
      await dbLogger.debug('addLayer.success', { source: SOURCE, layerId: layer.id });
    } catch (error) {
      await dbLogger.error('addLayer.error', { source: SOURCE, layerId: layer.id, error });
      throw error;
    }
  };

  const removeLayer = async (layerId: string): Promise<void> => {
    try {
      await dbLogger.debug('removeLayer.start', { source: SOURCE, layerId });
      setLayers(prevLayers => prevLayers.filter(layer => layer.id !== layerId));
      await dbLogger.debug('removeLayer.success', { source: SOURCE, layerId });
    } catch (error) {
      await dbLogger.error('removeLayer.error', { source: SOURCE, layerId, error });
      throw error;
    }
  };

  const toggleLayerVisibility = async (layerId: string): Promise<void> => {
    try {
      await dbLogger.debug('toggleLayerVisibility.start', { source: SOURCE, layerId });
      setLayers(prevLayers =>
        prevLayers.map(layer =>
          layer.id === layerId
            ? { ...layer, visible: !layer.visible }
            : layer
        )
      );
      await dbLogger.debug('toggleLayerVisibility.success', { source: SOURCE, layerId });
    } catch (error) {
      await dbLogger.error('toggleLayerVisibility.error', { source: SOURCE, layerId, error });
      throw error;
    }
  };

  const updateLayer = async (layerId: string, updates: Partial<SharedLayer>): Promise<void> => {
    try {
      await dbLogger.debug('updateLayer.start', { source: SOURCE, layerId, updates });
      setLayers(prevLayers =>
        prevLayers.map(layer =>
          layer.id === layerId
            ? { ...layer, ...updates }
            : layer
        )
      );
      await dbLogger.debug('updateLayer.success', { source: SOURCE, layerId });
    } catch (error) {
      await dbLogger.error('updateLayer.error', { source: SOURCE, layerId, error });
      throw error;
    }
  };

  const getLayer = (layerId: string): SharedLayer | undefined => {
    return layers.find(layer => layer.id === layerId);
  };

  const contextValue = {
    layers,
    addLayer,
    removeLayer,
    toggleLayerVisibility,
    updateLayer,
    getLayer,
  };

  return (
    <SharedLayerContext.Provider value={contextValue}>
      {children}
    </SharedLayerContext.Provider>
  );
}

// Custom hook for using the shared layer context
export function useSharedLayers(): SharedLayerContextType {
  const context = useContext(SharedLayerContext);
  if (context === undefined) {
    throw new Error('useSharedLayers must be used within a SharedLayerProvider');
  }
  return context;
} 