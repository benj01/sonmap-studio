import { Feature, Point, GeoJsonProperties } from 'geojson';
import { Bounds } from '../../core/feature-manager/bounds';
import { COORDINATE_SYSTEMS } from '../../types/coordinates';
import { coordinateSystemManager } from '../../core/coordinate-systems/coordinate-system-manager';

export class BoundsValidator {
  private static readonly SWISS_BOUNDS: Bounds = {
    minX: 2485000,
    minY: 1075000,
    maxX: 2834000,
    maxY: 1299000
  };

  private static readonly SWISS_WGS84_BOUNDS: Bounds = {
    minX: 5.9559,
    minY: 45.8179,
    maxX: 10.4922,
    maxY: 47.8084
  };

  private static readonly WEB_MERCATOR_BOUNDS: Bounds = {
    minX: -20037508.342789244,
    minY: -20037508.342789244,
    maxX: 20037508.342789244,
    maxY: 20037508.342789244
  };

  private isInSwissRange(b: Bounds): boolean {
    return b.minX >= BoundsValidator.SWISS_BOUNDS.minX && 
           b.maxX <= BoundsValidator.SWISS_BOUNDS.maxX &&
           b.minY >= BoundsValidator.SWISS_BOUNDS.minY && 
           b.maxY <= BoundsValidator.SWISS_BOUNDS.maxY;
  }

  private isInWGS84Range(b: Bounds): boolean {
    return b.minX >= -180 && b.maxX <= 180 &&
           b.minY >= -90 && b.maxY <= 90;
  }

  private isInWebMercatorRange(b: Bounds): boolean {
    // Web Mercator bounds are more flexible, just ensure they're finite
    return isFinite(b.minX) && isFinite(b.maxX) && 
           isFinite(b.minY) && isFinite(b.maxY);
  }

  private looksLikeWGS84(b: Bounds): boolean {
    return Math.abs(b.minX) <= 180 && Math.abs(b.maxX) <= 180 &&
           Math.abs(b.minY) <= 90 && Math.abs(b.maxY) <= 90 &&
           b.minX >= BoundsValidator.SWISS_WGS84_BOUNDS.minX && 
           b.maxX <= BoundsValidator.SWISS_WGS84_BOUNDS.maxX &&
           b.minY >= BoundsValidator.SWISS_WGS84_BOUNDS.minY && 
           b.maxY <= BoundsValidator.SWISS_WGS84_BOUNDS.maxY;
  }

  private isValidBounds(bounds: Bounds): boolean {
    return isFinite(bounds.minX) && isFinite(bounds.minY) && 
           isFinite(bounds.maxX) && isFinite(bounds.maxY) &&
           bounds.minX !== bounds.maxX && bounds.minY !== bounds.maxY;
  }

  private getDefaultBounds(isSwiss: boolean): Bounds {
    return isSwiss ? BoundsValidator.SWISS_BOUNDS : BoundsValidator.SWISS_WGS84_BOUNDS;
  }

  public async validateAndTransform(
    bounds: Bounds, 
    coordinateSystem: string
  ): Promise<{ bounds: Bounds; detectedSystem?: string }> {
    console.debug('[BoundsValidator] Validating bounds:', bounds);

    if (!this.isValidBounds(bounds)) {
      console.debug('[BoundsValidator] Invalid bounds, using defaults');
      return { 
        bounds: this.getDefaultBounds(coordinateSystem === COORDINATE_SYSTEMS.SWISS_LV95)
      };
    }

    // Check for coordinate system mismatch
    if (coordinateSystem === COORDINATE_SYSTEMS.SWISS_LV95 && this.looksLikeWGS84(bounds)) {
      console.warn('[BoundsValidator] Detected WGS84 coordinates marked as Swiss LV95');
      return { 
        bounds,
        detectedSystem: COORDINATE_SYSTEMS.WGS84
      };
    }

    // Validate bounds based on coordinate system
    if (coordinateSystem === COORDINATE_SYSTEMS.SWISS_LV95) {
      if (!this.isInSwissRange(bounds)) {
        console.warn('[BoundsValidator] Bounds outside Swiss LV95 range');
        return { bounds: BoundsValidator.SWISS_BOUNDS };
      }
    } else if (coordinateSystem === COORDINATE_SYSTEMS.WGS84) {
      if (!this.isInWGS84Range(bounds)) {
        console.warn('[BoundsValidator] Bounds outside WGS84 range');
        return { bounds: BoundsValidator.SWISS_WGS84_BOUNDS };
      }
    } else if (coordinateSystem === COORDINATE_SYSTEMS.WEB_MERCATOR) {
      // Web Mercator bounds are already transformed, just validate them
      if (!this.isInWebMercatorRange(bounds)) {
        console.warn('[BoundsValidator] Bounds outside Web Mercator range');
        return { bounds: await this.transformSwissBounds(BoundsValidator.SWISS_BOUNDS) };
      }
      return { bounds };
    }

    // Only transform Swiss bounds to Web Mercator
    if (coordinateSystem === COORDINATE_SYSTEMS.SWISS_LV95) {
      return this.transformSwissBounds(bounds);
    }

    return { bounds };
  }

