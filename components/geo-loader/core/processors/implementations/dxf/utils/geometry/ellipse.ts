import { Feature, Polygon } from 'geojson';
import { DxfEntity, Vector3 } from '../../types';
import { ValidationError } from '../../../../../errors/types';
import { MatrixTransformer } from '../matrix-transformer';

/**
 * Handles conversion of ELLIPSE entities to GeoJSON features
 */
export class EllipseConverter {
  /**
   * Convert ELLIPSE entity to GeoJSON feature
   */
  static convert(entity: DxfEntity): Feature {
    const { center, majorAxis, ratio, startParam, endParam } = this.extractEllipseData(entity);
    this.validateEllipseData(center, majorAxis, ratio);

    // Calculate points along the ellipse
    const points = this.calculateEllipsePoints(
      center,
      majorAxis,
      ratio,
      startParam,
      endParam
    );

    // Create polygon geometry
    const geometry: Polygon = {
      type: 'Polygon',
      coordinates: [points.map(p => [p.x, p.y, p.z ?? 0])]
    };

    return {
      type: 'Feature',
      geometry,
      properties: {
        entityType: 'ELLIPSE',
        center: [center.x, center.y, center.z],
        majorAxis: [majorAxis.x, majorAxis.y, majorAxis.z],
        ratio,
        startParam,
        endParam
      }
    };
  }

  /**
   * Extract ellipse data from entity
   */
  private static extractEllipseData(entity: DxfEntity): {
    center: Vector3;
    majorAxis: Vector3;
    ratio: number;
    startParam: number;
    endParam: number;
  } {
    const data = entity.data;

    // Get center point
    const center: Vector3 = {
      x: typeof data.x === 'number' ? data.x : 0,
      y: typeof data.y === 'number' ? data.y : 0,
      z: typeof data.z === 'number' ? data.z : 0
    };

    // Get major axis vector
    const majorAxis: Vector3 = {
      x: typeof data.majorX === 'number' ? data.majorX : 1,
      y: typeof data.majorY === 'number' ? data.majorY : 0,
      z: typeof data.majorZ === 'number' ? data.majorZ : 0
    };

    // Get ratio of minor to major axis
    const ratio = typeof data.ratio === 'number' ? data.ratio : 1;

    // Get start and end parameters (in radians)
    const startParam = typeof data.startParam === 'number' ? data.startParam : 0;
    const endParam = typeof data.endParam === 'number' ? data.endParam : Math.PI * 2;

    return {
      center,
      majorAxis,
      ratio,
      startParam,
      endParam
    };
  }

  /**
   * Validate ellipse data
   */
  private static validateEllipseData(
    center: Vector3,
    majorAxis: Vector3,
    ratio: number
  ): void {
    // Validate center point
    if (!this.isValidPoint(center)) {
      throw new ValidationError(
        'Invalid ellipse center point',
        'INVALID_ELLIPSE_CENTER'
      );
    }

    // Validate major axis
    if (!this.isValidPoint(majorAxis)) {
      throw new ValidationError(
        'Invalid ellipse major axis',
        'INVALID_ELLIPSE_AXIS'
      );
    }

    // Validate ratio
    if (typeof ratio !== 'number' || ratio <= 0 || ratio > 1) {
      throw new ValidationError(
        'Invalid minor to major axis ratio',
        'INVALID_ELLIPSE_RATIO',
        undefined,
        { ratio }
      );
    }
  }

  /**
   * Calculate points along the ellipse
   */
  private static calculateEllipsePoints(
    center: Vector3,
    majorAxis: Vector3,
    ratio: number,
    startParam: number,
    endParam: number
  ): Vector3[] {
    const points: Vector3[] = [];
    const segments = 72; // Number of segments for full ellipse

    // Calculate major axis length and angle
    const majorLength = Math.sqrt(
      majorAxis.x * majorAxis.x +
      majorAxis.y * majorAxis.y +
      (majorAxis.z ?? 0) * (majorAxis.z ?? 0)
    );
    const majorAngle = Math.atan2(majorAxis.y, majorAxis.x);

    // Calculate minor axis length
    const minorLength = majorLength * ratio;

    // Create transformation matrix for rotation
    const rotationMatrix = MatrixTransformer.createRotationMatrix(
      (majorAngle * 180) / Math.PI
    );

    // Calculate points
    const angleRange = endParam - startParam;
    const angleStep = angleRange / segments;

    for (let i = 0; i <= segments; i++) {
      const angle = startParam + (i * angleStep);
      
      // Calculate point on unit circle
      const x = Math.cos(angle);
      const y = Math.sin(angle);

      // Scale to ellipse size
      const scaledX = x * majorLength;
      const scaledY = y * minorLength;

      // Rotate point
      const rotated = MatrixTransformer.transformPoint(
        { x: scaledX, y: scaledY, z: 0 },
        rotationMatrix
      );

      if (rotated) {
        // Translate to center
        points.push({
          x: rotated.x + center.x,
          y: rotated.y + center.y,
          z: (rotated.z ?? 0) + (center.z ?? 0)
        });
      }
    }

    // Close the ellipse by adding the first point again
    if (points.length > 0) {
      points.push(points[0]);
    }

    return points;
  }

  /**
   * Check if point coordinates are valid numbers
   */
  private static isValidPoint(point: Vector3): boolean {
    return (
      typeof point.x === 'number' &&
      typeof point.y === 'number' &&
      isFinite(point.x) &&
      isFinite(point.y) &&
      (point.z === undefined || (typeof point.z === 'number' && isFinite(point.z)))
    );
  }
}
