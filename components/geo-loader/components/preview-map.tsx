import React, { useEffect, useState, useMemo } from 'react';
import Map, { Source, Layer, ViewStateChangeEvent, AttributionControl } from 'react-map-gl';
import { COORDINATE_SYSTEMS, createTransformer } from '../utils/coordinate-systems';
import { GeoFeatureCollection, GeoFeature, Point, LineString, Polygon } from '../../../types/geo';

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
  const transformCoordinates = (coordinates: number[], transformer: any): [number, number] => {
    try {
      const transformed = transformer.transform({ x: coordinates[0], y: coordinates[1] });
      return [transformed.x, transformed.y];
    } catch (error) {
      console.error('Error transforming coordinates:', error);
      return coordinates as [number, number];
    }
  };

  const transformGeometry = (geometry: Point | LineString | Polygon, transformer: any): Point | LineString | Polygon => {
    try {
      switch (geometry.type) {
        case 'Point':
          return {
            type: 'Point',
            coordinates: transformCoordinates(geometry.coordinates, transformer)
          };
        case 'LineString':
          return {
            type: 'LineString',
            coordinates: geometry.coordinates.map(coord => transformCoordinates(coord, transformer))
          };
        case 'Polygon':
          return {
            type: 'Polygon',
            coordinates: geometry.coordinates.map(ring => 
              ring.map(coord => transformCoordinates(coord, transformer))
            )
          };
        default:
          return geometry;
      }
    } catch (error) {
      console.error('Error transforming geometry:', error);
      return geometry;
    }
  };

  // Memoize transformed features to prevent unnecessary recalculations
  const transformedFeatures = useMemo(() => {
    if (!preview?.features) return [];

    let features = preview.features;
    if (coordinateSystem && coordinateSystem !== COORDINATE_SYSTEMS.WGS84) {
      try {
        console.debug('Transforming coordinates from', coordinateSystem, 'to WGS84');
        const transformer = createTransformer(coordinateSystem, COORDINATE_SYSTEMS.WGS84);
        features = features.map(feature => ({
          ...feature,
          geometry: transformGeometry(feature.geometry, transformer)
        }));
      } catch (error) {
        console.error('Error transforming coordinates:', error);
      }
    }
    return features;
  }, [preview, coordinateSystem]);

  // Memoize filtered features by visibility
  const { pointFeatures, lineFeatures, polygonFeatures } = useMemo(() => {
    // Filter features by visible layers if specified, otherwise show all features
    const visibleFeatures = visibleLayers.length > 0
      ? transformedFeatures.filter(f => 
          f.properties?.layer && visibleLayers.includes(f.properties.layer)
        )
      : transformedFeatures;

    // Log visibility info for debugging
    console.debug('Feature visibility:', {
      totalFeatures: transformedFeatures.length,
      visibleFeatures: visibleFeatures.length,
      visibleLayers
    });

    // Group features by geometry type
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
    if (bounds) {
      try {
        // Transform bounds if needed
        let transformedBounds = bounds;
        if (coordinateSystem && coordinateSystem !== COORDINATE_SYSTEMS.WGS84) {
          console.debug('Transforming bounds from', coordinateSystem, 'to WGS84');
          const transformer = createTransformer(coordinateSystem, COORDINATE_SYSTEMS.WGS84);
          transformedBounds = transformer.transformBounds(bounds);
        }

        // Calculate center
        const center = {
          lng: (transformedBounds.minX + transformedBounds.maxX) / 2,
          lat: (transformedBounds.minY + transformedBounds.maxY) / 2
        };

        // Calculate zoom level based on bounds extent
        const width = Math.abs(transformedBounds.maxX - transformedBounds.minX);
        const height = Math.abs(transformedBounds.maxY - transformedBounds.minY);
        const maxDimension = Math.max(width, height);
        
        // Adjust zoom calculation based on coordinate system
        let zoom;
        if (coordinateSystem === COORDINATE_SYSTEMS.SWISS_LV95) {
          // For Swiss coordinates (in meters)
          zoom = Math.floor(14 - Math.log2(maxDimension / 1000));
        } else {
          // For WGS84 coordinates (in degrees)
          zoom = Math.floor(14 - Math.log2(maxDimension));
        }

        console.debug('Setting view state:', { center, zoom });
        setViewState(prev => ({
          ...prev,
          longitude: center.lng,
          latitude: center.lat,
          zoom: Math.min(Math.max(zoom, 1), 20) // Clamp zoom between 1 and 20
        }));
      } catch (error) {
        console.error('Error setting map view state:', error);
      }
    }
  }, [bounds, coordinateSystem]);

  const onMove = (evt: ViewStateChangeEvent) => {
    setViewState(evt.viewState);
  };

  // Enhanced style configuration for different geometry types
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
      {/* Map container with lower z-index */}
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

          {/* Attribution with lower z-index */}
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
