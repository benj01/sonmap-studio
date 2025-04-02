import { useLayers } from '@/store/layers/hooks';
import { useLayerData } from '../hooks/useLayerData';
import { GeoJSONLayer } from '../layers/GeoJSONLayer';
import { LogManager } from '@/core/logging/log-manager';
import type { FeatureCollection, Geometry, GeoJsonProperties, Feature } from 'geojson';
import { useMemo, memo, useRef } from 'react';
import type { Layer } from '@/store/layers/types';
import isEqual from 'lodash/isEqual';
import { useLayerStore } from '@/store/layers/layerStore';

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

// Helper function to analyze geometry types
function analyzeGeometryTypes(features: Feature<Geometry>[]): { hasPolygons: boolean; hasLines: boolean; hasPoints: boolean } {
  const types = {
    hasPolygons: false,
    hasLines: false,
    hasPoints: false
  };

  for (const feature of features) {
    const geometryType = feature.geometry.type.toLowerCase();
    if (geometryType.includes('polygon')) {
      types.hasPolygons = true;
    } else if (geometryType.includes('line') || geometryType.includes('linestring')) {
      types.hasLines = true;
    } else if (geometryType.includes('point')) {
      types.hasPoints = true;
    }
  }

  return types;
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

  // Process and validate features - moved inside useMemo to maintain hook order
  const { processedFeatureCollection, isValid } = useMemo(() => {
    if (loading || error || !data?.features?.length) {
      return { processedFeatureCollection: null, isValid: false };
    }

    logger.info('Processing features for layer', {
      layerId: layer.id,
      originalFeatureCount: data.features.length
    });

    const processedFeatures = data.features
      .map(processFeature)
      .filter((f): f is Feature<Geometry> => f !== null);

    if (!processedFeatures.length) {
      logger.warn('No valid features after processing', { layerId: layer.id });
      return { processedFeatureCollection: null, isValid: false };
    }

    return {
      processedFeatureCollection: {
        type: 'FeatureCollection' as const,
        features: processedFeatures
      },
      isValid: true
    };
  }, [data?.features, layer.id, loading, error]);

  // Extract layer styles from metadata
  const { styles, baseLayerId } = useMemo(() => {
    const paint = layer.metadata?.style?.paint || {};
    const baseId = layer.id.replace(/-line$|-fill$|-circle$/, '');
    
    logger.debug('Extracting layer styles', {
      layerId: layer.id,
      baseId,
      existingPaint: paint,
      geometryType: layer.metadata?.type
    });

    // Extract specific paint properties with granular defaults
    const styles = {
      fillLayer: {
        paint: {
          'fill-color': paint['fill-color'] || '#088',
          'fill-opacity': paint['fill-opacity'] || 0.4,
          'fill-outline-color': paint['fill-outline-color'] || '#000'
        }
      },
      lineLayer: {
        paint: {
          'line-color': paint['line-color'] || '#088',
          'line-width': paint['line-width'] || 2
        }
      },
      circleLayer: {
        paint: {
          'circle-color': paint['circle-color'] || '#088',
          'circle-radius': paint['circle-radius'] || 5,
          'circle-stroke-width': paint['circle-stroke-width'] || 2,
          'circle-stroke-color': paint['circle-stroke-color'] || '#000'
        }
      }
    };

    logger.debug('Extracted styles', {
      layerId: layer.id,
      baseId,
      styles,
      timestamp: new Date().toISOString()
    });

    return { styles, baseLayerId: baseId };
  }, [layer.id, layer.metadata?.style?.paint]);

  // Early return if no valid data
  if (!isValid || !processedFeatureCollection) {
    logger.debug('Skipping layer render - invalid data', {
      layerId: layer.id,
      isValid,
      hasFeatures: !!processedFeatureCollection
    });
    return null;
  }

  logger.debug('Creating GeoJSONLayer with styles', {
    layerId: layer.id,
    baseLayerId,
    hasStyle: !!layer.metadata?.style,
    styles
  });

  return (
    <GeoJSONLayer
      key={baseLayerId}
      id={baseLayerId}
      data={processedFeatureCollection}
      fillLayer={styles.fillLayer}
      lineLayer={styles.lineLayer}
      circleLayer={styles.circleLayer}
      initialVisibility={layer.visible}
    />
  );
}, (prevProps, nextProps) => {
  // Shallow equality for style changes
  const styleChanged = prevProps.layer.metadata?.style !== nextProps.layer.metadata?.style;
  const visibilityChanged = prevProps.layer.visible !== nextProps.layer.visible;
  const idChanged = prevProps.layer.id !== nextProps.layer.id;

  logger.debug('LayerRenderer memo comparison', {
    layerId: nextProps.layer.id,
    changes: {
      styleChanged,
      visibilityChanged,
      idChanged,
      prevStyle: prevProps.layer.metadata?.style,
      nextStyle: nextProps.layer.metadata?.style
    }
  });

  // Return true if nothing has changed (skip render)
  return !styleChanged && !visibilityChanged && !idChanged;
});

