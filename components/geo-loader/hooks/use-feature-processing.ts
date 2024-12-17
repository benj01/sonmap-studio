import { useMemo } from 'react';
import { Feature, FeatureCollection, Geometry } from 'geojson';
import { CoordinateSystem } from '../types/coordinates';
import { Analysis, MapFeatureCollections } from '../types/map';
import { CoordinateTransformer } from '../utils/coordinate-utils';
import { MAX_VISIBLE_FEATURES } from '../components/map/map-layers';

interface UseFeatureProcessingProps {
  preview: FeatureCollection;
  coordinateSystem: CoordinateSystem;
  visibleLayers: string[];
  zoom: number;
  analysis?: Analysis;
}

export function useFeatureProcessing({
  preview,
  coordinateSystem,
  visibleLayers,
  zoom,
  analysis
}: UseFeatureProcessingProps): MapFeatureCollections {
  return useMemo(() => {
    const points: Feature[] = [];
    const lines: Feature[] = [];
    const polygons: Feature[] = [];
    const allFeatures: Feature[] = [];

    // Process features
    preview.features.forEach(feature => {
      if (!feature.properties?.layer || visibleLayers.includes(feature.properties.layer)) {
        // Add warning flag if needed
        if (analysis?.warnings) {
          const warning = analysis.warnings.find(w => 
            w.entity?.handle === feature.properties?.handle &&
            w.entity?.layer === feature.properties?.layer
          );
          if (warning) {
            feature.properties = {
              ...feature.properties,
              hasWarning: true,
              warningMessage: warning.message
            };
          }
        }

        // Store in all features array for lookup
        allFeatures.push(feature);

        // Categorize by geometry type
        if (feature.geometry.type === 'Point') {
          points.push(feature);
        } else if (
          feature.geometry.type === 'LineString' || 
          feature.geometry.type === 'MultiLineString'
        ) {
          lines.push(feature);
        } else if (
          feature.geometry.type === 'Polygon' || 
          feature.geometry.type === 'MultiPolygon'
        ) {
          polygons.push(feature);
        }
      }
    });

    // Function to get features by type and layer
    const getFeaturesByTypeAndLayer = (type: string, layer: string): Feature[] => {
      return allFeatures.filter(feature => 
        feature.properties?.entityType === type && 
        feature.properties?.layer === layer
      );
    };

    // Create feature collections
    const pointFeatures: FeatureCollection = {
      type: 'FeatureCollection',
      features: points.slice(0, MAX_VISIBLE_FEATURES)
    };

    const lineFeatures: FeatureCollection = {
      type: 'FeatureCollection',
      features: lines.slice(0, MAX_VISIBLE_FEATURES)
    };

    const polygonFeatures: FeatureCollection = {
      type: 'FeatureCollection',
      features: polygons.slice(0, MAX_VISIBLE_FEATURES)
    };

    return {
      pointFeatures,
      lineFeatures,
      polygonFeatures,
      getFeaturesByTypeAndLayer
    };
  }, [preview, coordinateSystem, visibleLayers, zoom, analysis]);
}
