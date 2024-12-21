import { Feature, LineString, Polygon } from 'geojson';
import { DxfEntity, Vector3 } from '../../types';
import { ValidationError } from '../../../../../errors/types';

interface SplineData {
  controlPoints: Vector3[];
  degree?: number;
  knots?: number[];
  weights?: number[];
  fitPoints?: Vector3[];
  closed?: boolean;
}

/**
 * Handles conversion of SPLINE entities to GeoJSON features
 */
export class SplineConverter {
  /**
   * Convert SPLINE entity to GeoJSON feature
   */
  static convert(entity: DxfEntity): Feature {
    const splineData = this.extractSplineData(entity);
    this.validateSplineData(splineData);

    // Get interpolated points
    const points = this.interpolateSpline(splineData);

    // Create geometry
    const geometry = splineData.closed
      ? this.createPolygon(points)
      : this.createLineString(points);

    return {
      type: 'Feature',
      geometry,
      properties: {
        entityType: 'SPLINE',
        degree: splineData.degree,
        isClosed: splineData.closed,
        controlPointCount: splineData.controlPoints.length,
        hasKnots: !!splineData.knots,
        hasWeights: !!splineData.weights,
        hasFitPoints: !!splineData.fitPoints
      }
    };
  }

  /**
   * Extract spline data from entity
   */
  private static extractSplineData(entity: DxfEntity): SplineData {
    const data = entity.data;
    
    // Extract control points
    const controlPoints: Vector3[] = [];
    const points = data.controlPoints as Array<{ x: number; y: number; z?: number }> | undefined;
    
    if (!points?.length) {
      throw new ValidationError(
        'Invalid spline: no control points',
        'INVALID_SPLINE_DATA'
      );
    }

    for (const point of points) {
      controlPoints.push({
        x: point.x,
        y: point.y,
        z: point.z ?? 0
      });
    }

    return {
      controlPoints,
      degree: data.degree as number | undefined,
      knots: data.knots as number[] | undefined,
      weights: data.weights as number[] | undefined,
      fitPoints: (data.fitPoints as Array<{ x: number; y: number; z?: number }> | undefined)?.map(p => ({
        x: p.x,
        y: p.y,
        z: p.z ?? 0
      })),
      closed: data.closed as boolean | undefined
    };
  }

  /**
   * Validate spline data
   */
  private static validateSplineData(data: SplineData): void {
    // Validate degree
    if (data.degree !== undefined && (
      !Number.isInteger(data.degree) || 
      data.degree < 1 || 
      data.degree > 3
    )) {
      throw new ValidationError(
        'Invalid spline degree',
        'INVALID_SPLINE_DEGREE',
        undefined,
        { degree: data.degree }
      );
    }

    // Validate control points
    if (data.controlPoints.length < 2) {
      throw new ValidationError(
        'Spline must have at least 2 control points',
        'INVALID_CONTROL_POINTS'
      );
    }

    // Validate knots if present
    if (data.knots) {
      const requiredKnots = data.controlPoints.length + (data.degree ?? 1) + 1;
      if (data.knots.length !== requiredKnots) {
        throw new ValidationError(
          'Invalid number of knots',
          'INVALID_KNOT_COUNT',
          undefined,
          {
            expected: requiredKnots,
            actual: data.knots.length
          }
        );
      }
    }

    // Validate weights if present
    if (data.weights && data.weights.length !== data.controlPoints.length) {
      throw new ValidationError(
        'Number of weights must match number of control points',
        'INVALID_WEIGHT_COUNT',
        undefined,
        {
          controlPoints: data.controlPoints.length,
          weights: data.weights.length
        }
      );
    }
  }

  /**
   * Interpolate points along spline
   */
  private static interpolateSpline(data: SplineData): Vector3[] {
    const points: Vector3[] = [];
    const segments = 32; // Number of segments per control point span

    if (data.knots && data.weights) {
      // Use NURBS interpolation when knots and weights are available
      points.push(...this.interpolateNURBS(data, segments));
    } else if (data.fitPoints?.length) {
      // Use fit points when available
      points.push(...this.interpolateThroughPoints(data.fitPoints, segments));
    } else {
      // Fallback to simple interpolation through control points
      points.push(...this.interpolateControlPoints(data.controlPoints, segments));
    }

    return points;
  }

