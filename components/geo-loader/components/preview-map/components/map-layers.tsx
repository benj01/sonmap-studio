import React, { useState, useEffect } from 'react';
import { Source, Layer } from 'react-map-gl';
import { FeatureCollection, Position, LineString, MultiLineString, Feature, Geometry, GeoJsonProperties } from 'geojson';

// Define local interfaces since we can't access the global types
interface GeoFeatureProperties {
  layer?: string;
  type?: string;
  originalGeometry?: Geometry;
  _transformedCoordinates?: boolean;
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
    layer: 'shapes',
    type: feature.geometry?.type || 'unknown',
    ...feature.properties
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
  console.debug('[DEBUG] Line layer data:', {
    featureCount: data.features.length,
    features: data.features.map((f: GeoFeature) => ({
      type: f.geometry.type,
      coordinates: 'coordinates' in f.geometry ? f.geometry.coordinates : undefined,
      properties: f.properties,
      layer: f.properties?.layer
    }))
  });

  if (data.features.length === 0) {
    console.debug('[DEBUG] No line features to render');
    return null;
  }

  // Validate and process coordinates
  const processCoordinates = (coords: number[]): number[] => {
    return coords.map(c => {
      // Ensure coordinate is a finite number
      if (!isFinite(c)) {
        console.warn('[DEBUG] Invalid coordinate found:', c);
        return 0; // Default to 0 for invalid coordinates
      }
      return c;
    });
  };

  // Create a new FeatureCollection with validated coordinates
  const validatedData: GeoFeatureCollection = {
    type: 'FeatureCollection',
    features: data.features.map((f: GeoFeature) => {
      // Skip validation if coordinates are already transformed
      if (f.properties?._transformedCoordinates) {
        return f;
      }

      // Use original geometry if it exists in properties (for non-WGS84 display)
      const geometry = f.properties?.originalGeometry || f.geometry;
      
      return {
        ...f,
        geometry: (() => {
          if (geometry.type === 'LineString') {
            return {
              ...geometry,
              coordinates: (geometry as LineString).coordinates.map((coord: Position) => 
                processCoordinates(coord)
              )
            };
          } else if (geometry.type === 'MultiLineString') {
            return {
              ...geometry,
              coordinates: (geometry as MultiLineString).coordinates.map((line: Position[]) =>
                line.map((coord: Position) =>
                  processCoordinates(coord)
                )
              )
            };
          }
          return geometry;
        })(),
        properties: {
          ...f.properties,
          _transformedCoordinates: true
        }
      } as GeoFeature;
    })
  };

  console.debug('[DEBUG] Validated line data:', {
    featureCount: validatedData.features.length,
    firstFeature: validatedData.features[0] ? {
      type: validatedData.features[0].geometry.type,
      coordinates: 'coordinates' in validatedData.features[0].geometry ? validatedData.features[0].geometry.coordinates : undefined,
      properties: validatedData.features[0].properties,
      layer: validatedData.features[0].properties?.layer,
      hasOriginalGeometry: !!validatedData.features[0].properties?.originalGeometry
    } : null
  });

  return (
    <Source 
      key="lines" 
      type="geojson" 
      data={validatedData}
      generateId={true}
    >
      <Layer
        id="lines"
        type="line"
        filter={['==', ['get', 'layer'], 'shapes']} // Only show features from 'shapes' layer
        paint={{
          'line-color': '#4a90e2',
          'line-width': 3,
          'line-opacity': 1
        }}
        layout={{
          'line-join': 'round',
          'line-cap': 'round',
          'visibility': 'visible'
        }}
      />
      <Layer
        id="lines-hover"
        type="line"
        filter={['all',
          ['==', ['get', 'layer'], 'shapes'],
          ['==', ['id'], '']
        ]}
        paint={{
          'line-color': '#4a90e2',
          'line-width': 5,
          'line-opacity': 0.5
        }}
        layout={{
          'line-join': 'round',
          'line-cap': 'round',
          'visibility': 'visible'
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

export function MapLayers({
  points,
  lines,
  polygons
}: MapLayersProps): React.ReactElement {
  useEffect(() => {
    console.debug('[DEBUG] MapLayers received collections:', {
      points: points.features.length,
      lines: lines.features.length,
      polygons: polygons.features.length,
      lineDetails: lines.features.map((f: GeoFeature) => ({
        type: f.geometry.type,
        coordinates: f.geometry.type === 'LineString' ? 
          (f.geometry as LineString).coordinates.length :
          f.geometry.type === 'MultiLineString' ?
            (f.geometry as MultiLineString).coordinates.reduce((sum, line) => sum + line.length, 0) : 0,
        properties: f.properties,
        layer: f.properties?.layer
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
}

export { ensureGeoFeatureCollection };
