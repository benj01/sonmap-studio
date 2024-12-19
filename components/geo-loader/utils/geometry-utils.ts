import {
  Feature,
  Geometry,
  Point,
  LineString,
  Polygon,
  MultiPoint,
  MultiLineString,
  MultiPolygon,
  Position,
  GeometryCollection,
} from 'geojson';
import { GeoFeature } from '../../../types/geo';
import {
  ErrorReporter,
  InvalidCoordinateError,
  ValidationError,
} from '../errors';

/**
 * Create a GeoJSON Point geometry.
 * @param x - X coordinate (longitude)
 * @param y - Y coordinate (latitude)
 * @param z - Optional Z (altitude) coordinate
 */
export function createPointGeometry(
  x: number,
  y: number,
  z?: number
): Point {
  if (!isFinite(x) || !isFinite(y) || (z !== undefined && !isFinite(z))) {
    throw new InvalidCoordinateError(
      `Invalid point coordinates: ${x}, ${y}, ${z}`
    );
  }

  return {
    type: 'Point',
    coordinates: z !== undefined ? [x, y, z] : [x, y],
  };
}

/**
 * Create a GeoJSON LineString geometry.
 * @param coordinates - Array of [x, y] coordinates
 */
export function createLineStringGeometry(
  coordinates: Position[]
): LineString {
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    throw new ValidationError('LineString must have at least 2 coordinates');
  }

  coordinates.forEach(coord => {
    if (!isValidCoordinate(coord)) {
      throw new InvalidCoordinateError(`Invalid LineString coordinate: ${coord}`);
    }
  });

  return {
    type: 'LineString',
    coordinates: coordinates,
  };
}

/**
 * Create a GeoJSON Polygon geometry.
 * @param rings - Array of linear rings (each ring is an array of coordinates)
 * The first ring is the outer boundary, subsequent rings are holes.
 */
export function createPolygonGeometry(rings: Position[][]): Polygon {
  if (!Array.isArray(rings) || rings.length === 0) {
    throw new ValidationError('Invalid Polygon rings array');
  }

  // Validate each ring
  for (let i = 0; i < rings.length; i++) {
    if (!isValidLinearRing(rings[i])) {
      throw new ValidationError(`Invalid ring at index ${i}`);
    }
  }

  return {
    type: 'Polygon',
    coordinates: rings,
  };
}

/**
 * Create a GeoJSON MultiPoint geometry.
 * @param points - Array of point coordinates
 */
export function createMultiPointGeometry(points: Position[]): MultiPoint {
  if (!Array.isArray(points)) {
    throw new ValidationError('Invalid MultiPoint coordinates array');
  }

  points.forEach(point => {
    if (!isValidCoordinate(point)) {
      throw new InvalidCoordinateError(`Invalid MultiPoint coordinate: ${point}`);
    }
  })

  return {
    type: 'MultiPoint',
    coordinates: points,
  };
}

/**
 * Create a GeoJSON MultiLineString geometry.
 * @param lines - Array of line coordinate arrays
 */
export function createMultiLineStringGeometry(
  lines: Position[][]
): MultiLineString {
  if (!Array.isArray(lines)) {
    throw new ValidationError('Invalid MultiLineString lines array');
  }

  // Validate each line
  for (let i = 0; i < lines.length; i++) {
    if (!Array.isArray(lines[i]) || lines[i].length < 2) {
      throw new ValidationError(`Invalid line at index ${i}`);
    }
    lines[i].forEach(coord => {
      if (!isValidCoordinate(coord)) {
        throw new InvalidCoordinateError(`Invalid MultiLineString coordinate: ${coord}`);
      }
    });
  }

  return {
    type: 'MultiLineString',
    coordinates: lines,
  };
}

/**
 * Create a GeoJSON MultiPolygon geometry.
 * @param polygons - Array of polygon coordinate arrays
 */
export function createMultiPolygonGeometry(
  polygons: Position[][][]
): MultiPolygon {
  if (!Array.isArray(polygons)) {
    throw new ValidationError('Invalid MultiPolygon polygons array');
  }

  // Validate each polygon
  for (let i = 0; i < polygons.length; i++) {
    const rings = polygons[i];
    if (!Array.isArray(rings) || rings.length === 0) {
      throw new ValidationError(`Invalid polygon at index ${i}`);
    }
    for (let j = 0; j < rings.length; j++) {
      if (!isValidLinearRing(rings[j])) {
        throw new ValidationError(`Invalid ring at index ${j} in polygon ${i}`);
      }
    }
  }

  return {
    type: 'MultiPolygon',
    coordinates: polygons,
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
  if (!geometry || !geometry.type) {
    throw new ValidationError('Invalid geometry: missing type');
  }

  if (!isValidGeometry(geometry)) {
    throw new ValidationError('Invalid geometry');
  }

  return {
    type: 'Feature',
    geometry,
    properties: properties || {},
  };
}

/**
 * Validate a coordinate.
 */
export const isValidCoordinate = (coord: unknown): coord is Position => {
  return (
    Array.isArray(coord) &&
    coord.length >= 2 &&
    typeof coord[0] === 'number' &&
    typeof coord[1] === 'number'
  );
};

/**
 * Validate a linear ring (polygon boundary).
 * A valid ring has at least 4 coordinates and the first equals the last.
 */
const isValidLinearRing = (ring: unknown): ring is Position[] => {
  if (!Array.isArray(ring) || ring.length < 4) return false;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (!isValidCoordinate(first) || !isValidCoordinate(last)) return false;
  return first[0] === last[0] && first[1] === last[1];
};

/**
 * Validate a geometry.
 */
export const isValidGeometry = (
  geometry: unknown
): geometry is Geometry => {
  if (
    !geometry ||
    typeof geometry !== 'object' ||
    !('type' in geometry) ||
    !('coordinates' in geometry)
  ) {
    return false;
  }

  const geo = geometry as Geometry;
  switch (geo.type) {
    case 'Point':
      return isValidCoordinate(geo.coordinates);
    case 'LineString':
    case 'MultiPoint':
      return (
        Array.isArray(geo.coordinates) &&
        geo.coordinates.length >= 2 &&
        geo.coordinates.every(isValidCoordinate)
      );
    case 'Polygon':
      return (
        Array.isArray(geo.coordinates) &&
        geo.coordinates.length > 0 &&
        geo.coordinates.every(isValidLinearRing)
      );
    case 'MultiLineString':
      return (
        Array.isArray(geo.coordinates) &&
        geo.coordinates.every(
          (line: unknown) =>
            Array.isArray(line) && line.every(isValidCoordinate)
        )
      );
    case 'MultiPolygon':
      return (
        Array.isArray(geo.coordinates) &&
        geo.coordinates.every((poly: unknown) =>
          Array.isArray(poly) && poly.every(isValidLinearRing)
        )
      );
    case 'GeometryCollection':
      return false; // Not supported for now
    default:
      return false;
  }
};

export function createFeature(
  geometry: Geometry,
  properties: Record<string, any> = {}
): GeoFeature {
  if (!geometry || !geometry.type) {
    throw new Error('Invalid geometry: missing type');
  }

  if (!isValidGeometry(geometry)) {
    throw new Error('Invalid geometry');
  }

  return {
    type: 'Feature',
    geometry,
    properties: properties || {}
  };
}