import { Geometry } from 'geojson';
import { BaseGeometryConverter } from './base';
import { ErrorReporter } from '../../../errors';
import { createLineStringGeometry, createPolygonGeometry } from '../../../geometry-utils';
import {
  DxfEntityBase,
  SplineEntity,
  isSplineEntity,
  Point3D
} from './types';

/**
 * Converter for spline entities
 * TODO: Implement proper spline interpolation using knots and weights
 * Currently uses a simple linear approximation by connecting control points
 */
export class SplineGeometryConverter extends BaseGeometryConverter {
  canHandle(entityType: string): boolean {
    return entityType === 'SPLINE';
  }

  convert(entity: DxfEntityBase, errorReporter: ErrorReporter): Geometry | null {
    const entityInfo = this.entityInfo(entity);

    if (!isSplineEntity(entity)) {
      return null;
    }

    return this.convertSpline(entity, errorReporter, entityInfo);
  }

  private convertSpline(
    entity: SplineEntity,
    errorReporter: ErrorReporter,
    entityInfo: ReturnType<typeof this.entityInfo>
  ): Geometry | null {
    // Validate degree
    if (!this.validateNumber(entity.degree, errorReporter, entityInfo, 'spline degree', { min: 1 })) {
      return null;
    }

    // Create a point validator closure
    const validatePoint = (point: unknown): point is Point3D => {
      const index = entity.controlPoints.indexOf(point as any);
      return this.validateCoordinates(point, errorReporter, entityInfo, `control point ${index}`);
    };

    // Validate control points
    if (!this.validateArray<Point3D>(
      entity.controlPoints,
      validatePoint,
      errorReporter,
      entityInfo,
      'spline control points',
      { minLength: 2 }
    )) {
      return null;
    }

    // Validate knots if present
    if (entity.knots) {
      const validateKnot = (knot: unknown): knot is number => {
        const index = entity.knots!.indexOf(knot as any);
        return this.validateNumber(knot, errorReporter, entityInfo, `knot ${index}`);
      };

      if (!this.validateArray<number>(
        entity.knots,
        validateKnot,
        errorReporter,
        entityInfo,
        'spline knots',
        { minLength: entity.controlPoints.length + entity.degree + 1 }
      )) {
        return null;
      }
    }

    // Validate weights if present
    if (entity.weights) {
      const validateWeight = (weight: unknown): weight is number => {
        const index = entity.weights!.indexOf(weight as any);
        return this.validateNumber(weight, errorReporter, entityInfo, `weight ${index}`, { nonZero: true });
      };

      if (!this.validateArray<number>(
        entity.weights,
        validateWeight,
        errorReporter,
        entityInfo,
        'spline weights',
        { minLength: entity.controlPoints.length }
      )) {
        return null;
      }
    }

    // Validate fit points if present
    if (entity.fitPoints) {
      const validateFitPoint = (point: unknown): point is Point3D => {
        const index = entity.fitPoints!.indexOf(point as any);
        return this.validateCoordinates(point, errorReporter, entityInfo, `fit point ${index}`);
      };

      if (!this.validateArray<Point3D>(
        entity.fitPoints,
        validateFitPoint,
        errorReporter,
        entityInfo,
        'spline fit points'
      )) {
        return null;
      }
    }

    // Add a warning about using linear approximation
    errorReporter.addWarning(
      'Using linear approximation for spline',
      'SPLINE_LINEAR_APPROXIMATION',
      {
        ...entityInfo,
        degree: entity.degree,
        hasKnots: !!entity.knots,
        hasWeights: !!entity.weights,
        hasFitPoints: !!entity.fitPoints,
        controlPointCount: entity.controlPoints.length
      }
    );

    // Convert control points to coordinates
    const coordinates: [number, number][] = entity.controlPoints.map(p => [p.x, p.y]);

    // Handle closed splines
    if (entity.closed && coordinates.length >= 3) {
      const first = coordinates[0];
      const last = coordinates[coordinates.length - 1];
      
      // If the spline isn't already closed, close it by adding the first point again
      if (first[0] !== last[0] || first[1] !== last[1]) {
        coordinates.push([first[0], first[1]]);
      }
      
      return createPolygonGeometry([coordinates]);
    }

    // For open splines, create a LineString
    return createLineStringGeometry(coordinates);
  }
}
