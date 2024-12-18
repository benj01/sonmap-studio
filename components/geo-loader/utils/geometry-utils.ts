// components/geo-loader/utils/geometry-utils.ts

import { Feature, Geometry, Point, LineString, Polygon, MultiPoint, MultiLineString, MultiPolygon, Position, GeometryCollection } from 'geojson';
import { GeoFeature } from '../../../types/geo';

type Coordinate2D = Position;
type Coordinate3D = Position;

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
function isValid2DCoordinateArray(coords: any[]): coords is Position[] {
  return Array.isArray(coords) && coords.every(isValid2DCoordinate);
}

/**
 * Validate a linear ring (polygon boundary).
 * A valid ring has at least 4 coordinates and the first equals the last.
 */
function isValidLinearRing(ring: any[]): ring is Position[] {
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
export function createPointGeometry(x: number, y: number, z?: number): Point {
  if (!isFinite(x) || !isFinite(y) || (z !== undefined && !isFinite(z))) {
    throw new Error(`Invalid point coordinates: ${x}, ${y}, ${z}`);
  }

  return {
    type: 'Point',
    coordinates: z !== undefined ? [x, y, z] : [x, y]
  };
}

/**
 * Create a GeoJSON LineString geometry.
 * @param coordinates - Array of [x, y] coordinates
 */
export function createLineStringGeometry(coordinates: Position[]): LineString {
  if (!isValid2DCoordinateArray(coordinates)) {
    throw new Error('Invalid LineString coordinates');
  }

  if (coordinates.length < 2) {
    throw new Error('LineString must have at least 2 coordinates');
  }

  return {
    type: 'LineString',
    coordinates: coordinates
  };
}

/**
 * Create a GeoJSON Polygon geometry.
 * @param rings - Array of linear rings (each ring is an array of coordinates)
 * The first ring is the outer boundary, subsequent rings are holes.
 */
export function createPolygonGeometry(rings: Position[][]): Polygon {
  if (!Array.isArray(rings) || rings.length === 0) {
    throw new Error('Invalid Polygon rings array');
  }

  // Validate each ring
  for (let i = 0; i < rings.length; i++) {
    if (!isValidLinearRing(rings[i])) {
      throw new Error(`Invalid ring at index ${i}`);
    }
  }

  return {
    type: 'Polygon',
    coordinates: rings
  };
}

/**
 * Create a GeoJSON MultiPoint geometry.
 * @param points - Array of point coordinates
 */
export function createMultiPointGeometry(points: Position[]): MultiPoint {
  if (!isValid2DCoordinateArray(points)) {
    throw new Error('Invalid MultiPoint coordinates');
  }

  return {
    type: 'MultiPoint',
    coordinates: points
  };
}

/**
 * Create a GeoJSON MultiLineString geometry.
 * @param lines - Array of line coordinate arrays
 */
export function createMultiLineStringGeometry(lines: Position[][]): MultiLineString {
  if (!Array.isArray(lines)) {
    throw new Error('Invalid MultiLineString lines array');
  }

  // Validate each line
  for (let i = 0; i < lines.length; i++) {
    if (!isValid2DCoordinateArray(lines[i]) || lines[i].length < 2) {
      throw new Error(`Invalid line at index ${i}`);
    }
  }

  return {
    type: 'MultiLineString',
    coordinates: lines
  };
}

/**
 * Create a GeoJSON MultiPolygon geometry.
 * @param polygons - Array of polygon coordinate arrays
 */
export function createMultiPolygonGeometry(polygons: Position[][][]): MultiPolygon {
  if (!Array.isArray(polygons)) {
    throw new Error('Invalid MultiPolygon polygons array');
  }

  // Validate each polygon
  for (let i = 0; i < polygons.length; i++) {
    const rings = polygons[i];
    if (!Array.isArray(rings) || rings.length === 0) {
      throw new Error(`Invalid polygon at index ${i}`);
    }
    for (let j = 0; j < rings.length; j++) {
      if (!isValidLinearRing(rings[j])) {
        throw new Error(`Invalid ring at index ${j} in polygon ${i}`);
      }
    }
  }

  return {
    type: 'MultiPolygon',
    coordinates: polygons
  };
}

function isGeometryWithCoordinates(geometry: Geometry): geometry is Point | LineString | Polygon | MultiPoint | MultiLineString | MultiPolygon {
  return geometry.type !== 'GeometryCollection';
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
  if (!geometry || !geometry.type) {
    throw new Error('Invalid geometry: missing type');
  }

  if (isGeometryWithCoordinates(geometry) && !geometry.coordinates) {
    throw new Error('Invalid geometry: missing coordinates');
  }

  if (geometry.type === 'GeometryCollection' && (!geometry.geometries || !Array.isArray(geometry.geometries))) {
    throw new Error('Invalid GeometryCollection: missing or invalid geometries array');
  }

  return {
    type: 'Feature',
    geometry,
    properties: properties || {}
  };
}
