import React, { useState, useEffect } from 'react';
import { Source, Layer } from 'react-map-gl';
import { FeatureCollection, Position, LineString, MultiLineString, Feature, Geometry, GeoJsonProperties } from 'geojson';

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
  const [lastValidData, setLastValidData] = useState<GeoFeatureCollection | null>(null);

  useEffect(() => {
    // Log detailed feature information
    const features = data.features;
    console.debug('[DEBUG] [LineLayer] Received data:', {
      currentFeatures: features.length,
      lastValidFeatures: lastValidData?.features.length || 0,
      sampleFeature: features[0] ? {
        type: features[0].geometry.type,
        coordinates: features[0].geometry.type === 'LineString' || features[0].geometry.type === 'MultiLineString' 
          ? (features[0].geometry as LineString | MultiLineString).coordinates 
          : [],
        layer: features[0].properties?.layer,
        fromSystem: features[0].properties?._fromSystem,
        toSystem: features[0].properties?._toSystem,
        projectionInfo: features[0].properties?._projectionInfo
      } : null
    });

    // Update last valid data if we have features
    if (features.length > 0) {
      setLastValidData(data);
    }
  }, [data]);

  // Use current data if it has features, otherwise use last valid data
  const effectiveData = data.features.length > 0 ? data : (lastValidData || data);

  // Return null if no data to render
  if (!effectiveData || effectiveData.features.length === 0) {
    console.debug('[DEBUG] [LineLayer] No features to render');
    return null;
  }

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
          'line-sort-key': 1  // Ensure lines render above other layers
        }}
        minzoom={0}
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
  useEffect(() => {
    console.debug('[DEBUG] [MapLayers] Component mounted/updated:', {
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
