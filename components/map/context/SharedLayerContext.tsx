'use client';

import { createContext, useContext, useState, ReactNode, useCallback } from 'react';
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

export interface LayerMetadata {
  sourceType: '2d' | '3d' | 'both';
  source2D?: any;
  source3D?: any;
  style?: any;
}

export interface LayerState {
  id: string;
  name: string;
  type: string;
  visible: boolean;
  selected: boolean;
  metadata: LayerMetadata;
}

interface SharedLayerContextType {
  layers: LayerState[];
  selectedLayers: string[];
  addLayer: (layer: LayerState) => void;
  removeLayer: (id: string) => void;
  toggleVisibility: (id: string) => void;
  toggleSelection: (id: string) => void;
  updateLayer: (id: string, updates: Partial<LayerState>) => void;
  getSelectedLayers: () => LayerState[];
}

const SharedLayerContext = createContext<SharedLayerContextType | null>(null);

export function SharedLayerProvider({ children }: { children: ReactNode }) {
  const [layers, setLayers] = useState<LayerState[]>([]);
  const [selectedLayers, setSelectedLayers] = useState<string[]>([]);

  const addLayer = useCallback((layer: LayerState) => {
    setLayers(prev => {
      // Check if layer already exists
      if (prev.some(l => l.id === layer.id)) {
        logger.warn('Layer already exists', { layerId: layer.id });
        return prev;
      }
      
      logger.info('Adding new layer', { layerId: layer.id });
      return [...prev, layer];
    });
  }, []);

  const removeLayer = useCallback((id: string) => {
    setLayers(prev => {
      const newLayers = prev.filter(layer => layer.id !== id);
      logger.info('Removed layer', { layerId: id });
      return newLayers;
    });
    
    // Remove from selected layers if present
    setSelectedLayers(prev => prev.filter(layerId => layerId !== id));
  }, []);

  const toggleVisibility = useCallback((id: string) => {
    setLayers(prev => 
      prev.map(layer => {
        if (layer.id !== id) return layer;
        
        const newVisibility = !layer.visible;
        logger.debug('Toggling layer visibility', { 
          layerId: id, 
          newVisibility 
        });
        
        return { ...layer, visible: newVisibility };
      })
    );
  }, []);

  const toggleSelection = useCallback((id: string) => {
    setLayers(prev => 
      prev.map(layer => {
        if (layer.id !== id) return layer;
        
        const newSelection = !layer.selected;
        logger.debug('Toggling layer selection', { 
          layerId: id, 
          newSelection 
        });
        
        return { ...layer, selected: newSelection };
      })
    );

    // Update selectedLayers array
    setSelectedLayers(prev => {
      if (prev.includes(id)) {
        return prev.filter(layerId => layerId !== id);
      } else {
        return [...prev, id];
      }
    });
  }, []);

  const updateLayer = useCallback((id: string, updates: Partial<LayerState>) => {
    setLayers(prev => 
      prev.map(layer => {
        if (layer.id !== id) return layer;
        
        logger.debug('Updating layer', { 
          layerId: id, 
          updates 
        });
        
        return { ...layer, ...updates };
      })
    );
  }, []);

  const getSelectedLayers = useCallback(() => {
    return layers.filter(layer => layer.selected);
  }, [layers]);

  return (
    <SharedLayerContext.Provider
      value={{
        layers,
        selectedLayers,
        addLayer,
        removeLayer,
        toggleVisibility,
        toggleSelection,
        updateLayer,
        getSelectedLayers
      }}
    >
      {children}
    </SharedLayerContext.Provider>
  );
}

export function useSharedLayers() {
  const context = useContext(SharedLayerContext);
  if (!context) {
    throw new Error('useSharedLayers must be used within a SharedLayerProvider');
  }
  return context;
} 