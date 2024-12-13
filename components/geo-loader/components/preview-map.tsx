// components/geo-loader/components/preview-map.tsx

import React, { useEffect, useState } from 'react';
import Map, { Source, Layer, ViewStateChangeEvent } from 'react-map-gl';
import { Card } from '@/components/ui/card';
import { COORDINATE_SYSTEMS } from '../utils/coordinate-systems';

interface PreviewMapProps {
  preview: any;
  bounds?: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  coordinateSystem?: string;
}

export function PreviewMap({ 
  preview, 
  bounds, 
  coordinateSystem 
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

        setViewState(prev => ({
          ...prev,
          longitude: center.lng,
          latitude: center.lat,
          zoom: 10 // Adjust zoom based on bounds extent
        }));
      } else {
        // For WGS84 coordinates
        setViewState(prev => ({
          ...prev,
          longitude: (bounds.minX + bounds.maxX) / 2,
          latitude: (bounds.minY + bounds.maxY) / 2,
          zoom: 10 // Adjust zoom based on bounds extent
        }));
      }
    }
  }, [bounds, coordinateSystem]);

  const onMove = (evt: ViewStateChangeEvent) => {
    setViewState(evt.viewState);
  };

  // Style configuration for different geometry types
  const layerStyles = {
    point: {
      type: 'circle',
      paint: {
        'circle-radius': 4,
        'circle-color': '#007cbf',
        'circle-opacity': 0.8
      }
    },
    line: {
      type: 'line',
      paint: {
        'line-color': '#007cbf',
        'line-width': 2
      }
    },
    polygon: {
      type: 'fill',
      paint: {
        'fill-color': '#007cbf',
        'fill-opacity': 0.4
      }
    }
  } as const;

  const renderLayers = () => {
    if (!preview?.features?.length) return null;

    // Group features by geometry type
    const pointFeatures = {
      type: 'FeatureCollection',
      features: preview.features.filter((f: any) => 
        f.geometry.type === 'Point'
      )
    };

    const lineFeatures = {
      type: 'FeatureCollection',
      features: preview.features.filter((f: any) => 
        f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString'
      )
    };

    const polygonFeatures = {
      type: 'FeatureCollection',
      features: preview.features.filter((f: any) => 
        f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'
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
          </Source>
        )}
      </>
    );
  };

  return (
    <Card className="w-full">
      <div className="h-96 relative">
        <Map
          {...viewState}
          onMove={onMove}
          mapStyle="mapbox://styles/mapbox/light-v11"
          mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
        >
          {renderLayers()}
        </Map>
      </div>
    </Card>
  );
}