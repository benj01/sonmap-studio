import { DxfEntity } from '../types';
import { coordinateSystemManager } from '../../../../coordinate-system-manager';

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

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
   * Detect coordinate system based on bounds and header
   */
  static detectCoordinateSystem(bounds: Bounds, header: any): string | undefined {
    // Validate bounds first
    if (!bounds || !isFinite(bounds.minX) || !isFinite(bounds.minY) || 
        !isFinite(bounds.maxX) || !isFinite(bounds.maxY)) {
      console.warn('[DEBUG] Invalid bounds for coordinate system detection');
      return undefined;
    }

    // Log detection attempt
    console.log('[DEBUG] Detecting coordinate system:', {
      bounds,
      headerUnits: header?.$INSUNITS
    });

    // Check coordinate ranges first since they're most reliable
    if (bounds.minX > 2000000 && bounds.minX < 3000000 &&
        bounds.minY > 1000000 && bounds.minY < 1400000) {
      console.log('[DEBUG] Detected Swiss LV95 (EPSG:2056) based on coordinate range');
      return 'EPSG:2056'; // Swiss LV95
    } 
    
    if (bounds.minX > 400000 && bounds.minX < 900000 &&
        bounds.minY > 0 && bounds.minY < 400000) {
      console.log('[DEBUG] Detected Swiss LV03 (EPSG:21781) based on coordinate range');
      return 'EPSG:21781'; // Swiss LV03
    } 
    
    if (Math.abs(bounds.minX) <= 180 && Math.abs(bounds.maxX) <= 180 &&
        Math.abs(bounds.minY) <= 90 && Math.abs(bounds.maxY) <= 90) {
      console.log('[DEBUG] Detected WGS84 (EPSG:4326) based on coordinate range');
      return 'EPSG:4326'; // WGS84
    } 
    
    if (bounds.minX > 2000000 || bounds.maxX > 2000000) {
      console.log('[DEBUG] Detected Swiss LV95 (EPSG:2056) based on magnitude');
      return 'EPSG:2056'; // Swiss LV95 (based on magnitude)
    }

    // Fallback to header hints
    if (header?.$INSUNITS === 1) {
      console.log('[DEBUG] Detected Swiss LV95 (EPSG:2056) based on header units');
      return 'EPSG:2056'; // Scientific/Engineering units often indicate LV95
    }

    console.log('[DEBUG] Could not detect coordinate system');
    return undefined;
  }

  /**
   * Get default bounds based on coordinate system
   */
  static getDefaultBounds(coordinateSystem?: string): Bounds {
    const bounds = (() => {
      switch (coordinateSystem) {
        case 'EPSG:2056': // Swiss LV95
          return {
            minX: 2485000,
            minY: 1075000,
            maxX: 2835000,
            maxY: 1295000
          };
        case 'EPSG:21781': // Swiss LV03
          return {
            minX: 485000,
            minY: 75000,
            maxX: 835000,
            maxY: 295000
          };
        case 'EPSG:4326': // WGS84
          return {
            minX: 5.9,
            minY: 45.8,
            maxX: 10.5,
            maxY: 47.8
          };
        default:
          return {
            minX: -1,
            minY: -1,
            maxX: 1,
            maxY: 1
          };
      }
    })();

    console.log('[DEBUG] Using default bounds:', {
      coordinateSystem,
      bounds
    });

    return bounds;
  }
}
