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

  // Convert vertices to coordinates, preserving exact values
  const coordinates: Position[] = vertices.map((v, index) => {
    // Check if values are valid numbers (including zero)
    if (typeof v.x !== 'number' || typeof v.y !== 'number') {
      console.warn('[DEBUG] Invalid vertex coordinates:', {
        index,
        vertex: v,
        x_type: typeof v.x,
        y_type: typeof v.y
      });
      return [0, 0, 0]; // Fallback for invalid coordinates
    }

    // Use exact values, including zeros
    const coord: Position = [
      v.x,
      v.y,
      typeof v.z === 'number' ? v.z : 0
    ];

    console.log('[DEBUG] Vertex coordinate:', {
      index,
      original: v,
      converted: coord,
      x_exact: v.x.toFixed(8),
      y_exact: v.y.toFixed(8),
      z_exact: v.z?.toFixed(8)
    });

    return coord;
  });

  console.log('[DEBUG] All polyline coordinates:', {
    count: coordinates.length,
    first: coordinates[0]?.map(v => v.toFixed(8)),
    last: coordinates[coordinates.length - 1]?.map(v => v.toFixed(8)),
    allCoords: coordinates.map(coord => coord.map(v => v.toFixed(8)))
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
