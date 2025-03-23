import { useEffect } from 'react';
import mapboxgl, { AnySourceData, LayerSpecification, Map as MapboxMap } from 'mapbox-gl';
import { useMapboxInstance } from '@/store/map/mapInstanceStore';
import { useLayer } from '@/store/layers/hooks';
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

export function MapLayer({ id, source, layer, initialVisibility = true, beforeId }: MapLayerProps) {
  const mapboxInstance = useMapboxInstance();
  const { layer: layerState, updateStatus } = useLayer(id);

  useEffect(() => {
    if (!mapboxInstance || !layerState) return;

    const addSourceAndLayer = async () => {
      try {
        // Add source if it doesn't exist
        if (!mapboxInstance.getSource(source.id)) {
          mapboxInstance.addSource(source.id, source.data);
        }

        // Add layer if it doesn't exist
        if (!mapboxInstance.getLayer(id)) {
          const layerConfig = {
            id,
            source: source.id,
            ...layer,
            layout: {
              ...layer.layout,
              visibility: layerState.visible ? 'visible' : 'none'
            }
          } as LayerSpecification;

          mapboxInstance.addLayer(layerConfig);
        }

        // Set initial visibility
        mapboxInstance.setLayoutProperty(id, 'visibility', layerState.visible ? 'visible' : 'none');

        updateStatus('ready');
      } catch (error) {
        logger.error('Error adding source and layer:', error);
        updateStatus('error', error instanceof Error ? error.message : 'Unknown error');
      }
    };

    addSourceAndLayer();

    return () => {
      try {
        if (mapboxInstance.getLayer(id)) {
          mapboxInstance.removeLayer(id);
        }
        if (mapboxInstance.getSource(source.id)) {
          mapboxInstance.removeSource(source.id);
        }
      } catch (error) {
        logger.error('Error cleaning up layer and source:', error);
      }
    };
  }, [mapboxInstance, layerState, source, layer, beforeId, updateStatus, id]);

  useEffect(() => {
    if (!mapboxInstance || !layerState) return;

    try {
      mapboxInstance.setLayoutProperty(id, 'visibility', layerState.visible ? 'visible' : 'none');
    } catch (error) {
      logger.error('Error updating layer visibility:', error);
    }
  }, [mapboxInstance, layerState?.visible, id]);

  return null;
} 