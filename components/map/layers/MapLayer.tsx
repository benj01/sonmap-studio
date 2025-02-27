import { useEffect, useCallback, useRef } from 'react';
import mapboxgl, { AnySourceData, LayerSpecification } from 'mapbox-gl';
import { useMapContext } from '../hooks/useMapContext';
import { LogManager } from '@/core/logging/log-manager';

const SOURCE = 'MapLayer';
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

export interface MapLayerProps {
  id: string;
  source: {
    id: string;
    data: AnySourceData;
  };
  layer: Omit<LayerSpecification, 'id' | 'source'>;
  initialVisibility?: boolean;
  beforeId?: string;
}

export function MapLayer({
  id,
  source,
  layer,
  initialVisibility = true,
  beforeId,
}: MapLayerProps) {
  const { map, addLayer, registerLayerAddition, isSourceLoaded } = useMapContext();
  const sourceAddedRef = useRef(false);
  const layerAddedRef = useRef(false);

  const addSourceAndLayer = useCallback(() => {
    if (!map || !map.loaded()) return;

    try {
      // Add source if it doesn't exist
      if (!sourceAddedRef.current && !map.getSource(source.id)) {
        map.addSource(source.id, source.data);
        sourceAddedRef.current = true;
        logger.debug('Source added', { sourceId: source.id });
      }

      // Check if source is loaded before adding layer
      if (!isSourceLoaded(source.id)) {
        logger.debug('Source not loaded yet', { sourceId: source.id });
        return;
      }

      // Add layer if it doesn't exist
      if (!layerAddedRef.current && !map.getLayer(id)) {
        const layerConfig: LayerSpecification = {
          id,
          source: source.id,
          ...layer,
        };

        if (beforeId) {
          map.addLayer(layerConfig, beforeId);
        } else {
          map.addLayer(layerConfig);
        }

        layerAddedRef.current = true;
        registerLayerAddition(id);
        logger.debug('Layer added', { layerId: id, sourceId: source.id });
      }
    } catch (error) {
      logger.error('Error adding source or layer', {
        error,
        layerId: id,
        sourceId: source.id,
      });
    }
  }, [map, id, source, layer, beforeId, registerLayerAddition, isSourceLoaded]);

  // Handle source and layer addition
  useEffect(() => {
    if (!map) return;

    // Register layer with context first
    addLayer(id, initialVisibility, source.id);

    // Try immediate addition
    addSourceAndLayer();

    // Listen for source data changes
    const handleSourceData = () => {
      if (!layerAddedRef.current) {
        addSourceAndLayer();
      }
    };

    map.on('sourcedata', handleSourceData);

    return () => {
      map.off('sourcedata', handleSourceData);

      // Clean up source and layer if they exist
      if (map.getLayer(id)) {
        map.removeLayer(id);
        layerAddedRef.current = false;
      }

      // Only remove source if no other layers are using it
      const style = map.getStyle();
      if (sourceAddedRef.current && style?.layers && !style.layers.some(l => l.source === source.id)) {
        try {
          map.removeSource(source.id);
          sourceAddedRef.current = false;
        } catch (error) {
          logger.warn('Error removing source', { error, sourceId: source.id });
        }
      }
    };
  }, [map, id, source, layer, initialVisibility, addLayer, addSourceAndLayer]);

  return null;
} 