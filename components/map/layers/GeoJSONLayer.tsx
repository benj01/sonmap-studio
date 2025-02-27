import { FillLayerSpecification, LineLayerSpecification, CircleLayerSpecification, GeoJSONSourceSpecification } from 'mapbox-gl';
import { MapLayer } from './MapLayer';

export interface GeoJSONLayerProps {
  id: string;
  data: GeoJSON.FeatureCollection;
  fillLayer?: Omit<FillLayerSpecification, 'id' | 'source' | 'type'>;
  lineLayer?: Omit<LineLayerSpecification, 'id' | 'source' | 'type'>;
  circleLayer?: Omit<CircleLayerSpecification, 'id' | 'source' | 'type'>;
  initialVisibility?: boolean;
  beforeId?: string;
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
  const source = {
    id: `${id}-source`,
    data: {
      type: 'geojson' as const,
      data,
    } satisfies GeoJSONSourceSpecification,
  };

  return (
    <>
      {fillLayer && (
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
      {lineLayer && (
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
      {circleLayer && (
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