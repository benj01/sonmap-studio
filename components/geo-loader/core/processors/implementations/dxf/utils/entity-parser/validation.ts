import { Point, LineString, Polygon, Position, DxfEntityType, GroupCode } from './types';

/**
 * Validate geometry coordinates
 */
export function validateGeometry(geometry: Point | LineString | Polygon): boolean {
  if (!geometry || !geometry.coordinates) return false;

  const validateCoordinate = (coord: number[]): boolean => {
    return (
      Array.isArray(coord) &&
      coord.length >= 2 &&
      coord.every(n => typeof n === 'number' && !isNaN(n))
    );
  };

  switch (geometry.type) {
    case 'Point':
      return validateCoordinate(geometry.coordinates);
    case 'LineString':
      return (
        Array.isArray(geometry.coordinates) &&
        geometry.coordinates.length >= 2 &&
        geometry.coordinates.every(validateCoordinate)
      );
    case 'Polygon':
      return (
        Array.isArray(geometry.coordinates) &&
        geometry.coordinates.length > 0 &&
        geometry.coordinates.every((ring: Position[]) =>
          Array.isArray(ring) &&
          ring.length >= 4 &&
          ring.every(validateCoordinate) &&
          JSON.stringify(ring[0]) === JSON.stringify(ring[ring.length - 1])
        )
      );
    default:
      return false;
  }
}

/**
 * Check if entity type is valid
 */
export function isValidEntityType(type: string): type is DxfEntityType {
  return [
    'POINT',
    'LINE',
    'POLYLINE',
    'LWPOLYLINE',
    'CIRCLE',
    'ARC',
    'ELLIPSE',
    'INSERT',
    'TEXT',
    'MTEXT',
    'DIMENSION'
  ].includes(type);
}

/**
 * Validate vertex coordinates
 */
export function validateVertex(vertex: { x?: number; y?: number; z?: number }): boolean {
  return (
    typeof vertex.x === 'number' && !isNaN(vertex.x) &&
    typeof vertex.y === 'number' && !isNaN(vertex.y) &&
    (vertex.z === undefined || (typeof vertex.z === 'number' && !isNaN(vertex.z)))
  );
}

/**
 * Validate group code value based on code type
 */
export function validateGroupCode(groupCode: GroupCode): boolean {
  const { code, value } = groupCode;

  // Common validation: code must be a number and value must be non-empty
  if (typeof code !== 'number' || !value) {
    return false;
  }

  // Validate based on code ranges
  if (code >= 0 && code <= 9) {
    // String value (with group code of 0-9)
    return typeof value === 'string';
  } else if (code >= 10 && code <= 59) {
    // Floating point value
    const num = parseFloat(value);
    return !isNaN(num);
  } else if (code >= 60 && code <= 79) {
    // 16-bit integer value
    const num = parseInt(value);
    return !isNaN(num) && num >= -32768 && num <= 32767;
  } else if (code >= 90 && code <= 99) {
    // 32-bit integer value
    const num = parseInt(value);
    return !isNaN(num);
  } else if (code >= 100 && code <= 102) {
    // String value (with group code of 100-102)
    return typeof value === 'string';
  } else if (code >= 140 && code <= 147) {
    // Double precision floating point value
    const num = parseFloat(value);
    return !isNaN(num);
  } else if (code >= 170 && code <= 175) {
    // 16-bit integer value
    const num = parseInt(value);
    return !isNaN(num) && num >= -32768 && num <= 32767;
  } else if (code >= 280 && code <= 289) {
    // 8-bit integer value
    const num = parseInt(value);
    return !isNaN(num) && num >= 0 && num <= 255;
  } else if (code >= 290 && code <= 299) {
    // Boolean flag value
    return value === '0' || value === '1';
  } else if (code >= 300 && code <= 369) {
    // Arbitrary text string
    return typeof value === 'string';
  } else if (code >= 370 && code <= 379) {
    // 8-bit integer value
    const num = parseInt(value);
    return !isNaN(num) && num >= 0 && num <= 255;
  } else if (code >= 380 && code <= 389) {
    // 8-bit integer value
    const num = parseInt(value);
    return !isNaN(num) && num >= 0 && num <= 255;
  }

  // Unknown code range
  return false;
}
