import { Vector3, DxfEntity, DxfPolylineEntity } from './types';
import { Feature, Geometry, Point, LineString, Polygon } from 'geojson';
import { GeoFeature } from '../../../../types/geo';

/**
 * Convert a Vector3 to a GeoJSON coordinate array
 */
function vector3ToCoordinate(v: Vector3): [number, number] | [number, number, number] {
  if (v.z !== undefined && isFinite(v.z)) {
    return [v.x, v.y, v.z];
  }
  return [v.x, v.y];
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

  // Calculate major and minor axis lengths
  const majorLength = Math.sqrt(
    Math.pow(majorAxis.x, 2) + Math.pow(majorAxis.y, 2)
  );
  const minorLength = majorLength * minorAxisRatio;

  // Calculate rotation angle of the ellipse
  const rotation = Math.atan2(majorAxis.y, majorAxis.x);

  for (let i = 0; i <= segments; i++) {
    const angle = startRad + (i * angleStep);
    // Generate point on unit circle
    const x = Math.cos(angle);
    const y = Math.sin(angle);
    
    // Scale to ellipse size
    const scaledX = x * majorLength;
    const scaledY = y * minorLength;
    
    // Rotate
    const rotatedX = scaledX * Math.cos(rotation) - scaledY * Math.sin(rotation);
    const rotatedY = scaledX * Math.sin(rotation) + scaledY * Math.cos(rotation);
    
    // Translate to center
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
function polylineToGeometry(entity: DxfPolylineEntity): Geometry | null {
  if (!entity.vertices || entity.vertices.length < 2) {
    return null;
  }

  const coordinates = entity.vertices.map(vector3ToCoordinate);
  
  // If the polyline is closed, make it a polygon
  if (entity.closed) {
    // Add the first point at the end to close the ring if needed
    if (!coordinates[0].every((v, i) => v === coordinates[coordinates.length - 1][i])) {
      coordinates.push(coordinates[0]);
    }
    return {
      type: 'Polygon',
      coordinates: [coordinates]
    };
  }

  // Otherwise make it a LineString
  return {
    type: 'LineString',
    coordinates
  };
}

/**
 * Convert a DXF entity to a GeoJSON feature
 */
export function entityToGeoFeature(entity: DxfEntity, properties: Record<string, any> = {}): GeoFeature | null {
  let geometry: Geometry | null = null;

  try {
    switch (entity.type) {
      case 'POINT':
        geometry = {
          type: 'Point',
          coordinates: vector3ToCoordinate(entity.position)
        };
        break;

      case 'LINE':
        geometry = {
          type: 'LineString',
          coordinates: [
            vector3ToCoordinate(entity.start),
            vector3ToCoordinate(entity.end)
          ]
        };
        break;

      case 'POLYLINE':
      case 'LWPOLYLINE':
        geometry = polylineToGeometry(entity);
        break;

      case 'CIRCLE':
        const circlePoints = generateArcPoints(entity.center, entity.radius);
        geometry = {
          type: 'Polygon',
          coordinates: [circlePoints.map(vector3ToCoordinate)]
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
          coordinates: arcPoints.map(vector3ToCoordinate)
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
        // If it's a full ellipse (start = 0, end = 360), make it a polygon
        if (Math.abs(entity.endAngle - entity.startAngle) >= 360) {
          geometry = {
            type: 'Polygon',
            coordinates: [ellipsePoints.map(vector3ToCoordinate)]
          };
        } else {
          geometry = {
            type: 'LineString',
            coordinates: ellipsePoints.map(vector3ToCoordinate)
          };
        }
        break;

      case 'SPLINE':
        if (entity.controlPoints?.length >= 2) {
          geometry = {
            type: 'LineString',
            coordinates: entity.controlPoints.map(vector3ToCoordinate)
          };
        }
        break;

      case '3DFACE':
        if (entity.vertices?.length >= 3) {
          const coords = entity.vertices.map(vector3ToCoordinate);
          // Ensure the polygon is closed
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
          const coords = entity.vertices.map(vector3ToCoordinate);
          // Ensure the polygon is closed
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
        // For block insertions, create a point feature at the insertion point
        geometry = {
          type: 'Point',
          coordinates: vector3ToCoordinate(entity.position)
        };
        // Add block reference info to properties
        properties.blockName = entity.block;
        properties.scale = entity.scale;
        properties.rotation = entity.rotation;
        break;

      case 'TEXT':
      case 'MTEXT':
        // Create a point feature at the text position
        geometry = {
          type: 'Point',
          coordinates: vector3ToCoordinate(entity.position)
        };
        // Add text properties
        properties.text = entity.text;
        properties.height = entity.height;
        properties.rotation = entity.rotation;
        properties.style = entity.style;
        break;

      case 'DIMENSION':
        // Create a point feature at the dimension insertion point
        geometry = {
          type: 'Point',
          coordinates: vector3ToCoordinate(entity.insertionPoint)
        };
        properties.dimensionType = entity.dimensionType;
        properties.text = entity.text;
        break;

      case 'LEADER':
      case 'MLEADER':
        if (entity.vertices?.length >= 2) {
          geometry = {
            type: 'LineString',
            coordinates: entity.vertices.map(vector3ToCoordinate)
          };
        }
        break;

      case 'HATCH':
        if (entity.boundaries?.length > 0) {
          // Convert each boundary to a polygon
          const polygons = entity.boundaries
            .filter(boundary => boundary.length >= 3)
            .map(boundary => {
              const coords = boundary.map(vector3ToCoordinate);
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
        ...properties
      }
    };
  } catch (error) {
    console.error(`Error converting ${entity.type} entity to GeoJSON:`, error);
    return null;
  }
}
