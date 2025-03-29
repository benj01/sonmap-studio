import { FillLayerSpecification, LineLayerSpecification, CircleLayerSpecification, GeoJSONSourceSpecification } from 'mapbox-gl';
import { MapLayer } from './MapLayer';
import { LogManager } from '@/core/logging/log-manager';
import type { Feature, Geometry } from 'geojson';

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
  if (!data?.features?.length) {
    logger.warn('No features in data', { id });
    return null;
  }

  const geometryTypes = analyzeGeometryTypes(data.features);
  
  logger.info('Creating GeoJSON layer', {
    id,
    featureCount: data.features.length,
    geometryTypes,
    hasStyles: {
      fill: !!fillLayer,
      line: !!lineLayer,
      circle: !!circleLayer
    }
  });

  const source = {
    id: `${id}-source`,
    data: {
      type: 'geojson' as const,
      data,
    } satisfies GeoJSONSourceSpecification,
  };

  return (
    <>
      {geometryTypes.hasPolygons && fillLayer && (
        <MapLayer
          id={`${id}-fill`}
          source={source}
          layer={{
            type: 'fill',
            ...fillLayer,
          }}
          initialVisibility={initialVisibility}
          beforeId={beforeId}
        />
      )}
      {geometryTypes.hasLines && lineLayer && (
        <MapLayer
          id={`${id}-line`}
          source={source}
          layer={{
            type: 'line',
            ...lineLayer,
          }}
          initialVisibility={initialVisibility}
          beforeId={beforeId}
        />
      )}
      {geometryTypes.hasPoints && circleLayer && (
        <MapLayer
          id={`${id}-circle`}
          source={source}
          layer={{
            type: 'circle',
            ...circleLayer,
          }}
          initialVisibility={initialVisibility}
          beforeId={beforeId}
        />
      )}
    </>
  );
} 