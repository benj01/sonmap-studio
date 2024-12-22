import { Point, LineString, Polygon, Position } from './types';
import { DxfEntity } from './types';

/**
 * Parse coordinate value more leniently
 */
function parseCoord(value: unknown): number {
  if (typeof value === 'number' && !isNaN(value)) return value;
  if (typeof value === 'string') {
    const num = parseFloat(value);
    if (!isNaN(num)) return num;
  }
  return 0;
}

/**
 * Convert point entity to GeoJSON geometry
 */
export function pointToGeometry(entity: DxfEntity): Point | null {
  console.log('[DEBUG] Converting POINT to geometry:', {
    data: entity.data,
    attributes: entity.attributes
  });

  const x = parseCoord(entity.data.x);
  const y = parseCoord(entity.data.y);
  const z = parseCoord(entity.data.z);

  console.log('[DEBUG] Parsed POINT coordinates:', {
    original: { x: entity.data.x, y: entity.data.y, z: entity.data.z },
    parsed: { x, y, z }
  });

  const geometry = {
    type: 'Point' as const,
    coordinates: [x, y, z]
  };

  console.log('[DEBUG] Created POINT geometry:', geometry);
  return geometry;
}

/**
 * Convert line entity to GeoJSON geometry
 */
export function lineToGeometry(entity: DxfEntity): LineString | null {
  console.log('[DEBUG] Converting LINE to geometry:', {
    data: entity.data,
    attributes: entity.attributes
  });

  // Parse coordinates more leniently
  const x1 = parseCoord(entity.data.x);
  const y1 = parseCoord(entity.data.y);
  const z1 = parseCoord(entity.data.z);
  const x2 = parseCoord(entity.data.x2);
  const y2 = parseCoord(entity.data.y2);
  const z2 = parseCoord(entity.data.z2);

  console.log('[DEBUG] Parsed LINE coordinates:', {
    original: {
      start: { x: entity.data.x, y: entity.data.y, z: entity.data.z },
      end: { x: entity.data.x2, y: entity.data.y2, z: entity.data.z2 }
    },
    parsed: {
      start: { x: x1, y: y1, z: z1 },
      end: { x: x2, y: y2, z: z2 }
    }
  });

  const geometry = {
    type: 'LineString' as const,
    coordinates: [
      [x1, y1, z1],
      [x2, y2, z2]
    ]
  };

  console.log('[DEBUG] Created LINE geometry:', {
    type: geometry.type,
    start: geometry.coordinates[0],
    end: geometry.coordinates[1]
  });

  return geometry;
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
    // Parse vertex coordinates more leniently
    const coord: Position = [
      parseCoord(v.x),
      parseCoord(v.y),
      parseCoord(v.z)
    ];

    console.log('[DEBUG] Parsed vertex coordinate:', {
      index,
      original: v,
      parsed: coord,
      x_exact: coord[0].toFixed(8),
      y_exact: coord[1].toFixed(8),
      z_exact: coord[2].toFixed(8)
    });

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
  console.log('[DEBUG] Converting CIRCLE to geometry:', {
    data: entity.data,
    attributes: entity.attributes
  });

  // Parse circle parameters more leniently
  const x = parseCoord(entity.data.x);
  const y = parseCoord(entity.data.y);
  const z = parseCoord(entity.data.z);
  const radius = parseCoord(entity.data.radius);

  console.log('[DEBUG] Parsed CIRCLE parameters:', {
    original: {
      x: entity.data.x,
      y: entity.data.y,
      z: entity.data.z,
      radius: entity.data.radius
    },
    parsed: { x, y, z, radius }
  });

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

  const geometry = {
    type: 'Polygon' as const,
    coordinates: [coordinates]
  };

  console.log('[DEBUG] Created CIRCLE geometry:', {
    type: geometry.type,
    center: [x, y, z],
    radius,
    vertexCount: coordinates.length
  });

  return geometry;
}

/**
 * Convert arc entity to GeoJSON geometry
 */
export function arcToGeometry(entity: DxfEntity): LineString | null {
  console.log('[DEBUG] Converting ARC to geometry:', {
    data: entity.data,
    attributes: entity.attributes
  });

  // Parse arc parameters more leniently
  const x = parseCoord(entity.data.x);
  const y = parseCoord(entity.data.y);
  const z = parseCoord(entity.data.z);
  const radius = parseCoord(entity.data.radius);
  const startAngle = parseCoord(entity.data.startAngle) * (Math.PI / 180);
  const endAngle = parseCoord(entity.data.endAngle) * (Math.PI / 180);

  console.log('[DEBUG] Parsed ARC parameters:', {
    original: {
      center: { x: entity.data.x, y: entity.data.y, z: entity.data.z },
      radius: entity.data.radius,
      angles: { start: entity.data.startAngle, end: entity.data.endAngle }
    },
    parsed: {
      center: { x, y, z },
      radius,
      angles: { start: startAngle, end: endAngle }
    }
  });

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

  const geometry = {
    type: 'LineString' as const,
    coordinates
  };

  console.log('[DEBUG] Created ARC geometry:', {
    type: geometry.type,
    center: [x, y, z],
    radius,
    angles: { start: startAngle, end: endAngle },
    vertexCount: coordinates.length
  });

  return geometry;
}