LayerRenderer.displayName = 'LayerRenderer';

export function MapLayers() {
  const renderCount = useRef(0);
  renderCount.current += 1;

  logger.debug('MapLayers render start', {
    renderCount: renderCount.current,
    timestamp: new Date().toISOString()
  });

  // Select primitive state parts with stable selectors
  const allIds = useLayerStore(state => state.layers.allIds);
  const byId = useLayerStore(state => state.layers.byId);
  const isInitialLoadComplete = useLayerStore(state => state.isInitialLoadComplete);

  // Memoize the layers array creation
  const layers = useMemo(() => {
    logger.debug('MapLayers: Computing layers array', {
      renderCount: renderCount.current,
      allIdsCount: allIds.length
    });
    return allIds.map(id => byId[id]);
  }, [allIds, byId]);

  // Memoize the valid layers array
  const validLayers = useMemo(() => {
    logger.debug('MapLayers computing validLayers', {
      renderCount: renderCount.current,
      inputLayerCount: layers.length,
      isInitialLoadComplete,
      layerIds: layers.map(l => l.id),
      layerStates: layers.map(l => ({
        id: l.id,
        hasMetadata: !!l.metadata,
        visible: l.visible,
        setupStatus: l.setupStatus
      }))
    });
    
    const valid = layers.filter(layer => layer.metadata);
    
    logger.debug('MapLayers computed validLayers', {
      renderCount: renderCount.current,
      validLayerCount: valid.length,
      validLayerIds: valid.map(l => l.id),
      validLayerStates: valid.map(l => ({
        id: l.id,
        hasMetadata: !!l.metadata,
        visible: l.visible,
        setupStatus: l.setupStatus
      }))
    });
    
    return valid;
  }, [layers, isInitialLoadComplete]);

  // Memoize the layer renderers
  const layerRenderers = useMemo(() => {
    if (!isInitialLoadComplete) {
      logger.debug('MapLayers: Initial load not complete, deferring renderer creation', {
        renderCount: renderCount.current,
        layerCount: validLayers.length
      });
      return null;
    }

    logger.debug('MapLayers: Initial load complete, creating renderers', {
      renderCount: renderCount.current,
      layerCount: validLayers.length,
      layerIds: validLayers.map(l => l.id)
    });

    return validLayers.map((layer) => (
      <LayerRenderer key={layer.id} layer={layer} />
    ));
  }, [validLayers, isInitialLoadComplete]);

  logger.debug('MapLayers render complete', {
    renderCount: renderCount.current,
    layerCount: layers.length,
    validLayerCount: validLayers.length,
    isInitialLoadComplete,
    layers: validLayers.map(l => ({
      id: l.id,
      hasMetadata: !!l.metadata,
      visible: l.visible,
      setupStatus: l.setupStatus
    }))
  });

  if (!isInitialLoadComplete) {
    logger.debug('MapLayers: Skipping render - initial load not complete', {
      renderCount: renderCount.current
    });
    return null;
  }

  return <>{layerRenderers}</>;
} 