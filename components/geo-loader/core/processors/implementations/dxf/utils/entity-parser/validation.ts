import { Feature, Point, LineString, Polygon, Position, GeoJsonTypes, Geometry } from 'geojson';
import { DxfEntityType, GroupCode } from './types';

type ValidGeometry = Point | LineString | Polygon;

// Type guards for GeoJSON types with proper validation
function isPoint(geom: Geometry): geom is Point {
  return geom.type === 'Point' && 
         Array.isArray(geom.coordinates) && 
         geom.coordinates.length >= 2;
}

function isLineString(geom: Geometry): geom is LineString {
  return geom.type === 'LineString' && 
         Array.isArray(geom.coordinates) && 
         geom.coordinates.length >= 2;
}

function isPolygon(geom: Geometry): geom is Polygon {
  return geom.type === 'Polygon' && 
         Array.isArray(geom.coordinates) && 
         geom.coordinates.length > 0;
}

/**
 * Validate geometry coordinates
 */
export function validateGeometry(geometry: Geometry | null | undefined): boolean {
  console.log('[DEBUG] Validating geometry:', {
    type: geometry?.type,
    hasCoordinates: 'coordinates' in (geometry || {}),
    coordinates: geometry && 'coordinates' in geometry ? geometry.coordinates : undefined
  });

  if (!geometry || !('coordinates' in geometry)) {
    console.warn('[DEBUG] Invalid geometry: missing geometry or coordinates');
    return false;
  }

  const validateCoordinate = (coord: number[]): boolean => {
    // More lenient coordinate validation
    const isValid = Array.isArray(coord) &&
      coord.length >= 2 &&
      coord.slice(0, 2).every(n => {
        const num = typeof n === 'number' ? n : parseFloat(String(n));
        return !isNaN(num) && isFinite(num);
      });

    if (!isValid) {
      console.warn('[DEBUG] Invalid coordinate:', {
        coord,
        values: coord?.map(n => ({
          value: n,
          parsed: parseFloat(String(n)),
          type: typeof n,
          isNaN: isNaN(parseFloat(String(n)))
        }))
      });
    }

    return isValid;
  };

  if (isPoint(geometry)) {
    // Allow any numeric values that can be parsed
    const coords = geometry.coordinates.map(n => 
      typeof n === 'number' ? n : parseFloat(String(n))
    );
    const isValidPoint = coords.slice(0, 2).every(n => !isNaN(n) && isFinite(n));
    
    if (!isValidPoint) {
      console.warn('[DEBUG] Invalid Point geometry:', {
        original: geometry.coordinates,
        parsed: coords
      });
    }
    return isValidPoint;
  }

  if (isLineString(geometry)) {
    // More lenient LineString validation
    const isValidLineString = geometry.coordinates.length >= 2 &&
      geometry.coordinates.every(coord => {
        const nums = coord.map(n => 
          typeof n === 'number' ? n : parseFloat(String(n))
        );
        return nums.slice(0, 2).every(n => !isNaN(n) && isFinite(n));
      });
    
    if (!isValidLineString) {
      console.warn('[DEBUG] Invalid LineString geometry:', {
        length: geometry.coordinates?.length,
        coordinates: geometry.coordinates.map(coord => 
          coord.map(n => ({
            original: n,
            parsed: parseFloat(String(n))
          }))
        )
      });
    }
    return isValidLineString;
  }

  if (isPolygon(geometry)) {
    // More lenient Polygon validation
    const isValidPolygon = geometry.coordinates.every((ring: Position[]) => {
      // Convert all values to numbers
      const parsedRing = ring.map(coord => 
        coord.map(n => typeof n === 'number' ? n : parseFloat(String(n)))
      );
      
      const isValidRing = parsedRing.length >= 4 &&
        parsedRing.every(coord => 
          coord.slice(0, 2).every(n => !isNaN(n) && isFinite(n))
        ) &&
        // Check if first and last points are approximately equal
        Math.abs(parsedRing[0][0] - parsedRing[parsedRing.length - 1][0]) < 1e-10 &&
        Math.abs(parsedRing[0][1] - parsedRing[parsedRing.length - 1][1]) < 1e-10;
      
      if (!isValidRing) {
        console.warn('[DEBUG] Invalid Polygon ring:', {
          length: ring?.length,
          original: ring,
          parsed: parsedRing,
          isClosed: ring.length >= 2 && 
            Math.abs(parsedRing[0][0] - parsedRing[parsedRing.length - 1][0]) < 1e-10 &&
            Math.abs(parsedRing[0][1] - parsedRing[parsedRing.length - 1][1]) < 1e-10
        });
      }
      return isValidRing;
    });

    if (!isValidPolygon) {
      console.warn('[DEBUG] Invalid Polygon geometry:', {
        ringCount: geometry.coordinates?.length,
        rings: geometry.coordinates.map(ring => ({
          length: ring.length,
          first: ring[0],
          last: ring[ring.length - 1]
        }))
      });
    }
    return isValidPolygon;
  }

  console.warn('[DEBUG] Unknown geometry type:', geometry.type);
  return false;
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
