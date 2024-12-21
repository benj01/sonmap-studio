import { Feature, MultiPolygon, Position } from 'geojson';
import { DxfEntity, HatchBoundary, Vector3 } from '../../types';
import { ValidationError } from '../../../../../errors/types';

/**
 * Handles conversion of HATCH entities to GeoJSON features
 * Initially focuses on solid fills with basic boundary path support
 */
export class HatchConverter {
  /**
   * Convert HATCH entity to GeoJSON feature
   */
  static convert(entity: DxfEntity): Feature {
    const boundaries = this.extractBoundaries(entity);
    this.validateBoundaries(boundaries);

    // Convert boundaries to rings
    const rings = this.convertBoundariesToRings(boundaries);

    // Create multi-polygon geometry (hatch may have multiple boundaries)
    const geometry: MultiPolygon = {
      type: 'MultiPolygon',
      coordinates: rings.map(ring => [ring])
    };

    return {
      type: 'Feature',
      geometry,
      properties: {
        entityType: 'HATCH',
        isSolid: entity.data.isSolid ?? true,
        elevation: entity.data.elevation ?? 0,
        pattern: entity.data.pattern ? {
          name: entity.data.pattern.name,
          angle: entity.data.pattern.angle,
          scale: entity.data.pattern.scale,
          double: entity.data.pattern.double
        } : undefined,
        boundaryCount: boundaries.length
      }
    };
  }

  /**
   * Extract boundaries from entity
   */
  private static extractBoundaries(entity: DxfEntity): HatchBoundary[] {
    const boundaries = entity.data.boundaries;
    if (!boundaries?.length) {
      throw new ValidationError(
        'HATCH must have at least one boundary',
        'NO_BOUNDARIES'
      );
    }
    return boundaries;
  }

  /**
   * Validate hatch boundaries
   */
  private static validateBoundaries(boundaries: HatchBoundary[]): void {
    boundaries.forEach((boundary, index) => {
      switch (boundary.type) {
        case 'POLYLINE':
          this.validatePolylineBoundary(boundary, index);
          break;
        case 'CIRCLE':
          this.validateCircleBoundary(boundary, index);
          break;
        case 'ELLIPSE':
          this.validateEllipseBoundary(boundary, index);
          break;
        case 'SPLINE':
          this.validateSplineBoundary(boundary, index);
          break;
      }
    });
  }

  /**
   * Validate polyline boundary
   */
  private static validatePolylineBoundary(boundary: HatchBoundary, index: number): void {
    const vertices = boundary.data.vertices;
    if (!vertices?.length || vertices.length < 3) {
      throw new ValidationError(
        `Invalid polyline boundary ${index}: must have at least 3 vertices`,
        'INVALID_BOUNDARY',
        undefined,
        { boundaryIndex: index, vertexCount: vertices?.length }
      );
    }

    vertices.forEach((vertex, vIndex) => {
      if (!this.isValidPoint2D(vertex)) {
        throw new ValidationError(
          `Invalid vertex in boundary ${index}`,
          'INVALID_VERTEX',
          undefined,
          { boundaryIndex: index, vertexIndex: vIndex, vertex }
        );
      }
    });
  }

  /**
   * Validate circle boundary
   */
  private static validateCircleBoundary(boundary: HatchBoundary, index: number): void {
    const { center, radius } = boundary.data;
    if (!center || !this.isValidPoint2D(center)) {
      throw new ValidationError(
        `Invalid circle center in boundary ${index}`,
        'INVALID_CENTER',
        undefined,
        { boundaryIndex: index, center }
      );
    }

    if (typeof radius !== 'number' || radius <= 0) {
      throw new ValidationError(
        `Invalid circle radius in boundary ${index}`,
        'INVALID_RADIUS',
        undefined,
        { boundaryIndex: index, radius }
      );
    }
  }

  /**
   * Validate ellipse boundary
   */
  private static validateEllipseBoundary(boundary: HatchBoundary, index: number): void {
    const { center, majorAxis, ratio } = boundary.data;
    if (!center || !this.isValidPoint2D(center)) {
      throw new ValidationError(
        `Invalid ellipse center in boundary ${index}`,
        'INVALID_CENTER',
        undefined,
        { boundaryIndex: index, center }
      );
    }

    if (!majorAxis || !this.isValidPoint2D(majorAxis)) {
      throw new ValidationError(
        `Invalid major axis in boundary ${index}`,
        'INVALID_MAJOR_AXIS',
        undefined,
        { boundaryIndex: index, majorAxis }
      );
    }

    if (typeof ratio !== 'number' || ratio <= 0 || ratio > 1) {
      throw new ValidationError(
        `Invalid axis ratio in boundary ${index}`,
        'INVALID_RATIO',
        undefined,
        { boundaryIndex: index, ratio }
      );
    }
  }

