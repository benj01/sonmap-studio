import React, { useState, useEffect } from 'react';
import { Source, Layer } from 'react-map-gl';
import { FeatureCollection, Position, LineString } from 'geojson';

const CLUSTER_RADIUS = 50;
const MIN_ZOOM_FOR_UNCLUSTERED = 14;

interface LayerProps {
  data: FeatureCollection;
}

export const PointLayer: React.FC<LayerProps> = ({ data }) => {
  if (data.features.length === 0) return null;

  return (
    <Source
      key="points"
      type="geojson"
      data={data}
      cluster={true}
      clusterMaxZoom={MIN_ZOOM_FOR_UNCLUSTERED}
      clusterRadius={CLUSTER_RADIUS}
    >
      <Layer
        id="clusters"
        type="circle"
        filter={['has', 'point_count']}
        paint={{
          'circle-color': [
            'step',
            ['get', 'point_count'],
            '#51bbd6',
            100,
            '#f1f075',
            750,
            '#f28cb1'
          ],
          'circle-radius': [
            'step',
            ['get', 'point_count'],
            20,
            100,
            30,
            750,
            40
          ]
        }}
      />

      <Layer
        id="cluster-count"
        type="symbol"
        filter={['has', 'point_count']}
        layout={{
          'text-field': '{point_count_abbreviated}',
          'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
          'text-size': 12
        }}
      />

      <Layer
        id="points"
        type="circle"
        filter={['!', ['has', 'point_count']]}
        paint={{
          'circle-color': '#11b4da',
          'circle-radius': 4,
          'circle-stroke-width': 1,
          'circle-stroke-color': '#fff'
        }}
      />
    </Source>
  );
};

export const LineLayer: React.FC<LayerProps> = ({ data }) => {
  console.debug('[DEBUG] Line layer data:', {
    featureCount: data.features.length,
    features: data.features.map(f => ({
      type: f.geometry.type,
      coordinates: 'coordinates' in f.geometry ? f.geometry.coordinates : undefined,
      properties: f.properties,
      bounds: f.geometry.type === 'LineString' ? {
        minX: Math.min(...((f.geometry as LineString).coordinates).map(c => c[0])),
        minY: Math.min(...((f.geometry as LineString).coordinates).map(c => c[1])),
        maxX: Math.max(...((f.geometry as LineString).coordinates).map(c => c[0])),
        maxY: Math.max(...((f.geometry as LineString).coordinates).map(c => c[1]))
      } : undefined,
      coordinateSystem: f.properties?.originalSystem || 'unknown',
      layer: f.properties?.layer
    }))
  });

  if (data.features.length === 0) {
    console.debug('[DEBUG] No line features to render');
    return null;
  }

  // Add tolerance for coordinate precision
  const tolerance = 0.000001; // ~0.1m at equator
  const roundCoordinate = (coord: number): number => Math.round(coord / tolerance) * tolerance;

  // Create a new FeatureCollection with rounded coordinates
  const roundedData = {
    ...data,
    features: data.features.map(f => ({
      ...f,
      geometry: f.geometry.type === 'LineString' ? {
        ...f.geometry,
        coordinates: ((f.geometry as LineString).coordinates).map((coord: Position) => 
          coord.map((c: number) => roundCoordinate(c))
        )
      } : f.geometry
    }))
  };

  console.debug('[DEBUG] Rounded line data:', {
    featureCount: roundedData.features.length,
    firstFeature: roundedData.features[0] ? {
      type: roundedData.features[0].geometry.type,
      coordinates: 'coordinates' in roundedData.features[0].geometry ? roundedData.features[0].geometry.coordinates : undefined,
      properties: roundedData.features[0].properties,
      layer: roundedData.features[0].properties?.layer
    } : null
  });

  return (
    <Source 
      key="lines" 
      type="geojson" 
      data={roundedData}
      tolerance={tolerance}
      generateId={true}
    >
      <Layer
        id="lines"
        type="line"
        paint={{
          'line-color': '#4a90e2',
          'line-width': 2
        }}
      />
    </Source>
  );
};

export const PolygonLayer: React.FC<LayerProps> = ({ data }) => {
  if (data.features.length === 0) return null;

  return (
    <Source key="polygons" type="geojson" data={data}>
      <Layer
        id="polygons-fill"
        type="fill"
        paint={{
          'fill-color': '#4a90e2',
          'fill-opacity': 0.2
        }}
      />
      <Layer
        id="polygons-outline"
        type="line"
        paint={{
          'line-color': '#4a90e2',
          'line-width': 1
        }}
      />
    </Source>
  );
};

interface MapLayersProps {
  points: FeatureCollection;
  lines: FeatureCollection;
  polygons: FeatureCollection;
}

export function MapLayers({
  points,
  lines,
  polygons
}: MapLayersProps): React.ReactElement {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    console.debug('[DEBUG] MapLayers received collections:', {
      points: points.features.length,
      lines: lines.features.length,
      polygons: polygons.features.length
    });
    setLoaded(true);
  }, [points, lines, polygons]);

  if (!loaded) {
    console.debug('[DEBUG] MapLayers not yet loaded');
    return null;
  }

  return (
    <>
      {lines.features.length > 0 && (
        <Source
          id="lines"
          type="geojson"
          data={lines}
        >
          <Layer
            id="lines"
            type="line"
            paint={{
              'line-color': '#4a90e2',
              'line-width': 2
            }}
          />
        </Source>
      )}

      {points.features.length > 0 && (
        <Source
          id="points"
          type="geojson"
          data={points}
        >
          <Layer
            id="points"
            type="circle"
            paint={{
              'circle-radius': 6,
              'circle-color': '#4a90e2',
              'circle-stroke-width': 2,
              'circle-stroke-color': '#ffffff'
            }}
          />
        </Source>
      )}

      {polygons.features.length > 0 && (
        <Source
          id="polygons"
          type="geojson"
          data={polygons}
        >
          <Layer
            id="polygons"
            type="fill"
            paint={{
              'fill-color': '#4a90e2',
              'fill-opacity': 0.5,
              'fill-outline-color': '#ffffff'
            }}
          />
        </Source>
      )}
    </>
  );
}
