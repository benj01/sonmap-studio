import { Vector3, DxfEntity, DxfPolylineEntity } from './types';
import { Feature, Geometry, Point, LineString, Polygon } from 'geojson';
import { GeoFeature } from '../../../../types/geo';
import { CoordinateTransformer } from '../coordinate-utils';
import { COORDINATE_SYSTEMS } from '../../types/coordinates';
import { toMapboxCoordinates } from '../coordinate-systems';
import proj4 from 'proj4';

/**
 * Convert a Vector3 to a GeoJSON coordinate array, optionally transforming coordinates
 */
function vector3ToCoordinate(
  v: Vector3,
  transformer?: CoordinateTransformer
): [number, number] | [number, number, number] {
  try {
    if (transformer) {
      // For Swiss coordinates, x is Easting and y is Northing
      const transformed = transformer.transform({ x: v.x, y: v.y, z: v.z });
      if (transformed) {
        // transformed.x will be longitude and transformed.y will be latitude
        // after proj4 transformation, so no need to swap
        if (transformed.z !== undefined && isFinite(transformed.z)) {
          return [transformed.x, transformed.y, transformed.z];
        }
        return [transformed.x, transformed.y];
      }
    }
    
    // If no transformer or transformation failed, return original coordinates
    // For non-transformed coordinates, still need to ensure proper order
    if (v.z !== undefined && isFinite(v.z)) {
      return [v.x, v.y, v.z];
    }
    return [v.x, v.y];
  } catch (error) {
    console.error('Coordinate transformation error:', error);
    // Return original coordinates as fallback
    return [v.x, v.y];
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
 */
function polylineToGeometry(entity: DxfPolylineEntity, transformer?: CoordinateTransformer): Geometry | null {
  if (!entity.vertices || entity.vertices.length < 2) {
    return null;
  }

  const coordinates = entity.vertices.map(v => vector3ToCoordinate(v, transformer));
  
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
 * Convert a DXF entity to a GeoJSON feature
 */
export function entityToGeoFeature(
  entity: DxfEntity,
  properties: Record<string, any> = {},
  sourceCoordinateSystem?: string
): GeoFeature | null {
  let geometry: Geometry | null = null;
  let transformer: CoordinateTransformer | undefined;

  try {
    // Create transformer if source coordinate system is specified
    if (sourceCoordinateSystem && sourceCoordinateSystem !== COORDINATE_SYSTEMS.WGS84) {
      if (!proj4.defs(sourceCoordinateSystem)) {
        console.warn(`Source coordinate system ${sourceCoordinateSystem} not registered with proj4`);
      } else {
        transformer = new CoordinateTransformer(sourceCoordinateSystem, COORDINATE_SYSTEMS.WGS84);
      }
    }

    switch (entity.type) {
      case 'POINT':
        geometry = {
          type: 'Point',
          coordinates: vector3ToCoordinate(entity.position, transformer)
        };
        break;

      case 'LINE':
        geometry = {
          type: 'LineString',
          coordinates: [
            vector3ToCoordinate(entity.start, transformer),
            vector3ToCoordinate(entity.end, transformer)
          ]
        };
        break;

      case 'POLYLINE':
      case 'LWPOLYLINE':
        geometry = polylineToGeometry(entity, transformer);
        break;

      case 'CIRCLE':
        const circlePoints = generateArcPoints(entity.center, entity.radius);
        geometry = {
          type: 'Polygon',
          coordinates: [circlePoints.map(p => vector3ToCoordinate(p, transformer))]
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
          coordinates: arcPoints.map(p => vector3ToCoordinate(p, transformer))
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
            coordinates: [ellipsePoints.map(p => vector3ToCoordinate(p, transformer))]
          };
        } else {
          geometry = {
            type: 'LineString',
            coordinates: ellipsePoints.map(p => vector3ToCoordinate(p, transformer))
          };
        }
        break;

      case 'SPLINE':
        if (entity.controlPoints?.length >= 2) {
          geometry = {
            type: 'LineString',
            coordinates: entity.controlPoints.map(p => vector3ToCoordinate(p, transformer))
          };
        }
        break;

      case '3DFACE':
        if (entity.vertices?.length >= 3) {
          const coords = entity.vertices.map(p => vector3ToCoordinate(p, transformer));
          if (!coords[0].every((v, i) => v === coords[coords.length - 1][i])) {
            coords.push(coords[0]);
          }
          geometry = {
            type: 'Polygon',
            coordinates: [coords]
          };
        }
        break;

      case 'SOLID':
      case '3DSOLID':
        if (entity.vertices?.length >= 3) {
          const coords = entity.vertices.map(p => vector3ToCoordinate(p, transformer));
          if (!coords[0].every((v, i) => v === coords[coords.length - 1][i])) {
            coords.push(coords[0]);
          }
          geometry = {
            type: 'Polygon',
            coordinates: [coords]
          };
        }
        break;

      case 'INSERT':
        geometry = {
          type: 'Point',
          coordinates: vector3ToCoordinate(entity.position, transformer)
        };
        properties.blockName = entity.block;
        properties.scale = entity.scale;
        properties.rotation = entity.rotation;
        break;

      case 'TEXT':
      case 'MTEXT':
        geometry = {
          type: 'Point',
          coordinates: vector3ToCoordinate(entity.position, transformer)
        };
        properties.text = entity.text;
        properties.height = entity.height;
        properties.rotation = entity.rotation;
        properties.style = entity.style;
        break;

      case 'DIMENSION':
        geometry = {
          type: 'Point',
          coordinates: vector3ToCoordinate(entity.insertionPoint, transformer)
        };
        properties.dimensionType = entity.dimensionType;
        properties.text = entity.text;
        break;

      case 'LEADER':
      case 'MLEADER':
        if (entity.vertices?.length >= 2) {
          geometry = {
            type: 'LineString',
            coordinates: entity.vertices.map(p => vector3ToCoordinate(p, transformer))
          };
        }
        break;

      case 'HATCH':
        if (entity.boundaries?.length > 0) {
          const polygons = entity.boundaries
            .filter(boundary => boundary.length >= 3)
            .map(boundary => {
              const coords = boundary.map(p => vector3ToCoordinate(p, transformer));
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
        }
        break;
    }

    if (!geometry) {
      return null;
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
        ...properties
      }
    };
  } catch (error) {
    console.error(`Error converting ${entity.type} entity to GeoJSON:`, error);
    return null;
  }
}
