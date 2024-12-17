import { useMemo } from 'react';
import { Feature, FeatureCollection } from 'geojson';
import { COORDINATE_SYSTEMS, CoordinateSystem } from '../types/coordinates';
import { CoordinateTransformer } from '../utils/coordinate-utils';
import { isValidGeometry } from '../utils/validation/geometry';
import { transformGeometry, processFeatures, simplifyGeometry } from '../utils/geo/feature-processing';
import { MAX_VISIBLE_FEATURES } from '../components/map/map-layers';
import { Analysis, MapFeatureCollections } from '../types/map';

interface UseFeatureProcessingProps {
  preview: FeatureCollection;
  coordinateSystem?: CoordinateSystem;
  visibleLayers?: string[];
  zoom: number;
  analysis?: Analysis;
}

export function useFeatureProcessing({
  preview,
  coordinateSystem = COORDINATE_SYSTEMS.WGS84,
  visibleLayers = [],
  zoom,
  analysis
}: UseFeatureProcessingProps): MapFeatureCollections {
  const transformedFeatures = useMemo(() => {
    if (!preview?.features) return [];

    let features = preview.features.filter(f => isValidGeometry(f.geometry));
    
    if (coordinateSystem && coordinateSystem !== COORDINATE_SYSTEMS.WGS84) {
      try {
        const transformer = new CoordinateTransformer(coordinateSystem, COORDINATE_SYSTEMS.WGS84);
        features = features
          .map(feature => {
            const transformedGeometry = transformGeometry(feature.geometry, transformer);
            return transformedGeometry ? { ...feature, geometry: transformedGeometry } : null;
          })
          .filter((f): f is Feature => f !== null);
      } catch (error) {
        console.error('Error transforming features:', error);
        return [];
      }
    }

    return processFeatures(features, MAX_VISIBLE_FEATURES, analysis?.warnings);
  }, [preview, coordinateSystem, analysis]);

  const { pointFeatures, lineFeatures, polygonFeatures } = useMemo(() => {
    const visibleFeatures = visibleLayers.length > 0
      ? transformedFeatures.filter(f => 
          f.properties?.layer && visibleLayers.includes(f.properties.layer)
        )
      : transformedFeatures;

    const simplifiedFeatures = visibleFeatures.map(feature => ({
      ...feature,
      geometry: simplifyGeometry(feature.geometry, zoom)
    }));

    const warningsByHandle = new Map(
      (analysis?.warnings ?? [])
        .filter(w => w.entity?.handle && w.type)
        .map(w => [w.entity!.handle!, w.type])
    );

    const addWarningProperties = (feature: Feature): Feature => {
      const handle = feature.properties?.handle;
      if (handle && warningsByHandle.has(handle)) {
        return {
          ...feature,
          properties: {
            ...feature.properties,
            hasWarning: true,
            warningType: warningsByHandle.get(handle)
          }
        };
      }
      return feature;
    };

    return {
      pointFeatures: {
        type: 'FeatureCollection' as const,
        features: simplifiedFeatures
          .filter(f => f.geometry.type === 'Point' || f.geometry.type === 'MultiPoint')
          .map(addWarningProperties)
      },
      lineFeatures: {
        type: 'FeatureCollection' as const,
        features: simplifiedFeatures
          .filter(f => f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString')
          .map(addWarningProperties)
      },
      polygonFeatures: {
        type: 'FeatureCollection' as const,
        features: simplifiedFeatures
          .filter(f => f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon')
          .map(addWarningProperties)
      }
    };
  }, [transformedFeatures, visibleLayers, zoom, analysis]);

  return {
    pointFeatures,
    lineFeatures,
    polygonFeatures
  };
}
