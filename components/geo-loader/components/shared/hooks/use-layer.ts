import { useState, useCallback, useMemo } from 'react';
import { Feature } from 'geojson';

interface Layer {
  id: string;
  name: string;
  visible: boolean;
  selected: boolean;
  features: Feature[];
  color?: string;
  style?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

interface LayerOptions {
  id?: string;
  name?: string;
  visible?: boolean;
  selected?: boolean;
  color?: string;
  style?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

interface LayerState {
  layers: Layer[];
  selectedLayers: string[];
  visibleLayers: string[];
}

export function useLayer(initialFeatures: Feature[] = [], defaultOptions: LayerOptions = {}) {
  const [state, setState] = useState<LayerState>({
    layers: [],
    selectedLayers: [],
    visibleLayers: []
  });

  // Initialize layers from features
  useState(() => {
    if (initialFeatures.length > 0) {
      const layers = createLayersFromFeatures(initialFeatures, defaultOptions);
      setState({
        layers,
        selectedLayers: layers.filter(l => l.selected).map(l => l.id),
        visibleLayers: layers.filter(l => l.visible).map(l => l.id)
      });
    }
  });

  // Add new layer
  const addLayer = useCallback((
    features: Feature[],
    options: LayerOptions = {}
  ) => {
    setState(prev => {
      const layer = createLayer(features, {
        ...defaultOptions,
        ...options
      });
      
      return {
        layers: [...prev.layers, layer],
        selectedLayers: layer.selected 
          ? [...prev.selectedLayers, layer.id]
          : prev.selectedLayers,
        visibleLayers: layer.visible
          ? [...prev.visibleLayers, layer.id]
          : prev.visibleLayers
      };
    });
  }, [defaultOptions]);

  // Remove layer
  const removeLayer = useCallback((layerId: string) => {
    setState(prev => ({
      layers: prev.layers.filter(l => l.id !== layerId),
      selectedLayers: prev.selectedLayers.filter(id => id !== layerId),
      visibleLayers: prev.visibleLayers.filter(id => id !== layerId)
    }));
  }, []);

  // Update layer visibility
  const setLayerVisibility = useCallback((layerId: string, visible: boolean) => {
    setState(prev => {
      const layers = prev.layers.map(layer =>
        layer.id === layerId ? { ...layer, visible } : layer
      );
      
      const visibleLayers = visible
        ? [...prev.visibleLayers, layerId]
        : prev.visibleLayers.filter(id => id !== layerId);

      return {
        ...prev,
        layers,
        visibleLayers
      };
    });
  }, []);

  // Update layer selection
  const setLayerSelection = useCallback((layerId: string, selected: boolean) => {
    setState(prev => {
      const layers = prev.layers.map(layer =>
        layer.id === layerId ? { ...layer, selected } : layer
      );
      
      const selectedLayers = selected
        ? [...prev.selectedLayers, layerId]
        : prev.selectedLayers.filter(id => id !== layerId);

      return {
        ...prev,
        layers,
        selectedLayers
      };
    });
  }, []);

  // Update layer style
  const setLayerStyle = useCallback((
    layerId: string,
    style: Record<string, unknown>
  ) => {
    setState(prev => ({
      ...prev,
      layers: prev.layers.map(layer =>
        layer.id === layerId ? { ...layer, style } : layer
      )
    }));
  }, []);

  // Get visible features
  const visibleFeatures = useMemo(() => {
    return state.layers
      .filter(layer => layer.visible)
      .flatMap(layer => layer.features);
  }, [state.layers, state.visibleLayers]);

  // Get selected features
  const selectedFeatures = useMemo(() => {
    return state.layers
      .filter(layer => layer.selected)
      .flatMap(layer => layer.features);
  }, [state.layers, state.selectedLayers]);

  return {
    layers: state.layers,
    selectedLayers: state.selectedLayers,
    visibleLayers: state.visibleLayers,
    visibleFeatures,
    selectedFeatures,
    addLayer,
    removeLayer,
    setLayerVisibility,
    setLayerSelection,
    setLayerStyle
  };
}

// Helper functions
function createLayer(
  features: Feature[],
  options: LayerOptions
): Layer {
  return {
    id: options.id || generateId(),
    name: options.name || 'New Layer',
    visible: options.visible ?? true,
    selected: options.selected ?? false,
    features,
    color: options.color,
    style: options.style,
    metadata: options.metadata
  };
}

function createLayersFromFeatures(
  features: Feature[],
  options: LayerOptions
): Layer[] {
  // Group features by their source layer property if it exists
  const groups = new Map<string, Feature[]>();
  
  features.forEach(feature => {
    const layer = feature.properties?.layer || 'default';
    const group = groups.get(layer) || [];
    group.push(feature);
    groups.set(layer, group);
  });

  // Create a layer for each group
  return Array.from(groups.entries()).map(([name, groupFeatures]) =>
    createLayer(groupFeatures, {
      ...options,
      name,
      id: generateId()
    })
  );
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}
