'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { LogManager } from '@/core/logging/log-manager';

const SOURCE = 'SharedLayerContext';
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

// Define style types for each layer type
export interface VectorLayerStyle {
  paint?: {
    'line-color'?: string;
    'line-width'?: number;
    'fill-color'?: string;
    'fill-opacity'?: number;
    [key: string]: any;
  };
  layout?: {
    'line-cap'?: string;
    'line-join'?: string;
    [key: string]: any;
  };
}

export interface TilesetStyle {
  // Core Cesium3DTileset options
  maximumScreenSpaceError?: number;
  show?: boolean;
  modelMatrix?: any;
  // Additional options for our application
  opacity?: number;
  color?: string;
  colorBlendMode?: 'highlight' | 'mix' | 'replace';
  colorBlendAmount?: number;
  [key: string]: any;
}

export interface ImageryStyle {
  minimumLevel?: number;
  maximumLevel?: number;
  tileWidth?: number;
  tileHeight?: number;
  credit?: string;
  [key: string]: any;
}

export interface TerrainStyle {
  requestVertexNormals?: boolean;
  requestWaterMask?: boolean;
  requestMetadata?: boolean;
  [key: string]: any;
}

// Define the shared layer type
export interface SharedLayer {
  id: string;
  name: string;
  type: 'vector' | '3d-tiles' | 'imagery' | 'terrain';
  visible: boolean;
  metadata: {
    sourceType: '2d' | '3d';
    geojson?: any;
    source2D?: any;
    source3D?: any;
    style?: VectorLayerStyle | TilesetStyle | ImageryStyle | TerrainStyle;
  };
  selected: boolean;
}

// Define the context shape
interface SharedLayerContextType {
  layers: SharedLayer[];
  addLayer: (layer: SharedLayer) => void;
  removeLayer: (layerId: string) => void;
  toggleLayerVisibility: (layerId: string) => void;
  updateLayer: (layerId: string, updates: Partial<SharedLayer>) => void;
  getLayer: (layerId: string) => SharedLayer | undefined;
}

// Create the context with default values
const SharedLayerContext = createContext<SharedLayerContextType>({
  layers: [],
  addLayer: () => {},
  removeLayer: () => {},
  toggleLayerVisibility: () => {},
  updateLayer: () => {},
  getLayer: () => undefined,
});

interface SharedLayerProviderProps {
  children: ReactNode;
}

export function SharedLayerProvider({ children }: SharedLayerProviderProps) {
  const [layers, setLayers] = useState<SharedLayer[]>([]);

  const addLayer = (layer: SharedLayer) => {
    logger.debug('Adding layer', { layer });
    setLayers(prevLayers => [...prevLayers, layer]);
  };

  const removeLayer = (layerId: string) => {
    logger.debug('Removing layer', { layerId });
    setLayers(prevLayers => prevLayers.filter(layer => layer.id !== layerId));
  };

  const toggleLayerVisibility = (layerId: string) => {
    logger.debug('Toggling layer visibility', { layerId });
    setLayers(prevLayers =>
      prevLayers.map(layer =>
        layer.id === layerId
          ? { ...layer, visible: !layer.visible }
          : layer
      )
    );
  };

  const updateLayer = (layerId: string, updates: Partial<SharedLayer>) => {
    logger.debug('Updating layer', { layerId, updates });
    setLayers(prevLayers =>
      prevLayers.map(layer =>
        layer.id === layerId
          ? { ...layer, ...updates }
          : layer
      )
    );
  };

  const getLayer = (layerId: string) => {
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
export function useSharedLayers() {
  const context = useContext(SharedLayerContext);
  if (context === undefined) {
    throw new Error('useSharedLayers must be used within a SharedLayerProvider');
  }
  return context;
} 