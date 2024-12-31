import { Feature, Geometry, Point, LineString, Polygon, MultiPoint, MultiLineString, MultiPolygon, Position, GeometryCollection } from 'geojson';
import { GeoFeature } from '../../../../types/geo';

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Calculate bounds for a single coordinate.
 */
function updateBoundsWithCoordinate(bounds: Bounds | null, coord: Position): Bounds {
  if (!Array.isArray(coord) || coord.length < 2 || !isFinite(coord[0]) || !isFinite(coord[1])) {
    throw new Error('Invalid coordinate for bounds calculation');
  }

  if (!bounds) {
    return {
      minX: coord[0],
      minY: coord[1],
      maxX: coord[0],
      maxY: coord[1]
    };
  }

  return {
    minX: Math.min(bounds.minX, coord[0]),
    minY: Math.min(bounds.minY, coord[1]),
    maxX: Math.max(bounds.maxX, coord[0]),
    maxY: Math.max(bounds.maxY, coord[1])
  };
}

/**
 * Calculate bounds for an array of coordinates.
 */
function calculateCoordinateArrayBounds(coords: Position[]): Bounds | null {
  if (!Array.isArray(coords) || coords.length === 0) {
    return null;
  }

  return coords.reduce((bounds: Bounds | null, coord) => {
    return updateBoundsWithCoordinate(bounds, coord);
  }, null);
}

/**
 * Calculate bounds for a geometry object.
 */
export function calculateGeometryBounds(geometry: Geometry): Bounds | null {
  console.debug('[DEBUG] Calculating geometry bounds:', {
    geometryType: geometry?.type,
    hasCoordinates: 'coordinates' in geometry
  });

  if (!geometry || !geometry.type) {
    console.debug('[DEBUG] Invalid geometry for bounds calculation');
    return null;
  }

  switch (geometry.type) {
    case 'Point':
      return updateBoundsWithCoordinate(null, geometry.coordinates);

    case 'LineString':
    case 'MultiPoint':
      return calculateCoordinateArrayBounds(geometry.coordinates);

    case 'Polygon':
    case 'MultiLineString':
      return geometry.coordinates.reduce((bounds: Bounds | null, ring) => {
        const ringBounds = calculateCoordinateArrayBounds(ring);
        if (!ringBounds) return bounds;
        if (!bounds) return ringBounds;
        return {
          minX: Math.min(bounds.minX, ringBounds.minX),
          minY: Math.min(bounds.minY, ringBounds.minY),
          maxX: Math.max(bounds.maxX, ringBounds.maxX),
          maxY: Math.max(bounds.maxY, ringBounds.maxY)
        };
      }, null);

    case 'MultiPolygon':
      return geometry.coordinates.reduce((bounds: Bounds | null, polygon) => {
        const polygonBounds = polygon.reduce((polyBounds: Bounds | null, ring) => {
          const ringBounds = calculateCoordinateArrayBounds(ring);
          if (!ringBounds) return polyBounds;
          if (!polyBounds) return ringBounds;
          return {
            minX: Math.min(polyBounds.minX, ringBounds.minX),
            minY: Math.min(polyBounds.minY, ringBounds.minY),
            maxX: Math.max(polyBounds.maxX, ringBounds.maxX),
            maxY: Math.max(polyBounds.maxY, ringBounds.maxY)
          };
        }, null);
        if (!polygonBounds) return bounds;
        if (!bounds) return polygonBounds;
        return {
          minX: Math.min(bounds.minX, polygonBounds.minX),
          minY: Math.min(bounds.minY, polygonBounds.minY),
          maxX: Math.max(bounds.maxX, polygonBounds.maxX),
          maxY: Math.max(bounds.maxY, polygonBounds.maxY)
        };
      }, null);

    case 'GeometryCollection':
      return geometry.geometries.reduce((bounds: Bounds | null, geom) => {
        const geomBounds = calculateGeometryBounds(geom);
        if (!geomBounds) return bounds;
        if (!bounds) return geomBounds;
        return {
          minX: Math.min(bounds.minX, geomBounds.minX),
          minY: Math.min(bounds.minY, geomBounds.minY),
          maxX: Math.max(bounds.maxX, geomBounds.maxX),
          maxY: Math.max(bounds.maxY, geomBounds.maxY)
        };
      }, null);

    default:
      return null;
  }
}

/**
 * Calculate bounds for a GeoJSON feature.
 */
export function calculateFeatureBounds(feature: GeoFeature | GeoFeature[]): Bounds | null {
  if (Array.isArray(feature)) {
    console.debug('[DEBUG] Calculating bounds for feature array:', {
      featureCount: feature.length
    });

    return feature.reduce((bounds: Bounds | null, feat) => {
      const featureBounds = calculateFeatureBounds(feat);
      if (!featureBounds) return bounds;
      if (!bounds) return featureBounds;
      return {
        minX: Math.min(bounds.minX, featureBounds.minX),
        minY: Math.min(bounds.minY, featureBounds.minY),
        maxX: Math.max(bounds.maxX, featureBounds.maxX),
        maxY: Math.max(bounds.maxY, featureBounds.maxY)
      };
    }, null);
  }

  console.debug('[DEBUG] Calculating feature bounds:', {
    featureType: feature?.type,
    geometryType: feature?.geometry?.type,
    properties: feature?.properties
  });

  if (!feature || !feature.geometry) {
    console.debug('[DEBUG] Invalid feature for bounds calculation');
    return null;
  }
  
  const bounds = calculateGeometryBounds(feature.geometry);
  console.debug('[DEBUG] Calculated bounds:', bounds);
  
  return bounds;
}
