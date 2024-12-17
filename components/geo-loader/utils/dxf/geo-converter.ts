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

    // Add other entity type conversions as needed
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
}
