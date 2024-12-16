// components/geo-loader/utils/geometry-utils.ts

import { GeoFeature, Geometry } from '../../../types/geo';

/**
 * Create a GeoJSON Point geometry.
 * @param x - X coordinate (longitude)
 * @param y - Y coordinate (latitude)
 * @param z - Optional Z (altitude) coordinate
 */
export function createPointGeometry(x: number, y: number, z?: number): Geometry {
  if (typeof z === 'number' && !isNaN(z)) {
    return {
      type: 'Point',
      coordinates: [x, y, z]
    };
  } else {
    return {
      type: 'Point',
      coordinates: [x, y]
    };
  }
}

/**
 * Create a GeoJSON LineString geometry.
 * @param coordinates - Array of [x, y] or [x, y, z] coordinates
 */
export function createLineStringGeometry(
  coordinates: Array<[number, number] | [number, number, number]>
): Geometry {
  return {
    type: 'LineString',
    coordinates
  };
}

/**
 * Create a GeoJSON Polygon geometry.
 * @param rings - Array of linear rings (each ring is an array of coordinates)
 * The first ring is the outer boundary, subsequent rings are holes.
 */
export function createPolygonGeometry(
  rings: Array<Array<[number, number] | [number, number, number]>>
): Geometry {
  return {
    type: 'Polygon',
    coordinates: rings
  };
}

/**
 * Create a GeoJSON MultiPoint geometry.
 * @param points - Array of points, each point is [x, y] or [x, y, z]
 */
export function createMultiPointGeometry(
  points: Array<[number, number] | [number, number, number]>
): Geometry {
  return {
    type: 'MultiPoint',
    coordinates: points
  };
}

/**
 * Create a GeoJSON MultiLineString geometry.
 * @param lines - Array of LineString coordinate arrays
 */
export function createMultiLineStringGeometry(
  lines: Array<Array<[number, number] | [number, number, number]>>
): Geometry {
  return {
    type: 'MultiLineString',
    coordinates: lines
  };
}

/**
 * Create a GeoJSON MultiPolygon geometry.
 * @param polygons - Array of Polygon coordinate arrays.
 * Each polygon is an array of linear rings.
 */
export function createMultiPolygonGeometry(
  polygons: Array<Array<Array<[number, number] | [number, number, number]>>>
): Geometry {
  return {
    type: 'MultiPolygon',
    coordinates: polygons
  };
}

/**
 * Create a GeoJSON Feature from geometry and properties.
 * @param geometry - A GeoJSON geometry object.
 * @param properties - An object for the feature's properties.
 */
export function createFeature(
  geometry: Geometry,
  properties: Record<string, any> = {}
): GeoFeature {
  return {
    type: 'Feature',
    geometry,
    properties
  };
}
