import React, { useEffect, useCallback } from 'react';
import { useMap } from 'react-map-gl';
import { dbLogger } from '@/utils/logging/dbLogger';
import type { Map as MapboxMap } from 'mapbox-gl';
import type { MapRef } from 'react-map-gl';
import type { LayerSpecification } from 'mapbox-gl';

type PaintPropertyName = keyof LayerSpecification['paint'];
type LayoutPropertyName = keyof LayerSpecification['layout'];
type PaintPropertyValue = LayerSpecification['paint'][PaintPropertyName];
type LayoutPropertyValue = LayerSpecification['layout'][LayoutPropertyName];

interface MapLayerStyle {
  paint?: Partial<LayerSpecification['paint']>;
  layout?: Partial<LayerSpecification['layout']>;
}

interface MapLayerProps {
  layerId: string;
  layer: {
    style?: MapLayerStyle;
  };
}

const LOG_SOURCE = 'MapLayer';

const MapLayer: React.FC<MapLayerProps> = ({ layerId, layer }) => {
  const { current: map } = useMap() as { current: MapRef };

  const logStyleUpdate = useCallback(async (property: PaintPropertyName, value: PaintPropertyValue) => {
    if (!map) return;
    
    await dbLogger.debug('MapLayer.setPaintProperty', {
      source: LOG_SOURCE,
      layerId,
      property,
      value,
      currentStyle: layer.style,
      mapStyleLoaded: map.isStyleLoaded(),
      mapIdle: map.idle,
      layerExists: map.getLayer(layerId) !== undefined,
      sourceExists: map.getSource(layerId) !== undefined
    });
  }, [map, layerId, layer.style]);

  const logLayoutUpdate = useCallback(async (property: LayoutPropertyName, value: LayoutPropertyValue) => {
    if (!map) return;
    
    await dbLogger.debug('MapLayer.setLayoutProperty', {
      source: LOG_SOURCE,
      layerId,
      property,
      value,
      currentStyle: layer.style,
      mapStyleLoaded: map.isStyleLoaded(),
      mapIdle: map.idle,
      layerExists: map.getLayer(layerId) !== undefined,
      sourceExists: map.getSource(layerId) !== undefined
    });
  }, [map, layerId, layer.style]);

  // Effect for handling layer styles
  useEffect(() => {
    if (!map || !layerId || !layer) return;

    const applyStyles = async () => {
      try {
        // Apply paint properties
        if (layer.style?.paint) {
          for (const [key, value] of Object.entries(layer.style.paint)) {
            if (value !== undefined) {
              const paintKey = key as PaintPropertyName;
              const paintValue = value as PaintPropertyValue;
              await logStyleUpdate(paintKey, paintValue);
              (map as unknown as MapboxMap).setPaintProperty(layerId, paintKey, paintValue);
            }
          }
        }

        // Apply layout properties
        if (layer.style?.layout) {
          for (const [key, value] of Object.entries(layer.style.layout)) {
            if (value !== undefined) {
              const layoutKey = key as LayoutPropertyName;
              const layoutValue = value as LayoutPropertyValue;
              await logLayoutUpdate(layoutKey, layoutValue);
              (map as unknown as MapboxMap).setLayoutProperty(layerId, layoutKey, layoutValue);
            }
          }
        }
      } catch (error) {
        await dbLogger.error('MapLayer.applyStyles.error', {
          source: LOG_SOURCE,
          layerId,
          error
        });
      }
    };

    // Properly handle the promise
    applyStyles().catch(async (error) => {
      await dbLogger.error('MapLayer.applyStyles.uncaughtError', {
        source: LOG_SOURCE,
        layerId,
        error
      });
    });
  }, [map, layerId, layer, logStyleUpdate, logLayoutUpdate]);

  return null;
};

export default MapLayer; 