  private async transformSwissBounds(bounds: Bounds): Promise<{ bounds: Bounds }> {
    const gridPoints = this.createBoundsGrid(bounds);
    
    if (gridPoints.length === 0) {
      console.warn('[BoundsValidator] No valid grid points within Swiss bounds');
      return { bounds: BoundsValidator.SWISS_BOUNDS };
    }

    try {
      // Transform to Web Mercator
      const transformedPoints = await coordinateSystemManager.transform(
        gridPoints,
        COORDINATE_SYSTEMS.SWISS_LV95,
        COORDINATE_SYSTEMS.WEB_MERCATOR
      );

      console.debug('[BoundsValidator] Transformed points:', transformedPoints);

      const validPoints = this.filterValidTransformedPoints(transformedPoints);
      
      if (validPoints.length === 0) {
        console.warn('[BoundsValidator] No valid transformed points, points:', transformedPoints);
        // Create a default Web Mercator bounds for Switzerland
        const swissWebMercator = await coordinateSystemManager.transform(
          [{
            type: 'Feature',
            geometry: { 
              type: 'Point', 
              coordinates: [
                (BoundsValidator.SWISS_BOUNDS.minX + BoundsValidator.SWISS_BOUNDS.maxX) / 2,
                (BoundsValidator.SWISS_BOUNDS.minY + BoundsValidator.SWISS_BOUNDS.maxY) / 2
              ]
            },
            properties: {}
          }],
          COORDINATE_SYSTEMS.SWISS_LV95,
          COORDINATE_SYSTEMS.WEB_MERCATOR
        );

        if (swissWebMercator.length > 0) {
          const center = (swissWebMercator[0].geometry as Point).coordinates;
          return {
            bounds: {
              minX: center[0] - 100000, // 100km buffer
              minY: center[1] - 100000,
              maxX: center[0] + 100000,
              maxY: center[1] + 100000
            }
          };
        }

        return { bounds: BoundsValidator.WEB_MERCATOR_BOUNDS };
      }

      const transformedBounds = this.calculateTransformedBounds(validPoints);
      console.debug('[BoundsValidator] Calculated bounds:', transformedBounds);

      if (!this.isInWebMercatorRange(transformedBounds)) {
        console.warn('[BoundsValidator] Transformed bounds outside Web Mercator range');
        return { bounds: BoundsValidator.WEB_MERCATOR_BOUNDS };
      }

      return { bounds: transformedBounds };
    } catch (error) {
      console.error('[BoundsValidator] Error transforming bounds:', error);
      return { bounds: BoundsValidator.WEB_MERCATOR_BOUNDS };
    }
  }

  private createBoundsGrid(bounds: Bounds): Feature<Point, GeoJsonProperties>[] {
    const xStep = (bounds.maxX - bounds.minX) / 2;
    const yStep = (bounds.maxY - bounds.minY) / 2;
    const gridPoints: Feature<Point, GeoJsonProperties>[] = [];

    for (let i = 0; i <= 2; i++) {
      for (let j = 0; j <= 2; j++) {
        const x = bounds.minX + (i * xStep);
        const y = bounds.minY + (j * yStep);
        
        if (x >= BoundsValidator.SWISS_BOUNDS.minX && 
            x <= BoundsValidator.SWISS_BOUNDS.maxX && 
            y >= BoundsValidator.SWISS_BOUNDS.minY && 
            y <= BoundsValidator.SWISS_BOUNDS.maxY) {
          gridPoints.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [x, y] },
            properties: {}
          });
        }
      }
    }

    return gridPoints;
  }

  private filterValidTransformedPoints(points: Feature[]): Feature<Point, GeoJsonProperties>[] {
    return points.filter(p => {
      if (p.geometry?.type !== 'Point') return false;
      const [x, y] = (p.geometry as Point).coordinates;
      return isFinite(x) && isFinite(y) && 
             x >= BoundsValidator.WEB_MERCATOR_BOUNDS.minX && 
             x <= BoundsValidator.WEB_MERCATOR_BOUNDS.maxX &&
             y >= BoundsValidator.WEB_MERCATOR_BOUNDS.minY && 
             y <= BoundsValidator.WEB_MERCATOR_BOUNDS.maxY;
    }) as Feature<Point, GeoJsonProperties>[];
  }

  private calculateTransformedBounds(points: Feature<Point, GeoJsonProperties>[]): Bounds {
    return {
      minX: Math.min(...points.map(p => (p.geometry as Point).coordinates[0])),
      minY: Math.min(...points.map(p => (p.geometry as Point).coordinates[1])),
      maxX: Math.max(...points.map(p => (p.geometry as Point).coordinates[0])),
      maxY: Math.max(...points.map(p => (p.geometry as Point).coordinates[1]))
    };
  }
}
