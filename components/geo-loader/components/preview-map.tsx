import React, { useEffect, useState, useMemo } from 'react';
import Map, { Source, Layer, ViewStateChangeEvent, AttributionControl } from 'react-map-gl';
import { COORDINATE_SYSTEMS, createTransformer } from '../utils/coordinate-systems';
import { GeoFeatureCollection, GeoFeature, Point, LineString, Polygon } from '../../../types/geo';
import 'mapbox-gl/dist/mapbox-gl.css';

interface PreviewMapProps {
  preview: GeoFeatureCollection;
  bounds?: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  coordinateSystem?: string;
  visibleLayers?: string[];
}

type Coordinate = [number, number];
type Ring = Coordinate[];

const isValidCoordinate = (coord: any): coord is Coordinate => {
  return Array.isArray(coord) && 
         coord.length >= 2 && 
         typeof coord[0] === 'number' && 
         typeof coord[1] === 'number' &&
         isFinite(coord[0]) && 
         isFinite(coord[1]);
};

const isValidRing = (ring: any): ring is Ring => {
  return Array.isArray(ring) && 
         ring.length >= 4 && 
         ring.every(isValidCoordinate);
};

const isValidGeometry = (geometry: any): boolean => {
  if (!geometry || !geometry.type || !geometry.coordinates) return false;

  switch (geometry.type) {
    case 'Point':
      return isValidCoordinate(geometry.coordinates);
    case 'LineString':
      return Array.isArray(geometry.coordinates) && 
             geometry.coordinates.length >= 2 &&
             geometry.coordinates.every(isValidCoordinate);
    case 'Polygon':
      return Array.isArray(geometry.coordinates) && 
             geometry.coordinates.length > 0 &&
             geometry.coordinates.every(isValidRing);
    default:
      return false;
  }
};