  /**
   * Validate spline boundary
   */
  private static validateSplineBoundary(boundary: HatchBoundary, index: number): void {
    const { controlPoints } = boundary.data;
    if (!controlPoints?.length || controlPoints.length < 2) {
      throw new ValidationError(
        `Invalid spline boundary ${index}: must have at least 2 control points`,
        'INVALID_BOUNDARY',
        undefined,
        { boundaryIndex: index, pointCount: controlPoints?.length }
      );
    }

    controlPoints.forEach((point, pIndex) => {
      if (!this.isValidPoint2D(point)) {
        throw new ValidationError(
          `Invalid control point in boundary ${index}`,
          'INVALID_CONTROL_POINT',
          undefined,
          { boundaryIndex: index, pointIndex: pIndex, point }
        );
      }
    });
  }

  /**
   * Convert boundaries to coordinate rings
   */
  private static convertBoundariesToRings(boundaries: HatchBoundary[]): Position[][] {
    return boundaries.map(boundary => {
      switch (boundary.type) {
        case 'POLYLINE':
          return this.polylineToRing(boundary);
        case 'CIRCLE':
          return this.circleToRing(boundary);
        case 'ELLIPSE':
          return this.ellipseToRing(boundary);
        case 'SPLINE':
          return this.splineToRing(boundary);
        default:
          throw new ValidationError(
            `Unsupported boundary type: ${boundary.type}`,
            'UNSUPPORTED_BOUNDARY_TYPE'
          );
      }
    });
  }

  /**
   * Convert polyline boundary to coordinate ring
   */
  private static polylineToRing(boundary: HatchBoundary): Position[] {
    const vertices = boundary.data.vertices!;
    const coordinates: Position[] = vertices.map(v => [v.x, v.y, 0]);

    // Close the ring if not already closed
    const first = vertices[0];
    const last = vertices[vertices.length - 1];
    if (first.x !== last.x || first.y !== last.y) {
      coordinates.push([first.x, first.y, 0]);
    }

    return coordinates;
  }

  /**
   * Convert circle boundary to coordinate ring
   */
  private static circleToRing(boundary: HatchBoundary): Position[] {
    const center = boundary.data.center!;
    const radius = boundary.data.radius!;
    const segments = 72; // Number of segments for circle approximation
    const coordinates: Position[] = [];

    for (let i = 0; i <= segments; i++) {
      const angle = (i * 2 * Math.PI) / segments;
      coordinates.push([
        center.x + radius * Math.cos(angle),
        center.y + radius * Math.sin(angle),
        0
      ]);
    }

    return coordinates;
  }

  /**
   * Convert ellipse boundary to coordinate ring
   */
  private static ellipseToRing(boundary: HatchBoundary): Position[] {
    const center = boundary.data.center!;
    const majorAxis = boundary.data.majorAxis!;
    const ratio = boundary.data.ratio!;
    const segments = 72; // Number of segments for ellipse approximation

    // Calculate major axis length and angle
    const majorLength = Math.sqrt(
      majorAxis.x * majorAxis.x +
      majorAxis.y * majorAxis.y
    );
    const majorAngle = Math.atan2(majorAxis.y, majorAxis.x);
    const minorLength = majorLength * ratio;

    const coordinates: Position[] = [];
    for (let i = 0; i <= segments; i++) {
      const angle = (i * 2 * Math.PI) / segments;
      const cosAngle = Math.cos(angle);
      const sinAngle = Math.sin(angle);

      // Calculate point on rotated ellipse
      const x = center.x + (majorLength * cosAngle * Math.cos(majorAngle) -
                          minorLength * sinAngle * Math.sin(majorAngle));
      const y = center.y + (majorLength * cosAngle * Math.sin(majorAngle) +
                          minorLength * sinAngle * Math.cos(majorAngle));

      coordinates.push([x, y, 0]);
    }

    return coordinates;
  }

  /**
   * Convert spline boundary to coordinate ring
   */
  private static splineToRing(boundary: HatchBoundary): Position[] {
    const controlPoints = boundary.data.controlPoints!;
    const segments = 32; // Number of segments between each control point
    const coordinates: Position[] = [];

    // Simple linear interpolation between control points
    for (let i = 0; i < controlPoints.length; i++) {
      const p0 = controlPoints[i];
      const p1 = controlPoints[(i + 1) % controlPoints.length];

      for (let j = 0; j < segments; j++) {
        const t = j / segments;
        coordinates.push([
          p0.x + t * (p1.x - p0.x),
          p0.y + t * (p1.y - p0.y),
          0
        ]);
      }
    }

    // Close the ring
    coordinates.push(coordinates[0]);

    return coordinates;
  }

  /**
   * Check if point has valid 2D coordinates
   */
  private static isValidPoint2D(point: { x: number; y: number }): boolean {
    return (
      typeof point.x === 'number' &&
      typeof point.y === 'number' &&
      isFinite(point.x) &&
      isFinite(point.y)
    );
  }
}
