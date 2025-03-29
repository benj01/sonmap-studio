import React, { useEffect } from 'react';
import mapboxgl from 'mapbox-gl';
import { useMapbox } from '../../contexts/MapboxContext';
import { useLogger } from '../../contexts/LoggerContext';

const MapLayer: React.FC = () => {
  const mapboxInstance = useMapbox();
  const logger = useLogger();
  const layer = useMapbox(); // Assuming you have a layer state

  // Add layer and source
  useEffect(() => {
    if (!mapboxInstance || !layer) return;

    const addLayerAndSource = () => {
      try {
        // Check if layer already exists
        if (mapboxInstance.getLayer(layer.id)) {
          logger.debug('Layer already exists, skipping add', { layerId: layer.id });
          return;
        }

        // Check if source already exists
        if (mapboxInstance.getSource(layer.id)) {
          logger.debug('Source already exists, skipping add', { layerId: layer.id });
          return;
        }

        // Add source first
        if (layer.sourceType === 'vector') {
          mapboxInstance.addSource(layer.id, {
            type: 'vector',
            url: layer.sourceUrl,
            bounds: layer.bounds,
            minzoom: layer.minzoom,
            maxzoom: layer.maxzoom,
            attribution: layer.attribution
          });
        } else if (layer.sourceType === 'geojson') {
          mapboxInstance.addSource(layer.id, {
            type: 'geojson',
            data: layer.sourceData,
            bounds: layer.bounds,
            attribution: layer.attribution
          });
        }

        // Add layer
        mapboxInstance.addLayer({
          id: layer.id,
          type: layer.type,
          source: layer.id,
          layout: layer.layout,
          paint: layer.paint,
          filter: layer.filter
        });

        logger.info('Added layer and source', {
          layerId: layer.id,
          sourceType: layer.sourceType,
          layerType: layer.type
        });
      } catch (error) {
        logger.error('Error adding layer and source', {
          layerId: layer.id,
          error: error instanceof Error ? error.message : error
        });
      }
    };

    // Add layer immediately if map is ready
    if (mapboxInstance.loaded()) {
      addLayerAndSource();
    } else {
      // Wait for map to be ready
      mapboxInstance.once('load', addLayerAndSource);
    }

    // Cleanup
    return () => {
      try {
        if (mapboxInstance.getLayer(layer.id)) {
          mapboxInstance.removeLayer(layer.id);
        }
        if (mapboxInstance.getSource(layer.id)) {
          mapboxInstance.removeSource(layer.id);
        }
        logger.info('Removed layer and source', { layerId: layer.id });
      } catch (error) {
        logger.error('Error removing layer and source', {
          layerId: layer.id,
          error: error instanceof Error ? error.message : error
        });
      }
    };
  }, [mapboxInstance, layer]);

  // Update source data
  useEffect(() => {
    if (!mapboxInstance || !layer || layer.sourceType !== 'geojson') return;

    try {
      const source = mapboxInstance.getSource(layer.id) as mapboxgl.GeoJSONSource;
      if (source && layer.sourceData) {
        source.setData(layer.sourceData);
        logger.info('Updated source data', { layerId: layer.id });
      }
    } catch (error) {
      logger.error('Error updating source data', {
        layerId: layer.id,
        error: error instanceof Error ? error.message : error
      });
    }
  }, [mapboxInstance, layer?.sourceData]);

  // Update layer visibility
  useEffect(() => {
    if (!mapboxInstance || !layer) return;

    try {
      if (mapboxInstance.getLayer(layer.id)) {
        mapboxInstance.setLayoutProperty(layer.id, 'visibility', layer.visible ? 'visible' : 'none');
        logger.info('Updated layer visibility', { layerId: layer.id, visible: layer.visible });
      }
    } catch (error) {
      logger.error('Error updating layer visibility', {
        layerId: layer.id,
        error: error instanceof Error ? error.message : error
      });
    }
  }, [mapboxInstance, layer?.visible]);

  return (
    <div>
      {/* Render your layer components here */}
    </div>
  );
};

export default MapLayer; 