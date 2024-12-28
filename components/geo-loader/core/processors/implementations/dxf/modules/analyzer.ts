import { ProcessorResult } from '../../../../base/types';
import { DxfEntity } from '../types';
import { coordinateSystemManager } from '../../../../coordinate-system-manager';

export class DxfAnalyzer {
  /**
   * Calculate bounds from raw DXF entities
   */
  static calculateBoundsFromEntities(entities: DxfEntity[]): ProcessorResult['bounds'] {
    const bounds = {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity
    };

    const updateBoundsWithCoord = (x: number, y: number) => {
      bounds.minX = Math.min(bounds.minX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.maxY = Math.max(bounds.maxY, y);
    };

    entities.forEach(entity => {
      if (entity.type === 'LWPOLYLINE' && entity.data?.vertices) {
        entity.data.vertices.forEach(vertex => {
          if ('x' in vertex && 'y' in vertex) {
            updateBoundsWithCoord(vertex.x, vertex.y);
          }
        });
      } else if (entity.data) {
        // Handle other entity types with x,y coordinates
        if ('x' in entity.data && 'y' in entity.data) {
          updateBoundsWithCoord(entity.data.x, entity.data.y);
        }
        // Handle entities with end points (like LINE)
        if ('x2' in entity.data && 'y2' in entity.data) {
          updateBoundsWithCoord(entity.data.x2, entity.data.y2);
        }
      }
    });

    return bounds;
  }

  /**
   * Detect coordinate system based on bounds and header
   */
  static detectCoordinateSystem(bounds: ProcessorResult['bounds'], header: any): string | undefined {
    // Check coordinate ranges first since they're most reliable
    if (bounds.minX > 2000000 && bounds.minX < 3000000 &&
        bounds.minY > 1000000 && bounds.minY < 1400000) {
      return 'EPSG:2056'; // Swiss LV95
    } 
    
    if (bounds.minX > 400000 && bounds.minX < 900000 &&
        bounds.minY > 0 && bounds.minY < 400000) {
      return 'EPSG:21781'; // Swiss LV03
    } 
    
    if (Math.abs(bounds.minX) <= 180 && Math.abs(bounds.maxX) <= 180 &&
        Math.abs(bounds.minY) <= 90 && Math.abs(bounds.maxY) <= 90) {
      return 'EPSG:4326'; // WGS84
    } 
    
    if (bounds.minX > 2000000 || bounds.maxX > 2000000) {
      return 'EPSG:2056'; // Swiss LV95 (based on magnitude)
    }

    // Fallback to header hints
    if (header?.$INSUNITS === 1) {
      return 'EPSG:2056'; // Scientific/Engineering units often indicate LV95
    }

    return undefined;
  }

  /**
   * Get default bounds based on coordinate system
   */
  static getDefaultBounds(coordinateSystem?: string): ProcessorResult['bounds'] {
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
  }
}