export function PreviewMap({ 
  preview, 
  bounds, 
  coordinateSystem = COORDINATE_SYSTEMS.WGS84,
  visibleLayers = []
}: PreviewMapProps) {
  const [viewState, setViewState] = useState({
    longitude: 0,
    latitude: 0,
    zoom: 1,
    bearing: 0,
    pitch: 0
  });

  // Transform coordinates if needed
  const transformCoordinates = (coordinates: number[], transformer: any): Coordinate | null => {
    try {
      if (!isValidCoordinate(coordinates)) {
        return null;
      }

      const transformed = transformer.transform({ x: coordinates[0], y: coordinates[1] });
      if (!transformed || typeof transformed.x !== 'number' || typeof transformed.y !== 'number' ||
          !isFinite(transformed.x) || !isFinite(transformed.y)) {
        return null;
      }

      return [transformed.x, transformed.y];
    } catch (error) {
      console.error('Error transforming coordinates:', error);
      return null;
    }
  };

  const transformGeometry = (geometry: Point | LineString | Polygon, transformer: any): Point | LineString | Polygon | null => {
    if (!isValidGeometry(geometry)) {
      return null;
    }

    try {
      switch (geometry.type) {
        case 'Point': {
          const coords = transformCoordinates(geometry.coordinates, transformer);
          return coords ? { type: 'Point', coordinates: coords } : null;
        }
        case 'LineString': {
          const coords = geometry.coordinates
            .map(coord => transformCoordinates(coord, transformer))
            .filter((coord): coord is Coordinate => coord !== null);
          return coords.length >= 2 ? { type: 'LineString', coordinates: coords } : null;
        }
        case 'Polygon': {
          const rings = geometry.coordinates
            .map(ring => {
              const coords = ring
                .map(coord => transformCoordinates(coord, transformer))
                .filter((coord): coord is Coordinate => coord !== null);
              return coords.length >= 4 ? coords : null;
            })
            .filter((ring): ring is Ring => ring !== null);
          return rings.length > 0 ? { type: 'Polygon', coordinates: rings } : null;
        }
        default:
          return null;
      }
    } catch (error) {
      console.error('Error transforming geometry:', error);
      return null;
    }
  };

  // Memoize transformed features to prevent unnecessary recalculations
  const transformedFeatures = useMemo(() => {
    if (!preview?.features) return [];

    let features = preview.features.filter(f => isValidGeometry(f.geometry));
    
    if (coordinateSystem && coordinateSystem !== COORDINATE_SYSTEMS.WGS84) {
      try {
        const transformer = createTransformer(coordinateSystem, COORDINATE_SYSTEMS.WGS84);
        features = features
          .map(feature => {
            const transformedGeometry = transformGeometry(feature.geometry, transformer);
            return transformedGeometry ? { ...feature, geometry: transformedGeometry } : null;
          })
          .filter((f): f is GeoFeature => f !== null);
      } catch (error) {
        console.error('Error transforming features:', error);
        return [];
      }
    }
    return features;
  }, [preview, coordinateSystem]);

  // Memoize filtered features by visibility
  const { pointFeatures, lineFeatures, polygonFeatures } = useMemo(() => {
    const visibleFeatures = visibleLayers.length > 0
      ? transformedFeatures.filter(f => 
          f.properties?.layer && visibleLayers.includes(f.properties.layer)
        )
      : transformedFeatures;

    return {
      pointFeatures: {
        type: 'FeatureCollection' as const,
        features: visibleFeatures.filter(f => f.geometry.type === 'Point')
      },
      lineFeatures: {
        type: 'FeatureCollection' as const,
        features: visibleFeatures.filter(f => f.geometry.type === 'LineString')
      },
      polygonFeatures: {
        type: 'FeatureCollection' as const,
        features: visibleFeatures.filter(f => f.geometry.type === 'Polygon')
      }
    };
  }, [transformedFeatures, visibleLayers]);

  useEffect(() => {
    if (!bounds) return;

    try {
      let transformedBounds = bounds;
      if (coordinateSystem && coordinateSystem !== COORDINATE_SYSTEMS.WGS84) {
        const transformer = createTransformer(coordinateSystem, COORDINATE_SYSTEMS.WGS84);
        try {
          const result = transformer.transformBounds(bounds);
          if (!result) {
            console.warn('Failed to transform bounds');
            return;
          }
          transformedBounds = result;
        } catch (error) {
          console.error('Error transforming bounds:', error);
          return;
        }
      }

      if (!isFinite(transformedBounds.minX) || !isFinite(transformedBounds.minY) ||
          !isFinite(transformedBounds.maxX) || !isFinite(transformedBounds.maxY)) {
        console.warn('Invalid bounds:', transformedBounds);
        return;
      }

      const center = {
        lng: (transformedBounds.minX + transformedBounds.maxX) / 2,
        lat: (transformedBounds.minY + transformedBounds.maxY) / 2
      };

      if (!isFinite(center.lng) || !isFinite(center.lat)) {
        console.warn('Invalid center coordinates:', center);
        return;
      }

      const width = Math.abs(transformedBounds.maxX - transformedBounds.minX);
      const height = Math.abs(transformedBounds.maxY - transformedBounds.minY);
      const maxDimension = Math.max(width, height);
      
      let zoom = coordinateSystem === COORDINATE_SYSTEMS.SWISS_LV95 || 
                coordinateSystem === COORDINATE_SYSTEMS.SWISS_LV03
        ? Math.floor(14 - Math.log2(maxDimension / 1000))
        : Math.floor(14 - Math.log2(maxDimension));

      zoom = Math.min(Math.max(zoom, 1), 20);

      setViewState(prev => ({
        ...prev,
        longitude: center.lng,
        latitude: center.lat,
        zoom
      }));
    } catch (error) {
      console.error('Error setting map view state:', error);
    }
  }, [bounds, coordinateSystem]);

  const onMove = (evt: ViewStateChangeEvent) => {
    setViewState(evt.viewState);
  };

  const layerStyles = {
    point: {
      type: 'circle',
      paint: {
        'circle-radius': 6,
        'circle-color': '#007cbf',
        'circle-opacity': 0.8,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#fff'
      }
    },
    line: {
      type: 'line',
      paint: {
        'line-color': '#007cbf',
        'line-width': 2,
        'line-opacity': 0.8
      }
    },
    polygon: {
      type: 'fill',
      paint: {
        'fill-color': '#007cbf',
        'fill-opacity': 0.4,
        'fill-outline-color': '#fff'
      }
    },
    polygonOutline: {
      type: 'line',
      paint: {
        'line-color': '#007cbf',
        'line-width': 1,
        'line-opacity': 0.8
      }
    }
  } as const;

  return (
    <div className="h-full w-full relative">
      <div className="absolute inset-0 z-0">
        <Map
          {...viewState}
          onMove={onMove}
          style={{ width: '100%', height: '100%' }}
          mapStyle="mapbox://styles/mapbox/light-v11"
          mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
          attributionControl={false}
        >
          {pointFeatures.features.length > 0 && (
            <Source type="geojson" data={pointFeatures}>
              <Layer id="points" {...layerStyles.point} />
            </Source>
          )}

          {lineFeatures.features.length > 0 && (
            <Source type="geojson" data={lineFeatures}>
              <Layer id="lines" {...layerStyles.line} />
            </Source>
          )}

          {polygonFeatures.features.length > 0 && (
            <Source type="geojson" data={polygonFeatures}>
              <Layer id="polygons" {...layerStyles.polygon} />
              <Layer id="polygon-outlines" {...layerStyles.polygonOutline} />
            </Source>
          )}

          <div className="absolute bottom-0 right-0 z-10">
            <AttributionControl
              compact={true}
              style={{
                margin: '0 8px 8px 0',
                backgroundColor: 'rgba(255, 255, 255, 0.7)',
                fontSize: '10px'
              }}
            />
          </div>
        </Map>
      </div>
    </div>
  );
}
