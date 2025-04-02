import { useLayers } from '@/store/layers/hooks';
import { useLayerData } from '../hooks/useLayerData';
import { GeoJSONLayer } from '../layers/GeoJSONLayer';
import { LogManager } from '@/core/logging/log-manager';
import type { FeatureCollection, Geometry, GeoJsonProperties, Feature } from 'geojson';
import { useMemo, memo, useRef } from 'react';
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
  logger.debug('Processing feature', {
    featureId: feature.id,
    hasDirectGeometry: !!feature.geometry,
    hasGeojsonField: !!feature.geojson,
    hasNestedGeojson: !!feature.properties?.geojson
  });

  // Case 1: Feature already has valid geometry
  if (feature.geometry?.type && feature.geometry?.coordinates) {
    logger.debug('Feature has direct geometry', {
      featureId: feature.id,
      geometryType: feature.geometry.type
    });
    return feature as Feature<Geometry>;
  }

  // Case 2: Geometry is in top-level geojson field
  if (feature.geojson) {
    try {
      const parsedGeometry = typeof feature.geojson === 'string' 
        ? JSON.parse(feature.geojson)
        : feature.geojson;

      logger.debug('Parsed geometry from top-level geojson', {
        featureId: feature.id,
        geometryType: parsedGeometry.type
      });

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

      logger.debug('Parsed geometry from properties.geojson', {
        featureId: feature.id,
        geometryType: parsedGeometry.type
      });

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

  logger.warn('No valid geometry found for feature', { featureId: feature.id });
  return null;
}

// Memoized LayerRenderer component
const LayerRenderer = memo(({ layer }: { layer: Layer }) => {
  const renderCount = useRef(0);
  renderCount.current += 1;

  logger.debug('LayerRenderer render', {
    layerId: layer.id,
    renderCount: renderCount.current,
    timestamp: new Date().toISOString()
  });

  const { data, loading, error } = useLayerData(layer.id);

  if (loading) {
    return null;
  }

  if (error) {
    logger.error('Error loading layer data', { layerId: layer.id, error });
    return null;
  }

  if (!data?.features?.length) {
    return null;
  }

  logger.info('Processing features for layer', {
    layerId: layer.id,
    originalFeatureCount: data.features.length
  });

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

  logger.info('Created feature collection', {
    layerId: layer.id,
    originalCount: data.features.length,
    processedCount: processedFeatures.length,
    geometryTypes: processedFeatures.reduce((acc: Record<string, number>, f) => {
      const type = f.geometry.type;
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {})
  });

  // Extract layer styles from metadata
  const style = layer.metadata?.style;
  const fillLayer = style?.paint ? { paint: style.paint } : {
    paint: {
      'fill-color': '#088',
      'fill-opacity': 0.4,
      'fill-outline-color': '#000'
    }
  };
  const lineLayer = style?.paint ? { paint: style.paint } : {
    paint: {
      'line-color': '#088',
      'line-width': 2
    }
  };
  const circleLayer = style?.paint ? { paint: style.paint } : {
    paint: {
      'circle-color': '#088',
      'circle-radius': 5,
      'circle-stroke-width': 2,
      'circle-stroke-color': '#000'
    }
  };

  return (
    <GeoJSONLayer
      id={layer.id}
      data={featureCollection}
      fillLayer={fillLayer}
      lineLayer={lineLayer}
      circleLayer={circleLayer}
      initialVisibility={layer.visible}
    />
  );
});

LayerRenderer.displayName = 'LayerRenderer';

export function MapLayers() {
  const renderCount = useRef(0);
  renderCount.current += 1;

  logger.warn('MapLayers render start', {
    renderCount: renderCount.current,
    timestamp: new Date().toISOString()
  });

  const { layers } = useLayers();

  // Log the layers received from the hook
  logger.debug('MapLayers received layers from hook', {
    renderCount: renderCount.current,
    layerCount: layers.length,
    layers: layers.map(l => ({
      id: l.id,
      hasMetadata: !!l.metadata,
      visible: l.visible,
      setupStatus: l.setupStatus
    }))
  });

  // Memoize the valid layers array to prevent unnecessary re-renders
  const validLayers = useMemo(() => {
    logger.debug('MapLayers computing validLayers', {
      renderCount: renderCount.current,
      inputLayerCount: layers.length
    });
    
    const valid = layers.filter(layer => layer.metadata);
    
    logger.debug('MapLayers computed validLayers', {
      renderCount: renderCount.current,
      validLayerCount: valid.length,
      validLayerIds: valid.map(l => l.id)
    });
    
    return valid;
  }, [layers]);

  logger.info('MapLayers render complete', {
    renderCount: renderCount.current,
    layerCount: layers.length,
    validLayerCount: validLayers.length,
    layers: validLayers.map(l => ({
      id: l.id,
      hasMetadata: !!l.metadata,
      visible: l.visible,
      setupStatus: l.setupStatus
    }))
  });

  return (
    <>
      {validLayers.map((layer) => (
        <LayerRenderer key={layer.id} layer={layer} />
      ))}
    </>
  );
} 