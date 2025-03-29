import { FillLayerSpecification, LineLayerSpecification, CircleLayerSpecification, GeoJSONSourceSpecification } from 'mapbox-gl';
import { MapLayer } from './MapLayer';
import { LogManager } from '@/core/logging/log-manager';
import type { Feature, Geometry } from 'geojson';
import { useMemo } from 'react';

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

  // Memoize layer specifications
  const fillLayerSpec = useMemo(() => {
    if (!geometryTypes.hasPolygons || !fillLayer) return null;
    return {
      type: 'fill' as const,
      ...fillLayer,
    };
  }, [geometryTypes.hasPolygons, fillLayer]);

  const lineLayerSpec = useMemo(() => {
    if (!geometryTypes.hasLines || !lineLayer) return null;
    return {
      type: 'line' as const,
      ...lineLayer,
    };
  }, [geometryTypes.hasLines, lineLayer]);

  const circleLayerSpec = useMemo(() => {
    if (!geometryTypes.hasPoints || !circleLayer) return null;
    return {
      type: 'circle' as const,
      ...circleLayer,
    };
  }, [geometryTypes.hasPoints, circleLayer]);

  // Early return if no data
  if (!data?.features?.length) {
    return null;
  }

  return (
    <>
      {fillLayerSpec && (
        <MapLayer
          id={`${id}-fill`}
          source={source}
          layer={fillLayerSpec}
          initialVisibility={initialVisibility}
          beforeId={beforeId}
        />
      )}
      {lineLayerSpec && (
        <MapLayer
          id={`${id}-line`}
          source={source}
          layer={lineLayerSpec}
          initialVisibility={initialVisibility}
          beforeId={beforeId}
        />
      )}
      {circleLayerSpec && (
        <MapLayer
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