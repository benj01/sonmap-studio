import { Feature, Position } from 'geojson';
import { GeoJSONFeature } from '../../types/geojson';
import { getGeometryCoordinates } from '../../utils/geometry';

private async calculateBounds(features: GeoJSONFeature[]): Promise<[number, number, number, number] | undefined> {
  console.debug('[FeatureProcessor] Starting bounds calculation:', {
    featureCount: features.length,
    firstFeature: features[0] ? {
      type: features[0].geometry?.type,
      bbox: features[0].bbox,
      coordinates: features[0].geometry ? getGeometryCoordinates(features[0].geometry) : undefined
    } : null
  });

  if (!features.length) {
    console.warn('[FeatureProcessor] No features to calculate bounds from');
    return undefined;
  }

  try {
    // First try to use bbox if available
    const bboxFeatures = features.filter(f => f.bbox && f.bbox.length === 4);
    if (bboxFeatures.length > 0) {
      console.debug('[FeatureProcessor] Found features with bbox:', {
        count: bboxFeatures.length,
        firstBbox: bboxFeatures[0].bbox
      });

      const bounds = bboxFeatures.reduce(
        (acc: [number, number, number, number], feature) => {
          const bbox = feature.bbox!;
          return [
            Math.min(acc[0], bbox[0]),
            Math.min(acc[1], bbox[1]),
            Math.max(acc[2], bbox[2]),
            Math.max(acc[3], bbox[3])
          ];
        },
        [Infinity, Infinity, -Infinity, -Infinity] as [number, number, number, number]
      );

      console.debug('[FeatureProcessor] Calculated bounds from bbox:', {
        bounds,
        isValid: bounds.every(v => Number.isFinite(v))
      });

      if (bounds.every(v => Number.isFinite(v))) {
        return bounds;
      }
    }

    // If no valid bbox found, calculate from coordinates
    console.debug('[FeatureProcessor] Calculating bounds from coordinates');
    const coords: Position[] = [];

    features.forEach(feature => {
      if (!feature.geometry) return;

      const coordinates = getGeometryCoordinates(feature.geometry);
      if (!coordinates) return;

      if (Array.isArray(coordinates[0])) {
        // Handle nested coordinate arrays (LineString, Polygon, etc.)
        const flatCoords = coordinates.flat(2).filter(Array.isArray) as Position[];
        coords.push(...flatCoords);
      } else {
        // Handle Point coordinates
        coords.push(coordinates as Position);
      }
    });

    console.debug('[FeatureProcessor] Extracted coordinates:', {
      count: coords.length,
      sample: coords.slice(0, 2)
    });

    if (coords.length === 0) {
      console.warn('[FeatureProcessor] No valid coordinates found in features');
      return undefined;
    }

    const bounds = coords.reduce(
      (acc: [number, number, number, number], [x, y]) => [
        Math.min(acc[0], x),
        Math.min(acc[1], y),
        Math.max(acc[2], x),
        Math.max(acc[3], y)
      ],
      [Infinity, Infinity, -Infinity, -Infinity] as [number, number, number, number]
    );

    console.debug('[FeatureProcessor] Calculated bounds from coordinates:', {
      bounds,
      isValid: bounds.every(v => Number.isFinite(v))
    });

    if (bounds.every(v => Number.isFinite(v))) {
      return bounds;
    }

    console.warn('[FeatureProcessor] Could not calculate valid bounds');
    return undefined;
  } catch (error) {
    console.error('[FeatureProcessor] Error calculating bounds:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    return undefined;
  }
} 