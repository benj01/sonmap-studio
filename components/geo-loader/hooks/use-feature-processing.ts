import { useMemo } from 'react';
import { Feature, FeatureCollection, BBox } from 'geojson';
import { CoordinateSystem } from '../types/coordinates';
import { Analysis, MapFeatureCollections, UseFeatureProcessingProps } from '../types/map';
import bbox from '@turf/bbox';
import booleanIntersects from '@turf/boolean-intersects';
import bboxPolygon from '@turf/bbox-polygon';

/**
 * Hook for processing GeoJSON features with optimizations for large datasets
 * 
 * Implements:
 * - Viewport-based filtering
 * - Feature batching
 * - Warning indicators
 * - Type-based organization
 */
export function useFeatureProcessing({
  preview,
  coordinateSystem,
  visibleLayers,
  zoom,
  analysis,
  viewportBounds,
  batchSize = 1000
}: UseFeatureProcessingProps): MapFeatureCollections {
  return useMemo(() => {
    const points: Feature[] = [];
    const lines: Feature[] = [];
    const polygons: Feature[] = [];
    const allFeatures: Feature[] = [];
    let totalCount = 0;
    let visibleCount = 0;

    // Create viewport polygon for filtering if bounds provided
    const viewportPolygon = viewportBounds ? bboxPolygon(viewportBounds) : null;

    // Process features in batches
    for (let i = 0; i < preview.features.length; i += batchSize) {
      const batch = preview.features.slice(i, i + batchSize);

      batch.forEach(feature => {
        if (!feature.properties?.layer || visibleLayers.includes(feature.properties.layer)) {
          totalCount++;

          // Skip features outside viewport if bounds provided
          if (viewportPolygon && !booleanIntersects(feature, viewportPolygon)) {
            return;
          }

          visibleCount++;

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
          switch (feature.geometry.type) {
            case 'Point':
              points.push(feature);
              break;
            case 'LineString':
            case 'MultiLineString':
              lines.push(feature);
              break;
            case 'Polygon':
            case 'MultiPolygon':
              polygons.push(feature);
              break;
          }
        }
      });
    }

    // Function to get features by type and layer with spatial indexing
    const getFeaturesByTypeAndLayer = (type: string, layer: string): Feature[] => {
      return allFeatures.filter(feature => 
        feature.properties?.entityType === type && 
        feature.properties?.layer === layer
      );
    };

    // Create feature collections with computed bounds
    const createFeatureCollection = (features: Feature[]): FeatureCollection => ({
      type: 'FeatureCollection',
      features,
      bbox: features.length > 0 ? bbox({ type: 'FeatureCollection', features }) : undefined
    });

    return {
      pointFeatures: createFeatureCollection(points),
      lineFeatures: createFeatureCollection(lines),
      polygonFeatures: createFeatureCollection(polygons),
      getFeaturesByTypeAndLayer,
      totalFeatureCount: totalCount,
      visibleFeatureCount: visibleCount
    };
  }, [preview, coordinateSystem, visibleLayers, zoom, analysis, viewportBounds, batchSize]);
}
