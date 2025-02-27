import { RasterLayerSpecification, RasterSourceSpecification } from 'mapbox-gl';
import { MapLayer } from './MapLayer';

export interface RasterLayerProps {
  id: string;
  tiles: string[];
  tileSize?: number;
  minzoom?: number;
  maxzoom?: number;
  bounds?: [number, number, number, number];
  scheme?: 'xyz' | 'tms';
  attribution?: string;
  layer?: Omit<RasterLayerSpecification, 'id' | 'source' | 'type'>;
  initialVisibility?: boolean;
  beforeId?: string;
}

export function RasterLayer({
  id,
  tiles,
  tileSize = 256,
  minzoom,
  maxzoom,
  bounds,
  scheme,
  attribution,
  layer = {},
  initialVisibility = true,
  beforeId,
}: RasterLayerProps) {
  const source = {
    id: `${id}-source`,
    data: {
      type: 'raster' as const,
      tiles,
      tileSize,
      minzoom,
      maxzoom,
      bounds,
      scheme,
      attribution,
    } satisfies RasterSourceSpecification,
  };

  return (
    <MapLayer
      id={id}
      source={source}
      layer={{
        type: 'raster',
        ...layer,
      }}
      initialVisibility={initialVisibility}
      beforeId={beforeId}
    />
  );
} 