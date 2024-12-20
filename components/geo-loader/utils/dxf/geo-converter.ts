import { Vector3, DxfEntity, DxfPolylineEntity } from './types';
import { Feature, Geometry, Point, LineString, Polygon } from 'geojson';
import { GeoFeature } from '../../../../types/geo';
import { CoordinateTransformer } from '../coordinate-utils';
import { COORDINATE_SYSTEMS } from '../../types/coordinates';
import { DxfErrorReporter, createDxfErrorReporter } from './error-collector';
import proj4 from 'proj4';

const errorReporter = createDxfErrorReporter();

export class CoordinateTransformationError extends Error {
  constructor(
    message: string, 
    public originalCoordinates: Vector3,
    public details?: {
      type: string;
      transformedCoordinates?: { x: number; y: number; z?: number };
      sourceSystem?: string;
      targetSystem?: string;
    }
  ) {
    super(message);
    this.name = 'CoordinateTransformationError';
  }
}

/**
 * Validates transformed coordinates are within expected WGS84 bounds
 */
function validateWGS84Coordinates(coords: { x: number; y: number; z?: number }): boolean {
  // Valid longitude range: -180 to 180
  // Valid latitude range: -90 to 90
  return coords.x >= -180 && coords.x <= 180 && coords.y >= -90 && coords.y <= 90;
}

/**
 * Convert a Vector3 to a GeoJSON coordinate array, with mandatory coordinate transformation
 * @throws CoordinateTransformationError if transformation fails or produces invalid coordinates
 */
