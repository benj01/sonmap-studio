import React, { useState, useEffect, useRef } from 'react';
import { Source, Layer } from 'react-map-gl';
import { FeatureCollection, Position, LineString, MultiLineString, Feature, Geometry, GeoJsonProperties } from 'geojson';
import { LogManager } from '../../../core/logging/log-manager';
import { LogLevel } from '../../../core/logging/log-manager';

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

export const LineLayer: React.FC<LayerProps> = React.memo(({ data }) => {
  // Only return null if no features, without logging
  if (!data?.features?.length) return null;

  console.debug('[MapLayers] Rendering LineLayer:', {
    featureCount: data.features.length,
    firstFeature: data.features[0] ? {
      type: data.features[0].geometry.type,
      coordinates: data.features[0].geometry.type === 'LineString' || data.features[0].geometry.type === 'MultiLineString' ?
        (data.features[0].geometry as LineString | MultiLineString).coordinates.slice(0, 2) : null,
      totalPoints: data.features[0].geometry.type === 'LineString' || data.features[0].geometry.type === 'MultiLineString' ?
        (data.features[0].geometry as LineString | MultiLineString).coordinates.length : 0,
      layer: data.features[0].properties?.layer,
      transformed: data.features[0].properties?._transformedCoordinates
    } : null
  });

  const effectiveData = {
    type: 'FeatureCollection' as const,
    features: data.features.map(ensureGeoFeature)
  };

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
        filter={['==', ['get', 'layer'], 'shapes']}
        paint={{
          'line-color': '#4a90e2',
          'line-width': 3,
          'line-opacity': 1
        }}
        layout={{
          'line-cap': 'round',
          'line-join': 'round',
          'visibility': 'visible',
          'line-sort-key': 1
        }}
        maxzoom={24}
        minzoom={0}
      />
    </Source>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function for better memoization
  if (!prevProps.data?.features?.length && !nextProps.data?.features?.length) return true;
  if (prevProps.data?.features?.length !== nextProps.data?.features?.length) return false;
  return true;
});

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

export const MapLayers: React.FC<MapLayersProps> = React.memo(({ points, lines, polygons }) => {
  // Only log on mount in development mode
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      const logger = LogManager.getInstance();
      logger.setLogLevel(LogLevel.INFO); // Set to INFO level to reduce debug noise
      logger.info('MapLayers', 'Initial mount', {
        pointCount: points.features.length,
        lineCount: lines.features.length,
        polygonCount: polygons.features.length
      });
    }
  }, []); // Empty dependency array = only run on mount

  return (
    <>
      <PointLayer data={points} />
      <LineLayer data={lines} />
      <PolygonLayer data={polygons} />
    </>
  );
}, (prevProps, nextProps) => {
  // Efficient comparison without JSON.stringify
  return (
    areFeatureCollectionsEqual(prevProps.points, nextProps.points) &&
    areFeatureCollectionsEqual(prevProps.lines, nextProps.lines) &&
    areFeatureCollectionsEqual(prevProps.polygons, nextProps.polygons)
  );
});

// Helper for shallow feature comparison
const areFeatureCollectionsEqual = (prev: GeoFeatureCollection, next: GeoFeatureCollection): boolean => {
  if (prev.features.length !== next.features.length) return false;
  if (prev.features.length === 0 && next.features.length === 0) return true;
  
  // Compare feature counts by type
  const getTypeCounts = (features: GeoFeature[]) => {
    return features.reduce((acc, f) => {
      const type = f.geometry.type;
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  };
  
  const prevCounts = getTypeCounts(prev.features);
  const nextCounts = getTypeCounts(next.features);
  
  return Object.keys(prevCounts).every(type => prevCounts[type] === nextCounts[type]);
};

export { ensureGeoFeatureCollection };
