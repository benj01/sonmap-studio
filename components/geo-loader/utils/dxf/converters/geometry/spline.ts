import { Geometry } from 'geojson';
import { BaseGeometryConverter, geometryConverterRegistry } from './base';
import { ErrorReporter } from '../../../errors';
import { createLineStringGeometry, createPolygonGeometry } from '../../../geometry-utils';
import {
  DxfEntityBase,
  SplineEntity,
  isSplineEntity
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
    // Validate control points
    if (!entity.controlPoints || entity.controlPoints.length < 2) {
      errorReporter.addWarning(
        'Spline has insufficient control points',
        'INVALID_SPLINE_POINTS',
        {
          entityType: entityInfo.type,
          handle: entityInfo.handle,
          pointCount: entity.controlPoints?.length ?? 0
        }
      );
      return null;
    }

    // Convert control points to coordinates
    const coordinates = entity.controlPoints.map(p => {
      if (!isFinite(p.x) || !isFinite(p.y)) {
        errorReporter.addWarning(
          'Invalid spline control point coordinates',
          'INVALID_SPLINE_POINT',
          {
            entityType: entityInfo.type,
            handle: entityInfo.handle,
            point: p
          }
        );
        return null;
      }
      return [p.x, p.y] as [number, number];
    });

    // Filter out any invalid coordinates
    const validCoordinates = coordinates.filter((coord): coord is [number, number] => coord !== null);

    if (validCoordinates.length < 2) {
      errorReporter.addWarning(
        'Spline has insufficient valid control points',
        'INVALID_SPLINE_POINTS',
        {
          entityType: entityInfo.type,
          handle: entityInfo.handle,
          validPointCount: validCoordinates.length
        }
      );
      return null;
    }

    // Add a warning about using linear approximation
    errorReporter.addWarning(
      'Using linear approximation for spline',
      'SPLINE_LINEAR_APPROXIMATION',
      {
        entityType: entityInfo.type,
        handle: entityInfo.handle,
        degree: entity.degree,
        hasKnots: !!entity.knots,
        hasWeights: !!entity.weights,
        hasFitPoints: !!entity.fitPoints
      }
    );

    // Handle closed splines
    if (entity.closed && validCoordinates.length >= 3) {
      const first = validCoordinates[0];
      const last = validCoordinates[validCoordinates.length - 1];
      
      // If the spline isn't already closed, close it by adding the first point again
      if (first[0] !== last[0] || first[1] !== last[1]) {
        validCoordinates.push([first[0], first[1]]);
      }
      
      return createPolygonGeometry([validCoordinates]);
    }

    // For open splines, create a LineString
    return createLineStringGeometry(validCoordinates);
  }
}

// Register the converter
geometryConverterRegistry.register(new SplineGeometryConverter());