function vector3ToCoordinate(
  v: Vector3,
  transformer?: CoordinateTransformer,
  sourceSystem?: string
): [number, number] | [number, number, number] {
  if (!transformer) {
    // If no transformer is provided, assume coordinates are already in WGS84
    if (!validateWGS84Coordinates({ x: v.x, y: v.y })) {
      throw new CoordinateTransformationError(
        'Coordinates appear to not be in WGS84 format but no transformer was provided',
        v,
        {
          type: 'NO_TRANSFORMER',
          transformedCoordinates: { x: v.x, y: v.y, z: v.z }
        }
      );
    }
    return v.z !== undefined && isFinite(v.z) ? [v.x, v.y, v.z] : [v.x, v.y];
  }

  try {
    const transformed = transformer.transform({ x: v.x, y: v.y, z: v.z });
    if (!transformed) {
      throw new CoordinateTransformationError(
        'Coordinate transformation failed',
        v,
        {
          type: 'TRANSFORM_FAILED',
          sourceSystem,
          targetSystem: COORDINATE_SYSTEMS.WGS84
        }
      );
    }

    // Coordinate swapping is now handled in the transformer
    const [x, y] = [transformed.x, transformed.y];

    if (!validateWGS84Coordinates({ x, y })) {
      errorReporter.addDxfError('Invalid transformed coordinates', {
        type: 'INVALID_COORDINATES',
        original: v,
        transformed: { x, y, z: transformed.z }
      });
      throw new CoordinateTransformationError(
        `Transformed coordinates (${x}, ${y}) are outside valid WGS84 bounds`,
        v,
        {
          type: 'INVALID_BOUNDS',
          transformedCoordinates: { x, y, z: transformed.z },
          sourceSystem,
          targetSystem: COORDINATE_SYSTEMS.WGS84
        }
      );
    }

    return transformed.z !== undefined && isFinite(transformed.z)
      ? [x, y, transformed.z]
      : [x, y];
  } catch (error) {
    if (error instanceof CoordinateTransformationError) {
      throw error;
    }
    throw new CoordinateTransformationError(
      `Transformation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      v,
      {
        type: 'TRANSFORM_ERROR',
        sourceSystem,
        targetSystem: COORDINATE_SYSTEMS.WGS84
      }
    );
  }
}

/**
 * Convert angle in degrees to radians
 */
function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Generate points along an arc or circle
 */
function generateArcPoints(
  center: Vector3,
  radius: number,
  startAngle: number = 0,
  endAngle: number = 360,
  segments: number = 32
): Vector3[] {
  const points: Vector3[] = [];
  const startRad = toRadians(startAngle);
  const endRad = toRadians(endAngle);
  const totalAngle = endAngle > startAngle ? endRad - startRad : (2 * Math.PI) - (startRad - endRad);
  const angleStep = totalAngle / segments;

  for (let i = 0; i <= segments; i++) {
    const angle = startRad + (i * angleStep);
    points.push({
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle),
      z: center.z || 0
    });
  }

  return points;
}

/**
 * Generate points along an ellipse
 */
function generateEllipsePoints(
  center: Vector3,
  majorAxis: Vector3,
  minorAxisRatio: number,
  startAngle: number = 0,
  endAngle: number = 360,
  segments: number = 32
): Vector3[] {
  const points: Vector3[] = [];
  const startRad = toRadians(startAngle);
  const endRad = toRadians(endAngle);
  const totalAngle = endAngle > startAngle ? endRad - startRad : (2 * Math.PI) - (startRad - endRad);
  const angleStep = totalAngle / segments;

  const majorLength = Math.sqrt(
    Math.pow(majorAxis.x, 2) + Math.pow(majorAxis.y, 2)
  );
  const minorLength = majorLength * minorAxisRatio;
  const rotation = Math.atan2(majorAxis.y, majorAxis.x);

  for (let i = 0; i <= segments; i++) {
    const angle = startRad + (i * angleStep);
    const x = Math.cos(angle);
    const y = Math.sin(angle);
    
    const scaledX = x * majorLength;
    const scaledY = y * minorLength;
    
    const rotatedX = scaledX * Math.cos(rotation) - scaledY * Math.sin(rotation);
    const rotatedY = scaledX * Math.sin(rotation) + scaledY * Math.cos(rotation);
    
    points.push({
      x: center.x + rotatedX,
      y: center.y + rotatedY,
      z: center.z || 0
    });
  }

  return points;
}

/**
 * Convert a DXF LWPOLYLINE/POLYLINE to a GeoJSON LineString or Polygon
 * @throws CoordinateTransformationError if transformation fails
 */
function polylineToGeometry(
  entity: DxfPolylineEntity,
  transformer?: CoordinateTransformer,
  sourceSystem?: string
): Geometry | null {
  if (!entity.vertices || entity.vertices.length < 2) {
    errorReporter.addEntityError(
      entity.type,
      entity.handle || 'unknown',
      'Insufficient vertices for polyline',
      {
        type: 'INSUFFICIENT_VERTICES',
        vertexCount: entity.vertices?.length ?? 0,
        minimumRequired: 2
      }
    );
    return null;
  }

  const coordinates = entity.vertices.map(v => vector3ToCoordinate(v, transformer, sourceSystem));
  
  if (entity.closed) {
    if (!coordinates[0].every((v, i) => v === coordinates[coordinates.length - 1][i])) {
      coordinates.push(coordinates[0]);
    }
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
 * Convert a DXF entity to a GeoJSON feature with robust coordinate transformation
 * @throws CoordinateTransformationError if any coordinate transformation fails
 */
export function entityToGeoFeature(
  entity: DxfEntity,
  properties: Record<string, any> = {},
  sourceCoordinateSystem?: string
): GeoFeature {
  let transformer: CoordinateTransformer | undefined;

  // Create transformer if source coordinate system is specified and different from WGS84
  if (sourceCoordinateSystem && sourceCoordinateSystem !== COORDINATE_SYSTEMS.WGS84) {
    if (!proj4.defs(sourceCoordinateSystem)) {
      errorReporter.addDxfError(`Source coordinate system ${sourceCoordinateSystem} not registered with proj4`, {
        type: 'INVALID_COORDINATE_SYSTEM',
        system: sourceCoordinateSystem
      });
      throw new Error(`Source coordinate system ${sourceCoordinateSystem} not registered with proj4`);
    }
    transformer = new CoordinateTransformer(sourceCoordinateSystem, COORDINATE_SYSTEMS.WGS84);
    errorReporter.addDxfWarning('Created coordinate transformer', {
      type: 'TRANSFORMER_CREATED',
      from: sourceCoordinateSystem,
      to: COORDINATE_SYSTEMS.WGS84
    });
  }

  try {
    let geometry: Geometry | null = null;

    switch (entity.type) {
      case 'POINT':
        geometry = {
          type: 'Point',
          coordinates: vector3ToCoordinate(entity.position, transformer, sourceCoordinateSystem)
        };
        break;

      case 'LINE':
        geometry = {
          type: 'LineString',
          coordinates: [
            vector3ToCoordinate(entity.start, transformer, sourceCoordinateSystem),
            vector3ToCoordinate(entity.end, transformer, sourceCoordinateSystem)
          ]
        };
        break;

      case 'POLYLINE':
      case 'LWPOLYLINE':
        geometry = polylineToGeometry(entity, transformer, sourceCoordinateSystem);
        break;

      case 'CIRCLE':
        const circlePoints = generateArcPoints(entity.center, entity.radius);
        geometry = {
          type: 'Polygon',
          coordinates: [circlePoints.map(p => vector3ToCoordinate(p, transformer, sourceCoordinateSystem))]
        };
        break;

      case 'ARC':
        const arcPoints = generateArcPoints(
          entity.center,
          entity.radius,
          entity.startAngle,
          entity.endAngle
        );
        geometry = {
          type: 'LineString',
          coordinates: arcPoints.map(p => vector3ToCoordinate(p, transformer, sourceCoordinateSystem))
        };
        break;

      case 'ELLIPSE':
        const ellipsePoints = generateEllipsePoints(
          entity.center,
          entity.majorAxis,
          entity.minorAxisRatio,
          entity.startAngle,
          entity.endAngle
        );
        if (Math.abs(entity.endAngle - entity.startAngle) >= 360) {
          geometry = {
            type: 'Polygon',
            coordinates: [ellipsePoints.map(p => vector3ToCoordinate(p, transformer, sourceCoordinateSystem))]
          };
        } else {
          geometry = {
            type: 'LineString',
            coordinates: ellipsePoints.map(p => vector3ToCoordinate(p, transformer, sourceCoordinateSystem))
          };
        }
        break;

      case 'SPLINE':
        if (entity.controlPoints?.length >= 2) {
          geometry = {
            type: 'LineString',
            coordinates: entity.controlPoints.map(p => vector3ToCoordinate(p, transformer, sourceCoordinateSystem))
          };
        } else {
          errorReporter.addEntityError(
            'SPLINE',
            entity.handle || 'unknown',
            'Insufficient control points',
            {
              type: 'INSUFFICIENT_CONTROL_POINTS',
              pointCount: entity.controlPoints?.length ?? 0,
              minimumRequired: 2
            }
          );
        }
        break;

      case '3DFACE':
        if (entity.vertices?.length >= 3) {
          const coords = entity.vertices.map(p => vector3ToCoordinate(p, transformer, sourceCoordinateSystem));
          if (!coords[0].every((v, i) => v === coords[coords.length - 1][i])) {
            coords.push(coords[0]);
          }
          geometry = {
            type: 'Polygon',
            coordinates: [coords]
          };
        } else {
          errorReporter.addEntityError(
            '3DFACE',
            entity.handle || 'unknown',
            'Insufficient vertices',
            {
              type: 'INSUFFICIENT_VERTICES',
              vertexCount: entity.vertices?.length ?? 0,
              minimumRequired: 3
            }
          );
        }
        break;

      case 'SOLID':
      case '3DSOLID':
        if (entity.vertices?.length >= 3) {
          const coords = entity.vertices.map(p => vector3ToCoordinate(p, transformer, sourceCoordinateSystem));
          if (!coords[0].every((v, i) => v === coords[coords.length - 1][i])) {
            coords.push(coords[0]);
          }
          geometry = {
            type: 'Polygon',
            coordinates: [coords]
          };
        } else {
          errorReporter.addEntityError(
            entity.type,
            entity.handle || 'unknown',
            'Insufficient vertices',
            {
              type: 'INSUFFICIENT_VERTICES',
              vertexCount: entity.vertices?.length ?? 0,
              minimumRequired: 3
            }
          );
        }
        break;

      case 'INSERT':
        geometry = {
          type: 'Point',
          coordinates: vector3ToCoordinate(entity.position, transformer, sourceCoordinateSystem)
        };
        properties.blockName = entity.block;
        properties.scale = entity.scale;
        properties.rotation = entity.rotation;
        break;

      case 'TEXT':
      case 'MTEXT':
        geometry = {
          type: 'Point',
          coordinates: vector3ToCoordinate(entity.position, transformer, sourceCoordinateSystem)
        };
        properties.text = entity.text;
        properties.height = entity.height;
        properties.rotation = entity.rotation;
        properties.style = entity.style;
        break;

      case 'DIMENSION':
        geometry = {
          type: 'Point',
          coordinates: vector3ToCoordinate(entity.insertionPoint, transformer, sourceCoordinateSystem)
        };
        properties.dimensionType = entity.dimensionType;
        properties.text = entity.text;
        break;

      case 'LEADER':
      case 'MLEADER':
        if (entity.vertices?.length >= 2) {
          geometry = {
            type: 'LineString',
            coordinates: entity.vertices.map(p => vector3ToCoordinate(p, transformer, sourceCoordinateSystem))
          };
        } else {
          errorReporter.addEntityError(
            entity.type,
            entity.handle || 'unknown',
            'Insufficient vertices',
            {
              type: 'INSUFFICIENT_VERTICES',
              vertexCount: entity.vertices?.length ?? 0,
              minimumRequired: 2
            }
          );
        }
        break;

      case 'HATCH':
        if (entity.boundaries?.length > 0) {
          const polygons = entity.boundaries
            .filter(boundary => boundary.length >= 3)
            .map(boundary => {
              const coords = boundary.map(p => vector3ToCoordinate(p, transformer, sourceCoordinateSystem));
              if (!coords[0].every((v, i) => v === coords[coords.length - 1][i])) {
                coords.push(coords[0]);
              }
              return coords;
            });

          if (polygons.length === 1) {
            geometry = {
              type: 'Polygon',
              coordinates: polygons
            };
          } else if (polygons.length > 1) {
            geometry = {
              type: 'MultiPolygon',
              coordinates: polygons.map(poly => [poly])
            };
          }
        } else {
          errorReporter.addEntityError(
            'HATCH',
            entity.handle || 'unknown',
            'No valid boundaries',
            {
              type: 'NO_BOUNDARIES',
              boundaryCount: entity.boundaries?.length ?? 0
            }
          );
        }
        break;

      default:
        errorReporter.addEntityWarning(
          entity.type,
          entity.handle || 'unknown',
          'Unsupported entity type',
          {
            type: 'UNSUPPORTED_TYPE'
          }
        );
        throw new Error(`Unsupported entity type: ${entity.type}`);
    }

    if (!geometry) {
      errorReporter.addEntityError(
        entity.type,
        entity.handle || 'unknown',
        'Failed to generate geometry',
        {
          type: 'GEOMETRY_GENERATION_FAILED'
        }
      );
      throw new Error(`Failed to generate geometry for entity type: ${entity.type}`);
    }

    return {
      type: 'Feature',
      geometry,
      properties: {
        id: entity.handle,
        type: entity.type,
        layer: entity.layer || '0',
        color: entity.color,
        colorRGB: entity.colorRGB,
        lineType: entity.lineType,
        lineWeight: entity.lineWeight,
        elevation: entity.elevation,
        thickness: entity.thickness,
        visible: entity.visible,
        extrusionDirection: entity.extrusionDirection,
        sourceCoordinateSystem,
        transformationSuccess: true,
        ...properties
      }
    };
  } catch (error) {
    if (error instanceof CoordinateTransformationError) {
      // Add error to error reporter before re-throwing
      errorReporter.addEntityError(
        entity.type,
        entity.handle || 'unknown',
        error.message,
        {
          type: 'COORDINATE_TRANSFORMATION_ERROR',
          originalCoordinates: error.originalCoordinates,
          ...error.details
        }
      );
      throw error;
    }
    errorReporter.addEntityError(
      entity.type,
      entity.handle || 'unknown',
      `Error converting to GeoJSON: ${error instanceof Error ? error.message : 'Unknown error'}`,
      {
        type: 'CONVERSION_ERROR',
        error: String(error)
      }
    );
    throw error;
  }
}

export function getErrors() {
  return errorReporter.getErrors();
}

export function getWarnings() {
  return errorReporter.getWarnings();
}

export function clear() {
  errorReporter.clear();
}
