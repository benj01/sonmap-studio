import React, { useEffect, useState } from 'react';
import Map, { Source, Layer, ViewStateChangeEvent } from 'react-map-gl';
import { COORDINATE_SYSTEMS } from '../utils/coordinate-systems';
import { GeoFeatureCollection } from '../../../types/geo';

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
  coordinateSystem,
  visibleLayers = []
}: PreviewMapProps) {
  const [viewState, setViewState] = useState({
    longitude: 0,
    latitude: 0,
    zoom: 1,
    bearing: 0,
    pitch: 0
  });

  useEffect(() => {
    if (bounds) {
      // Convert bounds to center point if needed
      if (coordinateSystem === COORDINATE_SYSTEMS.SWISS_LV95) {
        // Convert Swiss coordinates to WGS84 for the map
        // This would need proper coordinate transformation
        // For now, we'll just use a rough approximation
        const swissToWGS84 = (x: number, y: number) => ({
          lng: (x - 2600000) / 1000000 * 7.43861 + 8.23,
          lat: (y - 1200000) / 1000000 * 6.37758 + 46.82
        });

        const center = swissToWGS84(
          (bounds.minX + bounds.maxX) / 2,
          (bounds.minY + bounds.maxY) / 2
        );

        // Calculate zoom level based on bounds extent
        const width = bounds.maxX - bounds.minX;
        const height = bounds.maxY - bounds.minY;
        const maxDimension = Math.max(width, height);
        const zoom = Math.floor(14 - Math.log2(maxDimension / 1000));

        setViewState(prev => ({
          ...prev,
          longitude: center.lng,
          latitude: center.lat,
          zoom: Math.min(Math.max(zoom, 1), 20) // Clamp zoom between 1 and 20
        }));
      } else {
        // For WGS84 coordinates
        const width = bounds.maxX - bounds.minX;
        const height = bounds.maxY - bounds.minY;
        const maxDimension = Math.max(width, height);
        const zoom = Math.floor(14 - Math.log2(maxDimension));

        setViewState(prev => ({
          ...prev,
          longitude: (bounds.minX + bounds.maxX) / 2,
          latitude: (bounds.minY + bounds.maxY) / 2,
          zoom: Math.min(Math.max(zoom, 1), 20) // Clamp zoom between 1 and 20
        }));
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
        'circle-radius': 4,
        'circle-color': '#007cbf',
        'circle-opacity': 0.8,
        'circle-stroke-width': 1,
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

  const renderLayers = () => {
    if (!preview?.features?.length) return null;

    // Filter features by visible layers
    const visibleFeatures = preview.features.filter(f => 
      visibleLayers.length === 0 || // Show all if no layers specified
      (f.properties?.layer && visibleLayers.includes(f.properties.layer))
    );

    // Group features by geometry type
    const pointFeatures = {
      type: 'FeatureCollection',
      features: visibleFeatures.filter(f => 
        f.geometry.type === 'Point'
      )
    };

    const lineFeatures = {
      type: 'FeatureCollection',
      features: visibleFeatures.filter(f => 
        f.geometry.type === 'LineString'
      )
    };

    const polygonFeatures = {
      type: 'FeatureCollection',
      features: visibleFeatures.filter(f => 
        f.geometry.type === 'Polygon'
      )
    };

    return (
      <>
        {pointFeatures.features.length > 0 && (
          <Source type="geojson" data={pointFeatures}>
            <Layer {...layerStyles.point} />
          </Source>
        )}

        {lineFeatures.features.length > 0 && (
          <Source type="geojson" data={lineFeatures}>
            <Layer {...layerStyles.line} />
          </Source>
        )}

        {polygonFeatures.features.length > 0 && (
          <Source type="geojson" data={polygonFeatures}>
            <Layer {...layerStyles.polygon} />
            <Layer {...layerStyles.polygonOutline} />
          </Source>
        )}
      </>
    );
  };

  return (
    <div className="h-full w-full relative">
      <Map
        {...viewState}
        onMove={onMove}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/light-v11"
        mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
      >
        {renderLayers()}
      </Map>
    </div>
  );
}
