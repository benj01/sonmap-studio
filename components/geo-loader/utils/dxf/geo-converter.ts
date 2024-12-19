import proj4 from 'proj4';
import {
  Vector3,
  DxfEntity,
  DxfPolylineEntity,
  DxfPointEntity
} from './types';
import {
  Feature,
  Geometry,
  Point,
  LineString,
  Polygon
} from 'geojson';
import { GeoFeature } from '../../../../types/geo';
import { CoordinateTransformer } from '../coordinate-utils';
import { COORDINATE_SYSTEMS, CoordinateSystem } from '../../types/coordinates';
import { CoordinateTransformationError, ErrorReporter } from '../errors';

/**
 * Validates if coordinates are within valid WGS84 bounds
 */
function validateWGS84Coordinates(x: number, y: number): boolean {
  return (
    isFinite(x) && isFinite(y) &&
    x >= -180 && x <= 180 &&
    y >= -90 && y <= 90
  );
}

/**
 * Converts a Vector3 point to a GeoJSON coordinate array
 */
function vector3ToCoordinate(
  point: Vector3,
  transformer: CoordinateTransformer | undefined,
  errorReporter: ErrorReporter,
  featureId?: string,
  layer?: string
): [number, number] | [number, number, number] | null {
  try {
    if (transformer) {
      const result = transformer.transform(point, featureId, layer);
      if (!result) {
        return null;
      }
      return result.z !== undefined
        ? [result.x, result.y, result.z]
        : [result.x, result.y];
    }

    // If no transformer, validate coordinates are already in WGS84
    if (!validateWGS84Coordinates(point.x, point.y)) {
      throw new CoordinateTransformationError(
        'Invalid WGS84 coordinates',
        point,
        COORDINATE_SYSTEMS.NONE,
        COORDINATE_SYSTEMS.WGS84,
        featureId,
        layer
      );
    }

    return point.z !== undefined
      ? [point.x, point.y, point.z]
      : [point.x, point.y];
  } catch (error) {
    if (error instanceof CoordinateTransformationError) {
      errorReporter.reportError('TRANSFORM_ERROR', error.message, {
        originalCoordinates: error.originalCoordinates,
        fromSystem: error.fromSystem,
        toSystem: error.toSystem,
        featureId: error.featureId,
        layer: error.layer
      });
    } else {
      errorReporter.reportError('COORDINATE_ERROR', 'Failed to convert coordinates', {
        error: error instanceof Error ? error.message : 'Unknown error',
        point,
        featureId,
        layer
      });
    }
    return null;
  }
}

/**
 * Converts angle from degrees to radians
 */
function toRadians(degrees: number): number {
  return degrees * Math.PI / 180;
}

/**
 * Generates points along an arc or circle
 */
function generateArcPoints(
  center: Vector3,
  radius: number,
  startAngle: number,
  endAngle: number,
  segments: number = 32
): Vector3[] {
  const points: Vector3[] = [];
  const angleStep = (endAngle - startAngle) / segments;

  for (let i = 0; i <= segments; i++) {
    const angle = toRadians(startAngle + i * angleStep);
    points.push({
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle),
      z: center.z
    });
  }

  return points;
}

/**
 * Generates points along an ellipse
 */
function generateEllipsePoints(
  center: Vector3,
  majorAxis: Vector3,
  minorAxisRatio: number,
  startAngle: number,
  endAngle: number,
  segments: number = 32
): Vector3[] {
  const points: Vector3[] = [];
  const angleStep = (endAngle - startAngle) / segments;
  const majorRadius = Math.sqrt(
    Math.pow(majorAxis.x - center.x, 2) +
    Math.pow(majorAxis.y - center.y, 2)
  );
  const minorRadius = majorRadius * minorAxisRatio;

  for (let i = 0; i <= segments; i++) {
    const angle = toRadians(startAngle + i * angleStep);
    points.push({
      x: center.x + majorRadius * Math.cos(angle),
      y: center.y + minorRadius * Math.sin(angle),
      z: center.z
    });
  }

  return points;
}

/**
 * Converts a DXF polyline to a GeoJSON geometry
 */
