import React, { useEffect } from 'react';
import { useMap } from 'react-map-gl';
import { dbLogger } from '@/utils/logging/dbLogger';
import type { MapRef } from 'react-map-gl';
import type { Map } from 'mapbox-gl';

interface MapLayerProps {
  layerId: string;
  layer: {
    style?: {
      paint?: Record<string, any>;
      layout?: Record<string, any>;
    };
  };
}

const MapLayer: React.FC<MapLayerProps> = ({ layerId, layer }) => {
  const { current: map } = useMap();

  // Effect for handling layer styles
  useEffect(() => {
    if (!map || !layerId || !layer) return;

    const logStyleUpdate = async (property: string, value: any) => {
      await dbLogger.debug('MapLayer.setPaintProperty', {
        layerId,
        property,
        value,
        currentStyle: layer.style,
        mapStyleLoaded: map.isStyleLoaded(),
        mapIdle: map.idle,
        layerExists: map.getLayer(layerId) !== undefined,
        sourceExists: map.getSource(layerId) !== undefined
      });
    };

    const logLayoutUpdate = async (property: string, value: any) => {
      await dbLogger.debug('MapLayer.setLayoutProperty', {
        layerId,
        property,
        value,
        currentStyle: layer.style,
        mapStyleLoaded: map.isStyleLoaded(),
        mapIdle: map.idle,
        layerExists: map.getLayer(layerId) !== undefined,
        sourceExists: map.getSource(layerId) !== undefined
      });
    };

    // Apply paint properties
    if (layer.style?.paint) {
      Object.entries(layer.style.paint).forEach(([key, value]) => {
        if (value !== undefined) {
          (async () => { await logStyleUpdate(key, value); })();
          (map as any).setPaintProperty(layerId, key, value);
        }
      });
    }

    // Apply layout properties
    if (layer.style?.layout) {
      Object.entries(layer.style.layout).forEach(([key, value]) => {
        if (value !== undefined) {
          (async () => { await logLayoutUpdate(key, value); })();
          (map as any).setLayoutProperty(layerId, key, value);
        }
      });
    }
  }, [map, layerId, layer?.style]);

  return null;
};

export default MapLayer; 