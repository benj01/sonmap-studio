// components/geo-loader/utils/geometry-utils.ts

import { GeoFeature, Geometry, Point2D, Point3D, LineString, Polygon } from '../../../types/geo';

type Coordinate2D = [number, number];
type Coordinate3D = [number, number, number];

/**
 * Validate a 2D coordinate.
 */
function isValid2DCoordinate(coord: any): coord is Coordinate2D {
  return Array.isArray(coord) && 
         coord.length === 2 && 
         coord.every(n => typeof n === 'number' && isFinite(n));
}

/**
 * Validate a 3D coordinate.
 */
function isValid3DCoordinate(coord: any): coord is Coordinate3D {
  return Array.isArray(coord) && 
         coord.length === 3 && 
         coord.every(n => typeof n === 'number' && isFinite(n));
}

/**
 * Validate an array of 2D coordinates.
 */
function isValid2DCoordinateArray(coords: any[]): coords is Coordinate2D[] {
  return Array.isArray(coords) && coords.every(isValid2DCoordinate);
}

/**
 * Validate a linear ring (polygon boundary).
 * A valid ring has at least 4 coordinates and the first equals the last.
 */
function isValidLinearRing(ring: any[]): ring is Coordinate2D[] {
  if (!isValid2DCoordinateArray(ring) || ring.length < 4) return false;
  const first = ring[0];
  const last = ring[ring.length - 1];
  return first[0] === last[0] && first[1] === last[1];
}

/**
 * Create a GeoJSON Point geometry.
 * @param x - X coordinate (longitude)
 * @param y - Y coordinate (latitude)
 * @param z - Optional Z (altitude) coordinate
 */
export function createPointGeometry(x: number, y: number, z?: number): Geometry | null {
  if (!isFinite(x) || !isFinite(y) || (z !== undefined && !isFinite(z))) {
    console.warn('Invalid point coordinates:', { x, y, z });
    return null;
  }

  if (z !== undefined) {
    const point3D: Point3D = {
      type: 'Point',
      coordinates: [x, y, z]
    };
    return point3D;
  } else {
    const point2D: Point2D = {
      type: 'Point',
      coordinates: [x, y]
    };
    return point2D;
  }
}

/**
 * Create a GeoJSON LineString geometry.
 * @param coordinates - Array of [x, y] coordinates
 */
export function createLineStringGeometry(coordinates: Coordinate2D[]): Geometry | null {
  if (!isValid2DCoordinateArray(coordinates)) {
    console.warn('Invalid LineString coordinates:', coordinates);
    return null;
  }

  if (coordinates.length < 2) {
    console.warn('LineString must have at least 2 coordinates');
    return null;
  }

  const lineString: LineString = {
    type: 'LineString',
    coordinates: coordinates
  };
  return lineString;
}

/**
 * Create a GeoJSON Polygon geometry.
 * @param rings - Array of linear rings (each ring is an array of coordinates)
 * The first ring is the outer boundary, subsequent rings are holes.
 */
export function createPolygonGeometry(rings: Coordinate2D[][]): Geometry | null {
  if (!Array.isArray(rings) || rings.length === 0) {
    console.warn('Invalid Polygon rings array');
    return null;
  }

  // Validate each ring
  for (let i = 0; i < rings.length; i++) {
    if (!isValidLinearRing(rings[i])) {
      console.warn(`Invalid ring at index ${i}:`, rings[i]);
      return null;
    }
  }

  const polygon: Polygon = {
    type: 'Polygon',
    coordinates: rings
  };
  return polygon;
}

/**
 * Create a GeoJSON Feature from geometry and properties.
 * @param geometry - A GeoJSON geometry object.
 * @param properties - An object for the feature's properties.
 */
export function createFeature(
  geometry: Geometry | null,
  properties: Record<string, any> = {}
): GeoFeature | null {
  if (!geometry) {
    console.warn('Cannot create feature with null geometry');
    return null;
  }

  if (!geometry.type || !geometry.coordinates) {
    console.warn('Invalid geometry:', geometry);
    return null;
  }

  return {
    type: 'Feature',
    geometry,
    properties: properties || {}
  };
}
