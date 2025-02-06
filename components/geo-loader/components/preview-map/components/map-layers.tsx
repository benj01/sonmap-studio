import React, { useState, useEffect } from 'react';
import { Source, Layer } from 'react-map-gl';
import { FeatureCollection, Position, LineString, MultiLineString, Feature, Geometry, GeoJsonProperties } from 'geojson';
import { LogManager } from '../../../core/logging/log-manager';

// Define local interfaces since we can't access the global types
interface GeoFeatureProperties {
  layer?: string;
  type?: string;
  originalGeometry?: Geometry;
  _transformedCoordinates?: boolean;
  _fromSystem?: string;
  _toSystem?: string;
  originalSystem?: string;
  _projectionInfo?: {
    original: string;
    display: string;
    center: [number, number];
    parallels: [number, number];
  };
  [key: string]: any;
}

interface GeoFeature extends Omit<Feature, 'properties'> {
  properties: GeoFeatureProperties;
}

interface GeoFeatureCollection extends Omit<FeatureCollection, 'features'> {
  features: GeoFeature[];
}

const CLUSTER_RADIUS = 50;
const MIN_ZOOM_FOR_UNCLUSTERED = 14;

interface LayerProps {
  data: GeoFeatureCollection;
}

// Helper function to ensure feature has required properties
const ensureGeoFeature = (feature: Feature): GeoFeature => ({
  ...feature,
  properties: {
    type: feature.geometry?.type || 'unknown',
    ...feature.properties,
    layer: feature.properties?.layer || 'shapes'  // Preserve existing layer or default to 'shapes'
  }
});

// Helper function to ensure collection has required properties
const ensureGeoFeatureCollection = (collection: FeatureCollection): GeoFeatureCollection => ({
  ...collection,
  features: collection.features.map(ensureGeoFeature)
});

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
        filter={['all',
          ['!', ['has', 'point_count']],
          ['==', ['get', 'layer'], 'shapes']
        ]}
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
  const [effectiveData, setEffectiveData] = useState<GeoFeatureCollection>(data);
  const logger = LogManager.getInstance();

  useEffect(() => {
    logger.debug('MapLayers', 'LineLayer received data', {
      features: data.features.length,
      types: data.features.map(f => f.geometry?.type),
      layers: data.features.map(f => f.properties?.layer),
      featureDetails: data.features.map(f => ({
        type: f.geometry?.type,
        layer: f.properties?.layer,
        fromSystem: f.properties?._fromSystem,
        toSystem: f.properties?._toSystem,
        hasCoordinates: f.geometry !== undefined,
        coordinates: f.geometry?.type === 'LineString' ? f.geometry.coordinates : null
      }))
    });
    setEffectiveData(data);
  }, [data]);

  if (effectiveData.features.length === 0) return null;

  return (
    <Source 
      id="line-source"
      type="geojson" 
      data={effectiveData}
    >
      <Layer
        id="lines"
        type="line"
        source="line-source"
        filter={['any',
          ['==', ['get', 'layer'], 'shapes'],
          ['==', ['get', 'layer'], undefined],
          ['==', ['get', 'layer'], null]
        ]}
        paint={{
          'line-color': '#4a90e2',
          'line-width': 3,
          'line-opacity': 1
        }}
        layout={{
          'line-cap': 'round',
          'line-join': 'round',
          'visibility': 'visible',
          'line-sort-key': 1  // Ensure lines render above other layers
        }}
        maxzoom={24}
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
        filter={['==', ['get', 'layer'], 'shapes']}
        paint={{
          'fill-color': '#4a90e2',
          'fill-opacity': 0.2
        }}
      />
      <Layer
        id="polygons-outline"
        type="line"
        filter={['==', ['get', 'layer'], 'shapes']}
        paint={{
          'line-color': '#4a90e2',
          'line-width': 1
        }}
      />
    </Source>
  );
};

interface MapLayersProps {
  points: GeoFeatureCollection;
  lines: GeoFeatureCollection;
  polygons: GeoFeatureCollection;
}

export const MapLayers: React.FC<MapLayersProps> = ({ points, lines, polygons }) => {
  const logger = LogManager.getInstance();

  useEffect(() => {
    logger.debug('MapLayers', 'Component mounted/updated', {
      pointCount: points.features.length,
      lineCount: lines.features.length,
      polygonCount: polygons.features.length,
      lineFeatures: lines.features.map(f => ({
        type: f.geometry.type,
        layer: f.properties?.layer,
        fromSystem: f.properties?._fromSystem,
        toSystem: f.properties?._toSystem
      }))
    });
  }, [points, lines, polygons]);

  return (
    <>
      <PointLayer data={points} />
      <LineLayer data={lines} />
      <PolygonLayer data={polygons} />
    </>
  );
};

export { ensureGeoFeatureCollection };
