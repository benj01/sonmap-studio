import { DxfEntity, DxfStructure } from '../types';
import { coordinateSystemManager } from '../../../../coordinate-system-manager';
import { CoordinateSystem, COORDINATE_SYSTEMS, Bounds } from '../../../../../types/coordinates';

type DetectedCoordinateSystem = {
  system: CoordinateSystem | null;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
};

interface DxfBounds extends Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface CoordinateRange {
  system: CoordinateSystem;
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
  tolerance: number;
}


export class DxfAnalyzer {
  private static COORDINATE_RANGES: CoordinateRange[] = [
    {
      system: COORDINATE_SYSTEMS.SWISS_LV95,
      bounds: {
        minX: 2485000,
        maxX: 2835000,
        minY: 1075000,
        maxY: 1295000
      },
      tolerance: 1000 // 1km tolerance for Swiss coordinates
    },
    {
      system: COORDINATE_SYSTEMS.SWISS_LV03,
      bounds: {
        minX: 485000,
        maxX: 835000,
        minY: 75000,
        maxY: 295000
      },
      tolerance: 1000
    },
    {
      system: COORDINATE_SYSTEMS.WGS84,
      bounds: {
        minX: -180,
        maxX: 180,
        minY: -90,
        maxY: 90
      },
      tolerance: 0.1 // 0.1 degree tolerance for WGS84
    }
  ];

  /**
   * Calculate bounds from raw DXF entities with validation
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
      return this.getDefaultBounds(COORDINATE_SYSTEMS.SWISS_LV95);
    }

    return bounds;
  }

  /**
   * Detect coordinate system from bounds and structure with enhanced validation
   */
  static detectCoordinateSystem(bounds: Bounds, structure: DxfStructure): DetectedCoordinateSystem {
    console.debug('[DEBUG] Detecting coordinate system from bounds:', bounds);

    // Check header variables for coordinate system hints
    const headerHints = this.analyzeHeaderVariables(structure);
    if (headerHints) {
      return {
        system: headerHints,
        confidence: 'high',
        reason: 'Detected from DXF header variables'
      };
    }

    // Calculate percentage of points within each system's range
    const systemMatches = this.COORDINATE_RANGES.map(range => {
      const withinRange = this.isWithinRange(bounds, range.bounds, range.tolerance);
      return {
        system: range.system,
        match: withinRange,
        confidence: this.calculateConfidence(bounds, range)
      };
    });

    console.debug('[DEBUG] Coordinate system matches:', systemMatches);

    // Find best match based on confidence
    const bestMatch = systemMatches.reduce<typeof systemMatches[0] | null>((best, current) => {
      if (!best || current.confidence > best.confidence) return current;
      return best;
    }, null);

    if (bestMatch?.match) {
      return {
        system: bestMatch.system,
        confidence: bestMatch.confidence > 0.8 ? 'high' : bestMatch.confidence > 0.5 ? 'medium' : 'low',
        reason: `Matched coordinate ranges with ${(bestMatch.confidence * 100).toFixed(1)}% confidence`
      };
    }

    // If no clear match, try to infer from coordinate magnitudes
    const inferredSystem = this.inferFromMagnitudes(bounds);
    if (inferredSystem) {
      return {
        system: inferredSystem,
        confidence: 'low',
        reason: 'Inferred from coordinate magnitudes'
      };
    }

    console.debug('[DEBUG] Could not detect coordinate system from bounds');
    return {
      system: null,
      confidence: 'low',
      reason: 'No coordinate system could be detected'
    };
  }

  /**
   * Analyze DXF header variables for coordinate system hints
   */
  private static analyzeHeaderVariables(structure: DxfStructure): CoordinateSystem | null {
    // Implementation depends on your DXF structure type
    // This is a placeholder for the actual header analysis
    return null;
  }

  /**
   * Check if bounds are within a given range with tolerance
   */
  private static isWithinRange(
    bounds: Bounds,
    range: { minX: number; maxX: number; minY: number; maxY: number },
    tolerance: number
  ): boolean {
    return (
      bounds.minX >= range.minX - tolerance &&
      bounds.maxX <= range.maxX + tolerance &&
      bounds.minY >= range.minY - tolerance &&
      bounds.maxY <= range.maxY + tolerance
    );
  }

  /**
   * Calculate confidence level for a coordinate system match
   */
  private static calculateConfidence(bounds: Bounds, range: CoordinateRange): number {
    const xRange = range.bounds.maxX - range.bounds.minX;
    const yRange = range.bounds.maxY - range.bounds.minY;
    
    const xOverlap = Math.min(bounds.maxX, range.bounds.maxX) - Math.max(bounds.minX, range.bounds.minX);
    const yOverlap = Math.min(bounds.maxY, range.bounds.maxY) - Math.max(bounds.minY, range.bounds.minY);
    
    const xConfidence = Math.max(0, xOverlap / xRange);
    const yConfidence = Math.max(0, yOverlap / yRange);
    
    return (xConfidence + yConfidence) / 2;
  }

  /**
   * Infer coordinate system from coordinate magnitudes
   */
  private static inferFromMagnitudes(bounds: Bounds): CoordinateSystem | null {
    const avgX = (bounds.minX + bounds.maxX) / 2;
    const avgY = (bounds.minY + bounds.maxY) / 2;

    // Check order of magnitude
    if (Math.abs(avgX) > 1000000) {
      return COORDINATE_SYSTEMS.SWISS_LV95;
    } else if (Math.abs(avgX) > 100000) {
      return COORDINATE_SYSTEMS.SWISS_LV03;
    } else if (Math.abs(avgX) <= 180 && Math.abs(avgY) <= 90) {
      return COORDINATE_SYSTEMS.WGS84;
    }

    return null;
  }

  /**
   * Get default bounds for a coordinate system with validation
   */
  static getDefaultBounds(system: CoordinateSystem = COORDINATE_SYSTEMS.SWISS_LV95): DxfBounds {
    switch (system) {
      case COORDINATE_SYSTEMS.SWISS_LV95:
        return {
          minX: 2485000,
          minY: 1075000,
          maxX: 2835000,
          maxY: 1295000
        };
      case COORDINATE_SYSTEMS.SWISS_LV03:
        return {
          minX: 485000,
          minY: 75000,
          maxX: 835000,
          maxY: 295000
        };
      case COORDINATE_SYSTEMS.WGS84:
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
