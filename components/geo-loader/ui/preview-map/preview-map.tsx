import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { Feature } from 'geojson';
import { PreviewResult } from '../../core/preview/generator';
import { LayerInfo } from '../../core/processors/base/interfaces';

interface PreviewMapProps {
  previewData: PreviewResult;
  onLayerVisibilityChange?: (layerId: string, visible: boolean) => void;
  onStyleChange?: (layerId: string, style: any) => void;
  onBoundsChange?: (bounds: [number, number, number, number]) => void;
}

export const PreviewMap: React.FC<PreviewMapProps> = ({
  previewData,
  onLayerVisibilityChange,
  onStyleChange,
  onBoundsChange
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [layerStates, setLayerStates] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!mapContainer.current) return;

    // Initialize map
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v10',
      bounds: [
        previewData.bounds.minX,
        previewData.bounds.minY,
        previewData.bounds.maxX,
        previewData.bounds.maxY
      ],
      fitBoundsOptions: { padding: 50 }
    });

    // Add navigation controls
    map.current.addControl(new mapboxgl.NavigationControl());

    // Setup event listeners
    map.current.on('moveend', () => {
      if (map.current && onBoundsChange) {
        const bounds = map.current.getBounds();
        onBoundsChange([
          bounds.getWest(),
          bounds.getSouth(),
          bounds.getEast(),
          bounds.getNorth()
        ]);
      }
    });

    return () => {
      map.current?.remove();
    };
  }, []);

  // Update layers when preview data changes
  useEffect(() => {
    if (!map.current) return;

    // Add source if it doesn't exist
    if (!map.current.getSource('preview-data')) {
      map.current.addSource('preview-data', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: previewData.features
        }
      });
    } else {
      // Update source data
      (map.current.getSource('preview-data') as mapboxgl.GeoJSONSource).setData({
        type: 'FeatureCollection',
        features: previewData.features
      });
    }

    // Add/update layers
    previewData.layers.forEach(layer => {
      const layerId = `layer-${layer.name}`;
      
      // Remove existing layer
      if (map.current?.getLayer(layerId)) {
        map.current.removeLayer(layerId);
      }

      // Add new layer with styling
      map.current?.addLayer(createMapboxLayer(layer, layerId, previewData.style));

      // Update layer state
      setLayerStates(prev => ({
        ...prev,
        [layerId]: prev[layerId] ?? true
      }));
    });
  }, [previewData]);

  // Update layer visibility when states change
  useEffect(() => {
    if (!map.current) return;

    Object.entries(layerStates).forEach(([layerId, visible]) => {
      if (map.current?.getLayer(layerId)) {
        map.current.setLayoutProperty(
          layerId,
          'visibility',
          visible ? 'visible' : 'none'
        );
      }
    });
  }, [layerStates]);

  const toggleLayerVisibility = (layerId: string) => {
    setLayerStates(prev => {
      const newState = { ...prev, [layerId]: !prev[layerId] };
      onLayerVisibilityChange?.(layerId, !prev[layerId]);
      return newState;
    });
  };

  return (
    <div className="preview-map-container">
      <div ref={mapContainer} className="map-container" />
      <div className="layer-controls">
        {previewData.layers.map(layer => (
          <label key={layer.name} className="layer-control">
            <input
              type="checkbox"
              checked={layerStates[`layer-${layer.name}`] ?? true}
              onChange={() => toggleLayerVisibility(`layer-${layer.name}`)}
            />
            {layer.name} ({layer.featureCount} features)
          </label>
        ))}
      </div>
      <style jsx>{`
        .preview-map-container {
          position: relative;
          width: 100%;
          height: 100%;
        }
        .map-container {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
        }
        .layer-controls {
          position: absolute;
          top: 10px;
          right: 10px;
          background: white;
          padding: 10px;
          border-radius: 4px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .layer-control {
          display: block;
          margin: 5px 0;
          user-select: none;
        }
      `}</style>
    </div>
  );
};

function createMapboxLayer(
  layer: LayerInfo,
  layerId: string,
  style: PreviewResult['style']
): mapboxgl.AnyLayer {
  const baseStyle = {
    id: layerId,
    source: 'preview-data',
    filter: ['==', ['get', 'geometryType'], layer.geometryType]
  };

  switch (layer.geometryType.toLowerCase()) {
    case 'point':
    case 'multipoint':
      return {
        ...baseStyle,
        type: 'circle',
        paint: {
          'circle-color': style.colors[0],
          'circle-radius': 6,
          'circle-opacity': 0.8
        }
      };

    case 'linestring':
    case 'multilinestring':
      return {
        ...baseStyle,
        type: 'line',
        paint: {
          'line-color': style.colors[1],
          'line-width': 2,
          'line-opacity': 0.8
        }
      };

    case 'polygon':
    case 'multipolygon':
      return {
        ...baseStyle,
        type: 'fill',
        paint: {
          'fill-color': style.colors[2],
          'fill-opacity': 0.6,
          'fill-outline-color': '#000'
        }
      };

    default:
      return {
        ...baseStyle,
        type: 'circle',
        paint: {
          'circle-color': style.colors[0],
          'circle-radius': 6,
          'circle-opacity': 0.8
        }
      };
  }
} 