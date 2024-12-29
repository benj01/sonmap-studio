import React from 'react';
import { Source, Layer } from 'react-map-gl';
import { FeatureCollection } from 'geojson';

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
  if (data.features.length === 0) return null;

  return (
    <Source key="lines" type="geojson" data={data}>
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

export const MapLayers: React.FC<{
  points: FeatureCollection;
  lines: FeatureCollection;
  polygons: FeatureCollection;
}> = ({ points, lines, polygons }) => {
  return (
    <>
      <PointLayer data={points} />
      <LineLayer data={lines} />
      <PolygonLayer data={polygons} />
    </>
  );
};
