import { FillLayerSpecification, LineLayerSpecification, CircleLayerSpecification, GeoJSONSourceSpecification } from 'mapbox-gl';
import { MapLayer } from './MapLayer';
import { LogManager } from '@/core/logging/log-manager';
import type { Feature, Geometry } from 'geojson';
import { useMemo, useEffect } from 'react';
import { useLayerStore } from '@/store/layers/layerStore';

const SOURCE = 'GeoJSONLayer';
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

export interface GeoJSONLayerProps {
  id: string;
  data: GeoJSON.FeatureCollection;
  fillLayer?: Omit<FillLayerSpecification, 'id' | 'source' | 'type'>;
  lineLayer?: Omit<LineLayerSpecification, 'id' | 'source' | 'type'>;
  circleLayer?: Omit<CircleLayerSpecification, 'id' | 'source' | 'type'>;
  initialVisibility?: boolean;
  beforeId?: string;
}

type GeometryTypes = {
  hasPolygons: boolean;
  hasLines: boolean;
  hasPoints: boolean;
};

function analyzeGeometryTypes(features: Feature<Geometry>[]): GeometryTypes {
  const types = {
    hasPolygons: false,
    hasLines: false,
    hasPoints: false
  };

  features.forEach(feature => {
    if (!feature.geometry) return;

    switch (feature.geometry.type) {
      case 'Polygon':
      case 'MultiPolygon':
        types.hasPolygons = true;
        break;
      case 'LineString':
      case 'MultiLineString':
        types.hasLines = true;
        break;
      case 'Point':
      case 'MultiPoint':
        types.hasPoints = true;
        break;
      default:
        logger.warn('Unsupported geometry type', {
          type: feature.geometry.type,
          featureId: feature.id
        });
    }
  });

  logger.debug('Geometry types analysis', {
    types,
    featureCount: features.length
  });

  return types;
}

export function GeoJSONLayer({
  id,
  data,
  fillLayer,
  lineLayer,
  circleLayer,
  initialVisibility = true,
  beforeId,
}: GeoJSONLayerProps) {
  // Memoize geometry analysis
  const geometryTypes = useMemo(() => {
    if (!data?.features?.length) {
      logger.warn('No features in data', { id });
      return { hasPolygons: false, hasLines: false, hasPoints: false };
    }
    return analyzeGeometryTypes(data.features);
  }, [data, id]);

  // Log current state
  logger.info('Creating GeoJSON layer', {
    id,
    featureCount: data?.features?.length || 0,
    geometryTypes,
    hasStyles: {
      fill: !!fillLayer,
      line: !!lineLayer,
      circle: !!circleLayer
    }
  });

  // Memoize source configuration
  const source = useMemo(() => ({
    id: `${id}-source`,
    data: {
      type: 'geojson' as const,
      data,
    } satisfies GeoJSONSourceSpecification,
  }), [id, data]);

  // Add effect to analyze geometry types and update layer style
  useEffect(() => {
    if (!data?.features?.length) {
      logger.warn('No features in data for geometry analysis', { id });
      return;
    }

    const geometryTypes = analyzeGeometryTypes(data.features);
    logger.debug('Analyzed geometry types for layer', {
      id,
      geometryTypes,
      featureCount: data.features.length
    });

    // Update layer style with geometry types
    const store = useLayerStore.getState();
    store.updateLayerStyle(id, {}, geometryTypes);
  }, [id, data]);

  // Memoize layer specifications
  const fillLayerSpec = useMemo(() => {
    if (!geometryTypes.hasPolygons || !fillLayer) return null;
    logger.debug('Creating fill layer spec', {
      id: `${id}-fill`,
      paint: fillLayer.paint,
      layout: fillLayer.layout
    });
    return {
      type: 'fill' as const,
      paint: {
        'fill-color': fillLayer.paint?.['fill-color'] || '#088',
        'fill-opacity': fillLayer.paint?.['fill-opacity'] || 0.4,
        'fill-outline-color': fillLayer.paint?.['fill-outline-color'] || '#000'
      },
      layout: fillLayer.layout || {}
    };
  }, [geometryTypes.hasPolygons, fillLayer, id]);

  const lineLayerSpec = useMemo(() => {
    if (!geometryTypes.hasLines || !lineLayer) return null;
    logger.debug('Creating line layer spec', {
      id: `${id}-line`,
      paint: lineLayer.paint,
      layout: lineLayer.layout
    });
    return {
      type: 'line' as const,
      paint: {
        'line-color': lineLayer.paint?.['line-color'] || '#088',
        'line-width': lineLayer.paint?.['line-width'] || 2
      },
      layout: lineLayer.layout || {}
    };
  }, [geometryTypes.hasLines, lineLayer, id]);

  const circleLayerSpec = useMemo(() => {
    if (!geometryTypes.hasPoints || !circleLayer) return null;
    logger.debug('Creating circle layer spec', {
      id: `${id}-circle`,
      paint: circleLayer.paint,
      layout: circleLayer.layout
    });
    return {
      type: 'circle' as const,
      paint: {
        'circle-color': circleLayer.paint?.['circle-color'] || '#088',
        'circle-radius': circleLayer.paint?.['circle-radius'] || 5,
        'circle-stroke-width': circleLayer.paint?.['circle-stroke-width'] || 2,
        'circle-stroke-color': circleLayer.paint?.['circle-stroke-color'] || '#000'
      },
      layout: circleLayer.layout || {}
    };
  }, [geometryTypes.hasPoints, circleLayer, id]);

  // Early return if no data
  if (!data?.features?.length) {
    logger.debug('No features to render', { id });
    return null;
  }

  logger.debug('Rendering layer components', {
    id,
    hasFill: !!fillLayerSpec,
    hasLine: !!lineLayerSpec,
    hasCircle: !!circleLayerSpec,
    source: source.id
  });

  return (
    <>
      {fillLayerSpec && (
        <MapLayer
          key={`${id}-fill`}
          id={`${id}-fill`}
          source={source}
          layer={fillLayerSpec}
          initialVisibility={initialVisibility}
          beforeId={beforeId}
        />
      )}
      {lineLayerSpec && (
        <MapLayer
          key={`${id}-line`}
          id={`${id}-line`}
          source={source}
          layer={lineLayerSpec}
          initialVisibility={initialVisibility}
          beforeId={beforeId}
        />
      )}
      {circleLayerSpec && (
        <MapLayer
          key={`${id}-circle`}
          id={`${id}-circle`}
          source={source}
          layer={circleLayerSpec}
          initialVisibility={initialVisibility}
          beforeId={beforeId}
        />
      )}
    </>
  );
} 