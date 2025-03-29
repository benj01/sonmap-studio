import { useLayers } from '@/store/layers/hooks';
import { useLayerData } from '../hooks/useLayerData';
import { GeoJSONLayer } from '../layers/GeoJSONLayer';
import { LogManager } from '@/core/logging/log-manager';
import type { FeatureCollection, Geometry, GeoJsonProperties, Feature } from 'geojson';
import { useMemo } from 'react';
import type { Layer } from '@/store/layers/types';

const SOURCE = 'MapLayers';
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

function processFeature(feature: any): Feature<Geometry> | null {
  // Case 1: Feature already has valid geometry
  if (feature.geometry?.type && feature.geometry?.coordinates) {
    return feature as Feature<Geometry>;
  }

  // Case 2: Geometry is in top-level geojson field
  if (feature.geojson) {
    try {
      const parsedGeometry = typeof feature.geojson === 'string' 
        ? JSON.parse(feature.geojson)
        : feature.geojson;

      return {
        type: 'Feature',
        geometry: parsedGeometry,
        properties: feature.properties || {},
        id: feature.id
      };
    } catch (e) {
      logger.warn('Failed to parse top-level geojson', {
        featureId: feature.id,
        error: e
      });
    }
  }

  // Case 3: Geometry is nested in properties.geojson
  if (feature.properties?.geojson) {
    try {
      const parsedGeometry = typeof feature.properties.geojson === 'string'
        ? JSON.parse(feature.properties.geojson)
        : feature.properties.geojson;

      return {
        type: 'Feature',
        geometry: parsedGeometry,
        properties: { ...feature.properties, geojson: undefined },
        id: feature.id
      };
    } catch (e) {
      logger.warn('Failed to parse nested geojson', {
        featureId: feature.id,
        error: e
      });
    }
  }

  return null;
}

function LayerRenderer({ layer }: { layer: Layer }) {
  if (!layer.metadata) return null;

  const { data, loading, error } = useLayerData(layer.id);

  if (loading) {
    return null;
  }

  if (error) {
    logger.error('Layer data error', { layerId: layer.id, error });
    return null;
  }

  if (!data?.features?.length) {
    return null;
  }

  // Process and validate features
  const processedFeatures = data.features
    .map(processFeature)
    .filter((f): f is Feature<Geometry> => f !== null);

  if (!processedFeatures.length) {
    logger.warn('No valid features after processing', { layerId: layer.id });
    return null;
  }

  // Create standardized FeatureCollection
  const featureCollection: FeatureCollection<Geometry, GeoJsonProperties> = {
    type: 'FeatureCollection',
    features: processedFeatures
  };

  logger.debug('Layer features processed', {
    layerId: layer.id,
    originalCount: data.features.length,
    processedCount: processedFeatures.length,
    geometryTypes: processedFeatures.reduce((acc: Record<string, number>, f) => {
      const type = f.geometry.type;
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {})
  });

  return (
    <GeoJSONLayer
      key={layer.id}
      id={layer.id}
      data={featureCollection}
      initialVisibility={layer.visible}
      fillLayer={{
        paint: {
          'fill-color': '#088',
          'fill-opacity': 0.4,
          'fill-outline-color': '#000'
        }
      }}
      lineLayer={{
        paint: {
          'line-color': '#088',
          'line-width': 2
        }
      }}
      circleLayer={{
        paint: {
          'circle-color': '#088',
          'circle-radius': 5,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#000'
        }
      }}
    />
  );
}

export function MapLayers() {
  const { layers } = useLayers();

  const validLayers = useMemo(() => 
    layers.filter(layer => layer.metadata), 
    [layers]
  );

  return (
    <>
      {validLayers.map((layer) => (
        <LayerRenderer key={layer.id} layer={layer} />
      ))}
    </>
  );
} 