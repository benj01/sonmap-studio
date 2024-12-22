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
 * Get descriptive range for group code
 */
function getCodeRange(code: number): string {
  if (code >= 0 && code <= 9) return 'String (0-9)';
  if (code >= 10 && code <= 59) return 'Float (10-59)';
  if (code >= 60 && code <= 79) return 'Integer (60-79)';
  if (code >= 90 && code <= 99) return '32-bit Integer (90-99)';
  if (code >= 100 && code <= 102) return 'String (100-102)';
  if (code >= 140 && code <= 147) return 'Double (140-147)';
  if (code >= 170 && code <= 175) return '16-bit Integer (170-175)';
  if (code >= 280 && code <= 289) return '8-bit Integer (280-289)';
  if (code >= 290 && code <= 299) return 'Boolean (290-299)';
  if (code >= 300 && code <= 369) return 'String (300-369)';
  if (code >= 370 && code <= 379) return '8-bit Integer (370-379)';
  if (code >= 380 && code <= 389) return '8-bit Integer (380-389)';
  return 'Unknown';
}

/**
 * Validate vertex coordinates
 */
export function validateVertex(vertex: { x?: number; y?: number; z?: number }): boolean {
  console.log('[DEBUG] Validating vertex:', {
    vertex,
    x_type: typeof vertex.x,
    y_type: typeof vertex.y,
    z_type: typeof vertex.z,
    x_value: vertex.x,
    y_value: vertex.y,
    z_value: vertex.z
  });

  // Check if we have valid X and Y coordinates (including zero)
  const hasValidX = typeof vertex.x === 'number' && !isNaN(vertex.x);
  const hasValidY = typeof vertex.y === 'number' && !isNaN(vertex.y);
  const hasValidZ = vertex.z === undefined || (typeof vertex.z === 'number' && !isNaN(vertex.z));

  const isValid = hasValidX && hasValidY && hasValidZ;

  if (!isValid) {
    console.warn('[DEBUG] Invalid vertex:', {
      hasValidX,
      hasValidY,
      hasValidZ,
      vertex
    });
  } else {
    console.log('[DEBUG] Valid vertex:', {
      x: vertex.x?.toFixed(8),
      y: vertex.y?.toFixed(8),
      z: vertex.z?.toFixed(8)
    });
  }

  return isValid;
}

/**
 * Validate group code value based on code type
 */
export function validateGroupCode(groupCode: GroupCode): boolean {
  const { code, value } = groupCode;

  // Common validation: code must be a number and value must exist
  if (typeof code !== 'number' || value === undefined || value === null) {
    console.warn('[DEBUG] Invalid group code:', {
      code,
      value,
      code_type: typeof code,
      value_type: typeof value
    });
    return false;
  }

  // Log validation attempt
  console.log('[DEBUG] Validating group code:', {
    code,
    value,
    code_range: getCodeRange(code)
  });

  // Validate based on code ranges
  if (code >= 0 && code <= 9) {
    // String value (with group code of 0-9)
    const isValid = typeof value === 'string';
    if (!isValid) console.warn('[DEBUG] Invalid string value for code 0-9:', value);
    return isValid;
  } else if (code >= 10 && code <= 59) {
    // Floating point value - allow any numeric string that parses to a valid number
    const num = parseFloat(value);
    const isValid = !isNaN(num);
    if (!isValid) console.warn('[DEBUG] Invalid float value for code 10-59:', value);
    return isValid;
  } else if (code >= 60 && code <= 79) {
    // 16-bit integer value - be more lenient with range
    const num = parseInt(value);
    const isValid = !isNaN(num);
    if (!isValid) console.warn('[DEBUG] Invalid integer value for code 60-79:', value);
    return isValid;
  } else if (code >= 90 && code <= 99) {
    // 32-bit integer value
    const num = parseInt(value);
    const isValid = !isNaN(num);
    if (!isValid) console.warn('[DEBUG] Invalid integer value for code 90-99:', value);
    return isValid;
  } else if (code >= 100 && code <= 102) {
    // String value (with group code of 100-102)
    const isValid = typeof value === 'string';
    if (!isValid) console.warn('[DEBUG] Invalid string value for code 100-102:', value);
    return isValid;
  } else if (code >= 140 && code <= 147) {
    // Double precision floating point value
    const num = parseFloat(value);
    const isValid = !isNaN(num);
    if (!isValid) console.warn('[DEBUG] Invalid double value for code 140-147:', value);
    return isValid;
  } else if (code >= 170 && code <= 175) {
    // 16-bit integer value - be more lenient with range
    const num = parseInt(value);
    const isValid = !isNaN(num);
    if (!isValid) console.warn('[DEBUG] Invalid integer value for code 170-175:', value);
    return isValid;
  } else if (code >= 280 && code <= 289) {
    // 8-bit integer value - be more lenient with range
    const num = parseInt(value);
    const isValid = !isNaN(num);
    if (!isValid) console.warn('[DEBUG] Invalid integer value for code 280-289:', value);
    return isValid;
  } else if (code >= 290 && code <= 299) {
    // Boolean flag value
    const isValid = value === '0' || value === '1';
    if (!isValid) console.warn('[DEBUG] Invalid boolean value for code 290-299:', value);
    return isValid;
  } else if (code >= 300 && code <= 369) {
    // Arbitrary text string
    const isValid = typeof value === 'string';
    if (!isValid) console.warn('[DEBUG] Invalid string value for code 300-369:', value);
    return isValid;
  } else if (code >= 370 && code <= 379) {
    // 8-bit integer value - be more lenient with range
    const num = parseInt(value);
    const isValid = !isNaN(num);
    if (!isValid) console.warn('[DEBUG] Invalid integer value for code 370-379:', value);
    return isValid;
  } else if (code >= 380 && code <= 389) {
    // 8-bit integer value - be more lenient with range
    const num = parseInt(value);
    const isValid = !isNaN(num);
    if (!isValid) console.warn('[DEBUG] Invalid integer value for code 380-389:', value);
    return isValid;
  }

  // Unknown code range
  console.warn('[DEBUG] Unknown group code range:', code);
  return false;
}