  /**
   * Interpolate NURBS spline
   */
  private static interpolateNURBS(data: SplineData, segments: number): Vector3[] {
    const points: Vector3[] = [];
    const degree = data.degree ?? 1;
    const knots = data.knots!;
    const weights = data.weights!;
    const controlPoints = data.controlPoints;

    // Calculate parameter range
    const startParam = knots[degree];
    const endParam = knots[knots.length - degree - 1];
    
    // Interpolate points
    for (let i = 0; i <= segments; i++) {
      const t = startParam + (i / segments) * (endParam - startParam);
      points.push(this.evaluateNURBS(t, degree, knots, controlPoints, weights));
    }

    return points;
  }

  /**
   * Evaluate NURBS at parameter value
   */
  private static evaluateNURBS(
    t: number,
    degree: number,
    knots: number[],
    controlPoints: Vector3[],
    weights: number[]
  ): Vector3 {
    let x = 0;
    let y = 0;
    let z = 0;
    let w = 0;

    const n = controlPoints.length - 1;
    
    for (let i = 0; i <= n; i++) {
      const basis = this.basisFunction(i, degree, t, knots);
      const weight = weights[i];
      
      x += basis * weight * controlPoints[i].x;
      y += basis * weight * controlPoints[i].y;
      z += basis * weight * (controlPoints[i].z ?? 0);
      w += basis * weight;
    }

    return {
      x: x / w,
      y: y / w,
      z: z / w
    };
  }

  /**
   * Calculate NURBS basis function
   */
  private static basisFunction(
    i: number,
    degree: number,
    t: number,
    knots: number[]
  ): number {
    if (degree === 0) {
      return (t >= knots[i] && t < knots[i + 1]) ? 1 : 0;
    }

    const left = (t - knots[i]) / (knots[i + degree] - knots[i]);
    const right = (knots[i + degree + 1] - t) / (knots[i + degree + 1] - knots[i + 1]);

    return (
      (left * this.basisFunction(i, degree - 1, t, knots)) +
      (right * this.basisFunction(i + 1, degree - 1, t, knots))
    );
  }

  /**
   * Interpolate through fit points
   */
  private static interpolateThroughPoints(points: Vector3[], segments: number): Vector3[] {
    const result: Vector3[] = [];
    
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      
      for (let j = 0; j <= segments; j++) {
        const t = j / segments;
        result.push({
          x: p0.x + t * (p1.x - p0.x),
          y: p0.y + t * (p1.y - p0.y),
          z: (p0.z ?? 0) + t * ((p1.z ?? 0) - (p0.z ?? 0))
        });
      }
    }

    return result;
  }

  /**
   * Simple interpolation through control points
   */
  private static interpolateControlPoints(points: Vector3[], segments: number): Vector3[] {
    const result: Vector3[] = [];
    
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      
      for (let j = 0; j <= segments; j++) {
        const t = j / segments;
        result.push({
          x: p0.x + t * (p1.x - p0.x),
          y: p0.y + t * (p1.y - p0.y),
          z: (p0.z ?? 0) + t * ((p1.z ?? 0) - (p0.z ?? 0))
        });
      }
    }

    return result;
  }

  /**
   * Create LineString geometry from points
   */
  private static createLineString(points: Vector3[]): LineString {
    return {
      type: 'LineString',
      coordinates: points.map(p => [p.x, p.y, p.z ?? 0])
    };
  }

  /**
   * Create Polygon geometry from points
   */
  private static createPolygon(points: Vector3[]): Polygon {
    // Add first point to close the polygon
    const coordinates = points.map(p => [p.x, p.y, p.z ?? 0]);
    coordinates.push(coordinates[0]);

    return {
      type: 'Polygon',
      coordinates: [coordinates]
    };
  }
}