function polylineToGeometry(
  entity: DxfPolylineEntity,
  transformer: CoordinateTransformer | undefined,
  errorReporter: ErrorReporter
): Geometry | null {
  const coordinates = entity.vertices
    .map(v => vector3ToCoordinate(v, transformer, errorReporter, entity.handle, entity.layer))
    .filter((coord): coord is [number, number] | [number, number, number] => coord !== null);

  if (coordinates.length < 2) {
    errorReporter.reportError('GEOMETRY_ERROR', 'Polyline has insufficient valid vertices', {
      entity
    });
    return null;
  }

  // Close the polygon if it's flagged as closed
  if (entity.closed && coordinates.length >= 3) {
    coordinates.push(coordinates[0]);
    return {
      type: 'Polygon',
      coordinates: [coordinates]
    };
  }

  return {
    type: 'LineString',
    coordinates
  };
}

/**
 * Converts a DXF entity to a GeoJSON feature
 */
export function entityToGeoFeature(
  entity: DxfEntity,
  sourceCoordinateSystem: CoordinateSystem | undefined,
  errorReporter: ErrorReporter,
  proj4Instance: typeof proj4
): GeoFeature | null {
  let transformer: CoordinateTransformer | undefined;
  
  if (sourceCoordinateSystem && sourceCoordinateSystem !== COORDINATE_SYSTEMS.WGS84) {
    transformer = new CoordinateTransformer(
      sourceCoordinateSystem,
      COORDINATE_SYSTEMS.WGS84,
      errorReporter,
      proj4Instance
    );
  }

  try {
    let geometry: Geometry | null = null;
    const properties: Record<string, any> = {
      type: entity.type,
      layer: entity.layer,
      handle: entity.handle,
      color: entity.color,
      lineType: entity.lineType
    };

    switch (entity.type) {
      case 'POINT': {
        const pointEntity = entity as DxfPointEntity;
        const coord = vector3ToCoordinate(
          pointEntity.position,
          transformer,
          errorReporter,
          entity.handle,
          entity.layer
        );
        if (!coord) return null;
        geometry = {
          type: 'Point',
          coordinates: coord
        };
        break;
      }

      case 'LINE': {
        const start = vector3ToCoordinate(entity.start, transformer, errorReporter, entity.handle, entity.layer);
        const end = vector3ToCoordinate(entity.end, transformer, errorReporter, entity.handle, entity.layer);
        if (!start || !end) return null;
        geometry = {
          type: 'LineString',
          coordinates: [start, end]
        };
        break;
      }

      case 'POLYLINE':
      case 'LWPOLYLINE': {
        geometry = polylineToGeometry(entity, transformer, errorReporter);
        break;
      }

      case 'CIRCLE': {
        const points = generateArcPoints(
          entity.center,
          entity.radius,
          0,
          360
        ).map(p => vector3ToCoordinate(p, transformer, errorReporter, entity.handle, entity.layer))
         .filter((coord): coord is [number, number] | [number, number, number] => coord !== null);

        if (points.length < 3) return null;
        points.push(points[0]); // Close the polygon
        geometry = {
          type: 'Polygon',
          coordinates: [points]
        };
        break;
      }

      case 'ARC': {
        const points = generateArcPoints(
          entity.center,
          entity.radius,
          entity.startAngle,
          entity.endAngle
        ).map(p => vector3ToCoordinate(p, transformer, errorReporter, entity.handle, entity.layer))
         .filter((coord): coord is [number, number] | [number, number, number] => coord !== null);

        if (points.length < 2) return null;
        geometry = {
          type: 'LineString',
          coordinates: points
        };
        break;
      }

      case 'ELLIPSE': {
        const points = generateEllipsePoints(
          entity.center,
          entity.majorAxis,
          entity.minorAxisRatio,
          entity.startAngle ?? 0,
          entity.endAngle ?? 360
        ).map(p => vector3ToCoordinate(p, transformer, errorReporter, entity.handle, entity.layer))
         .filter((coord): coord is [number, number] | [number, number, number] => coord !== null);

        if (points.length < 2) return null;
        geometry = {
          type: 'LineString',
          coordinates: points
        };
        break;
      }

      default:
        errorReporter.reportWarning('UNSUPPORTED_ENTITY', `Unsupported entity type: ${entity.type}`, {
          entity
        });
        return null;
    }

    if (!geometry) {
      errorReporter.reportError('GEOMETRY_ERROR', 'Failed to generate geometry', {
        entity
      });
      return null;
    }

    return {
      type: 'Feature',
      geometry,
      properties
    };
  } catch (error) {
    errorReporter.reportError('CONVERSION_ERROR', 'Failed to convert entity to GeoJSON feature', {
      error: error instanceof Error ? error.message : 'Unknown error',
      entity
    });
    return null;
  }
}
