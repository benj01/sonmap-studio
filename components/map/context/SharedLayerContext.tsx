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

export interface SharedLayer {
  id: string;
  name: string;
  type: string;
  visible: boolean;
  metadata: {
    sourceType: '2d' | '3d' | 'both';
    source2D?: any;
    source3D?: any;
    style?: any;
  };
  selected: boolean;
}

interface SharedLayerContextType {
  layers: SharedLayer[];
  addLayer: (layer: SharedLayer) => void;
  removeLayer: (id: string) => void;
  toggleVisibility: (id: string) => void;
  toggleSelection: (id: string) => void;
  updateLayer: (id: string, updates: Partial<SharedLayer>) => void;
}

const SharedLayerContext = createContext<SharedLayerContextType | null>(null);

export function SharedLayerProvider({ children }: { children: ReactNode }) {
  const [layers, setLayers] = useState<SharedLayer[]>([]);

  const addLayer = useCallback((layer: SharedLayer) => {
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
  }, []);

  const updateLayer = useCallback((id: string, updates: Partial<SharedLayer>) => {
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

  return (
    <SharedLayerContext.Provider
      value={{
        layers,
        addLayer,
        removeLayer,
        toggleVisibility,
        toggleSelection,
        updateLayer
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