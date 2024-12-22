import { Point, LineString, Polygon, Position } from './types';
import { DxfEntity } from './types';

/**
 * Convert point entity to GeoJSON geometry
 */
export function pointToGeometry(entity: DxfEntity): Point | null {
  const x = entity.data.x ?? 0;
  const y = entity.data.y ?? 0;
  const z = entity.data.z ?? 0;

  if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') {
    return null;
  }

  return {
    type: 'Point',
    coordinates: [x, y, z]
  };
}

/**
 * Convert line entity to GeoJSON geometry
 */
export function lineToGeometry(entity: DxfEntity): LineString | null {
  const x1 = entity.data.x ?? 0;
  const y1 = entity.data.y ?? 0;
  const z1 = entity.data.z ?? 0;
  const x2 = entity.data.x2 ?? 0;
  const y2 = entity.data.y2 ?? 0;
  const z2 = entity.data.z2 ?? 0;

  if (
    typeof x1 !== 'number' || typeof y1 !== 'number' || typeof z1 !== 'number' ||
    typeof x2 !== 'number' || typeof y2 !== 'number' || typeof z2 !== 'number'
  ) {
    return null;
  }
  
  return {
    type: 'LineString',
    coordinates: [
      [x1, y1, z1],
      [x2, y2, z2]
    ]
  };
}

/**
 * Convert polyline entity to GeoJSON geometry
 */
export function polylineToGeometry(entity: DxfEntity): LineString | Polygon | null {
  console.log('[DEBUG] Converting polyline to geometry:', {
    type: entity.type,
    hasVertices: entity.data.vertices?.length || 0,
    isClosed: entity.data.closed,
    data: entity.data
  });

  const vertices = entity.data.vertices as Array<{ x: number; y: number; z?: number }>;
  if (!vertices?.length) {
    console.warn('[DEBUG] No vertices found for polyline');
    return null;
  }

  // Convert vertices to coordinates, properly handling zero values
  const coordinates: Position[] = vertices.map((v, index) => {
    // Use explicit type checking to handle zero values correctly
    const x = typeof v.x === 'number' ? v.x : 0;
    const y = typeof v.y === 'number' ? v.y : 0;
    const z = typeof v.z === 'number' ? v.z : 0;

    const coord: Position = [x, y, z];
    console.log('[DEBUG] Vertex coordinate:', {
      index,
      original: v,
      converted: coord,
      x_type: typeof v.x,
      y_type: typeof v.y,
      z_type: typeof v.z
    });
    return coord;
  });

  console.log('[DEBUG] All polyline coordinates:', {
    count: coordinates.length,
    first: coordinates[0],
    last: coordinates[coordinates.length - 1],
    allCoords: coordinates
  });

  // Check if polyline is closed
  if (entity.data.closed) {
    console.log('[DEBUG] Creating closed polygon');
    // Add first point to close the polygon
    coordinates.push(coordinates[0]);
    const polygon = {
      type: 'Polygon' as const,
      coordinates: [coordinates]
    };
    console.log('[DEBUG] Created polygon:', polygon);
    return polygon;
  }

  console.log('[DEBUG] Creating line string');
  const lineString = {
    type: 'LineString' as const,
    coordinates
  };
  console.log('[DEBUG] Created line string:', lineString);
  return lineString;
}

/**
 * Convert circle entity to GeoJSON geometry
 */
export function circleToGeometry(entity: DxfEntity): Polygon | null {
  const x = entity.data.x ?? 0;
  const y = entity.data.y ?? 0;
  const z = entity.data.z ?? 0;
  const radius = entity.data.radius ?? 0;

  if (
    typeof x !== 'number' || typeof y !== 'number' || 
    typeof z !== 'number' || typeof radius !== 'number'
  ) {
    return null;
  }

  const segments = 32; // Number of segments to approximate circle
  const coordinates: Position[] = [];
  
  for (let i = 0; i <= segments; i++) {
    const angle = (i * 2 * Math.PI) / segments;
    coordinates.push([
      x + radius * Math.cos(angle),
      y + radius * Math.sin(angle),
      z
    ]);
  }

  return {
    type: 'Polygon',
    coordinates: [coordinates]
  };
}

/**
 * Convert arc entity to GeoJSON geometry
 */
export function arcToGeometry(entity: DxfEntity): LineString | null {
  const x = entity.data.x ?? 0;
  const y = entity.data.y ?? 0;
  const z = entity.data.z ?? 0;
  const radius = entity.data.radius ?? 0;
  const startAngle = (entity.data.startAngle ?? 0) * (Math.PI / 180);
  const endAngle = (entity.data.endAngle ?? 0) * (Math.PI / 180);

  if (
    typeof x !== 'number' || typeof y !== 'number' || 
    typeof z !== 'number' || typeof radius !== 'number' ||
    typeof startAngle !== 'number' || typeof endAngle !== 'number'
  ) {
    return null;
  }

  const segments = 32; // Number of segments to approximate arc
  const coordinates: Position[] = [];
  const angleRange = endAngle - startAngle;
  
  for (let i = 0; i <= segments; i++) {
    const angle = startAngle + (i * angleRange) / segments;
    coordinates.push([
      x + radius * Math.cos(angle),
      y + radius * Math.sin(angle),
      z
    ]);
  }

  return {
    type: 'LineString',
    coordinates
  };
}
