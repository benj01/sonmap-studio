import { DxfEntity } from '../types';
import { coordinateSystemManager } from '../../../../coordinate-system-manager';

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface DxfStructure {
  // Add properties for DxfStructure as needed
}

type CoordinateSystem = 'EPSG:2056' | 'EPSG:21781' | 'EPSG:4326' | null;

export class DxfAnalyzer {
  /**
   * Calculate bounds from raw DXF entities
   */
  static calculateBoundsFromEntities(entities: DxfEntity[]): Bounds {
    const bounds = {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity
    };

    const updateBoundsWithCoord = (x: number | undefined, y: number | undefined, source: string) => {
      if (typeof x !== 'number' || typeof y !== 'number' || !isFinite(x) || !isFinite(y)) {
        console.warn('[DEBUG] Invalid coordinates:', { x, y, source });
        return;
      }
      bounds.minX = Math.min(bounds.minX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.maxY = Math.max(bounds.maxY, y);
    };

    let validPoints = 0;
    entities.forEach(entity => {
      try {
        switch (entity.type) {
          case 'LWPOLYLINE':
            if (entity.data?.vertices) {
              entity.data.vertices.forEach(vertex => {
                if ('x' in vertex && 'y' in vertex) {
                  updateBoundsWithCoord(vertex.x, vertex.y, 'LWPOLYLINE vertex');
                  validPoints++;
                }
              });
            }
            break;

          case 'LINE':
            if (entity.data) {
              updateBoundsWithCoord(entity.data.x, entity.data.y, 'LINE start');
              updateBoundsWithCoord(entity.data.x2, entity.data.y2, 'LINE end');
              validPoints += 2;
            }
            break;

          case 'POINT':
          case 'CIRCLE':
          case 'ARC':
          case 'TEXT':
          case 'MTEXT':
            if (entity.data) {
              updateBoundsWithCoord(entity.data.x, entity.data.y, entity.type);
              validPoints++;
            }
            break;

          case 'SPLINE':
            if (Array.isArray(entity.data?.controlPoints)) {
              entity.data.controlPoints.forEach(point => {
                if ('x' in point && 'y' in point) {
                  updateBoundsWithCoord(point.x, point.y, 'SPLINE control point');
                  validPoints++;
                }
              });
            }
            break;
        }
      } catch (error) {
        console.warn('[DEBUG] Error processing entity bounds:', {
          type: entity.type,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });

    // Log bounds calculation results
    console.log('[DEBUG] Bounds calculation complete:', {
      entities: entities.length,
      validPoints,
      bounds: {
        minX: bounds.minX,
        minY: bounds.minY,
        maxX: bounds.maxX,
        maxY: bounds.maxY
      }
    });

    // Validate final bounds
    if (!isFinite(bounds.minX) || !isFinite(bounds.minY) || 
        !isFinite(bounds.maxX) || !isFinite(bounds.maxY)) {
      console.warn('[DEBUG] Invalid bounds calculated, using defaults');
      return this.getDefaultBounds();
    }

    return bounds;
  }

  /**
   * Detect coordinate system from bounds and structure
   */
  static detectCoordinateSystem(bounds: Bounds, structure: DxfStructure): CoordinateSystem {
    console.debug('[DEBUG] Detecting coordinate system from bounds:', bounds);

    // Check if bounds are in reasonable ranges
    const isWGS84Range = 
      bounds.minX >= -180 && bounds.maxX <= 180 &&
      bounds.minY >= -90 && bounds.maxY <= 90;

    const isLV95Range =
      bounds.minX >= 2485000 && bounds.maxX <= 2835000 &&
      bounds.minY >= 1075000 && bounds.maxY <= 1295000;

    const isLV03Range =
      bounds.minX >= 485000 && bounds.maxX <= 835000 &&
      bounds.minY >= 75000 && bounds.maxY <= 295000;

    console.debug('[DEBUG] Coordinate system range checks:', {
      isWGS84Range,
      isLV95Range,
      isLV03Range,
      bounds
    });

    // First check for Swiss coordinate systems
    if (isLV95Range) {
      console.debug('[DEBUG] Detected LV95 coordinates');
      return 'EPSG:2056';
    }

    if (isLV03Range) {
      console.debug('[DEBUG] Detected LV03 coordinates');
      return 'EPSG:21781';
    }

    // If coordinates are in WGS84 range, use WGS84
    if (isWGS84Range) {
      console.debug('[DEBUG] Detected WGS84 coordinates');
      return 'EPSG:4326';
    }

    // If we can't determine the system, return null
    console.debug('[DEBUG] Could not detect coordinate system from bounds');
    return null;
  }

  /**
   * Get default bounds for a coordinate system
   */
  static getDefaultBounds(system: CoordinateSystem): Bounds {
    switch (system) {
      case 'EPSG:2056': // LV95
        return {
          minX: 2485000,
          minY: 1075000,
          maxX: 2835000,
          maxY: 1295000
        };
      case 'EPSG:21781': // LV03
        return {
          minX: 485000,
          minY: 75000,
          maxX: 835000,
          maxY: 295000
        };
      case 'EPSG:4326': // WGS84
      default:
        return {
          minX: 5.9,
          minY: 45.8,
          maxX: 10.5,
          maxY: 47.8
        };
    }
  }
}
