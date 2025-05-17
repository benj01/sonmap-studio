// Utility to summarize layer data for logging at different levels
import type { Feature, FeatureCollection, Geometry } from 'geojson';

/**
 * Summarizes a GeoJSON FeatureCollection or array of features for logging.
 * @param features Array of GeoJSON features
 * @param level Log level ('info' | 'debug' | 'trace')
 * @returns Summary object for logging
 */
export function summarizeFeaturesForLogging(features: Feature[], level: 'info' | 'debug' | 'trace' = 'info') {
  const featureCount = features.length;
  const geometryTypes = Array.from(new Set(features.map(f => f.geometry?.type)));
  let bbox: [number, number, number, number] | undefined = undefined;
  try {
    // Compute bounding box if possible
    const coords = features.flatMap(f => {
      if (!f.geometry) return [];
      if (f.geometry.type === 'Point') return [f.geometry.coordinates];
      if (f.geometry.type === 'LineString' || f.geometry.type === 'MultiPoint') return f.geometry.coordinates as number[][];
      if (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiLineString') return (f.geometry.coordinates as number[][][]).flat();
      if (f.geometry.type === 'MultiPolygon') return (f.geometry.coordinates as number[][][][]).flat(2);
      return [];
    });
    const lons = coords.map(c => c[0]).filter(Number.isFinite);
    const lats = coords.map(c => c[1]).filter(Number.isFinite);
    if (lons.length && lats.length) {
      bbox = [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
    }
  } catch {}

  const summary: any = {
    featureCount,
    geometryTypes,
    bbox,
  };

  if (level === 'info') {
    return summary;
  }

  // For debug/trace, include sample features (truncate coordinates for brevity)
  const sampleCount = Math.min(5, featureCount);
  const sampleFeatures = features.slice(0, sampleCount).map(f => truncateFeature(f));
  const lastFeature = featureCount > 5 ? truncateFeature(features[featureCount - 1]) : undefined;
  const omittedCount = featureCount - sampleCount - (lastFeature ? 1 : 0);

  return {
    ...summary,
    sampleFeatures,
    ...(lastFeature ? { lastFeature } : {}),
    omittedCount: omittedCount > 0 ? omittedCount : 0,
  };
}

/**
 * Abbreviates large coordinate arrays for logging. If a geometry has more than 5 coordinates at any top-level array,
 * logs the first 3, last, and a summary (total count, abbreviated: true).
 * @param geometry GeoJSON Geometry object
 * @returns Abbreviated geometry for logging
 */
export function abbreviateCoordinatesForLog(geometry: Geometry): any {
  if (
    geometry.type === 'GeometryCollection' ||
    !('coordinates' in geometry)
  ) {
    // GeometryCollection or missing coordinates: return type only
    return { type: geometry.type };
  }
  const { type, coordinates } = geometry as Extract<Geometry, { coordinates: any }>;

  function abbreviateCoords(coords: any, depth = 0): any {
    if (Array.isArray(coords)) {
      if (depth === 0 && coords.length > 5) {
        return [
          ...coords.slice(0, 3),
          `... (${coords.length - 4} more points) ...`,
          coords[coords.length - 1]
        ];
      } else if (depth === 1 && coords.length > 5) {
        return [
          ...coords.slice(0, 3),
          `... (${coords.length - 4} more points) ...`,
          coords[coords.length - 1]
        ];
      } else {
        return coords.map(c => abbreviateCoords(c, depth + 1));
      }
    }
    return coords;
  }

  const abbreviated = Array.isArray(coordinates) && coordinates.length > 5;
  const totalCoordinates = Array.isArray(coordinates) ? coordinates.length : undefined;

  return {
    type,
    coordinates: abbreviateCoords(coordinates),
    ...(abbreviated ? { abbreviated: true, totalCoordinates } : {})
  };
}

/**
 * Truncates coordinates in a feature for logging (max 10 coords per geometry array).
 */
function truncateFeature(feature: Feature): any {
  const truncated = { ...feature };
  if (feature.geometry) {
    truncated.geometry = abbreviateCoordinatesForLog(feature.geometry);
  }
  return truncated;
} 