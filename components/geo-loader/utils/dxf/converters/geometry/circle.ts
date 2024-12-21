import { Geometry } from 'geojson';
import { BaseGeometryConverter } from './base';
import { ErrorReporter } from '../../../errors';
import { createLineStringGeometry, createPolygonGeometry } from '../../../geometry-utils';
import {
  DxfEntityBase,
  CircleEntity,
  ArcEntity,
  EllipseEntity,
  isCircleEntity,
  isArcEntity,
  isEllipseEntity
} from './types';

/**
 * Converter for circle, arc, and ellipse entities
 */
export class CircleGeometryConverter extends BaseGeometryConverter {
  private static readonly CIRCLE_SEGMENTS = 64;
  private static readonly ARC_SEGMENTS = 32;

  canHandle(entityType: string): boolean {
    return ['CIRCLE', 'ARC', 'ELLIPSE'].includes(entityType);
  }

  convert(entity: DxfEntityBase, errorReporter: ErrorReporter): Geometry | null {
    const entityInfo = this.entityInfo(entity);

    if (isCircleEntity(entity)) {
      return this.convertCircle(entity, errorReporter, entityInfo);
    }
    if (isArcEntity(entity)) {
      return this.convertArc(entity, errorReporter, entityInfo);
    }
    if (isEllipseEntity(entity)) {
      return this.convertEllipse(entity, errorReporter, entityInfo);
    }

    return null;
  }

  private convertCircle(
    entity: CircleEntity,
    errorReporter: ErrorReporter,
    entityInfo: ReturnType<typeof this.entityInfo>
  ): Geometry | null {
    // Validate center coordinates
    if (!this.validateCoordinates(entity.center, errorReporter, entityInfo, 'circle center')) {
      return null;
    }

    // Validate radius
    if (!this.validateNumber(entity.radius, errorReporter, entityInfo, 'circle radius', { nonZero: true })) {
      return null;
    }

    const circleCoords: [number, number][] = [];
    
    for (let i = 0; i <= CircleGeometryConverter.CIRCLE_SEGMENTS; i++) {
      const angle = (i * 2 * Math.PI) / CircleGeometryConverter.CIRCLE_SEGMENTS;
      const x = entity.center.x + entity.radius * Math.cos(angle);
      const y = entity.center.y + entity.radius * Math.sin(angle);
      
      if (!isFinite(x) || !isFinite(y)) {
        errorReporter.addWarning(
          'Invalid circle point calculation',
          'INVALID_CIRCLE_POINT',
          {
            ...entityInfo,
            angle,
            point: { x, y }
          }
        );
        return null;
      }
      
      circleCoords.push([x, y]);
    }

    return createPolygonGeometry([circleCoords]);
  }

  private convertArc(
    entity: ArcEntity,
    errorReporter: ErrorReporter,
    entityInfo: ReturnType<typeof this.entityInfo>
  ): Geometry | null {
    // Validate center coordinates
    if (!this.validateCoordinates(entity.center, errorReporter, entityInfo, 'arc center')) {
      return null;
    }

    // Validate radius
    if (!this.validateNumber(entity.radius, errorReporter, entityInfo, 'arc radius', { nonZero: true })) {
      return null;
    }

    // Validate angles
    if (!this.validateNumber(entity.startAngle, errorReporter, entityInfo, 'arc start angle')) {
      return null;
    }
    if (!this.validateNumber(entity.endAngle, errorReporter, entityInfo, 'arc end angle')) {
      return null;
    }

    const arcCoords: [number, number][] = [];
    let startAngle = (entity.startAngle * Math.PI) / 180;
    let endAngle = (entity.endAngle * Math.PI) / 180;
    
    if (endAngle <= startAngle) {
      endAngle += 2 * Math.PI;
    }
    
    const angleIncrement = (endAngle - startAngle) / CircleGeometryConverter.ARC_SEGMENTS;

    for (let i = 0; i <= CircleGeometryConverter.ARC_SEGMENTS; i++) {
      const angle = startAngle + i * angleIncrement;
      const x = entity.center.x + entity.radius * Math.cos(angle);
      const y = entity.center.y + entity.radius * Math.sin(angle);
      
      if (!isFinite(x) || !isFinite(y)) {
        errorReporter.addWarning(
          'Invalid arc point calculation',
          'INVALID_ARC_POINT',
          {
            ...entityInfo,
            angle,
            point: { x, y }
          }
        );
        return null;
      }
      
      arcCoords.push([x, y]);
    }

    return createLineStringGeometry(arcCoords);
  }

  private convertEllipse(
    entity: EllipseEntity,
    errorReporter: ErrorReporter,
    entityInfo: ReturnType<typeof this.entityInfo>
  ): Geometry | null {
    // Validate center coordinates
    if (!this.validateCoordinates(entity.center, errorReporter, entityInfo, 'ellipse center')) {
      return null;
    }

    // Validate major axis
    if (!this.validateCoordinates(entity.majorAxis, errorReporter, entityInfo, 'ellipse major axis')) {
      return null;
    }

    // Validate minor axis ratio
    if (!this.validateNumber(entity.minorAxisRatio, errorReporter, entityInfo, 'ellipse minor axis ratio', { nonZero: true })) {
      return null;
    }

    // Validate angles
    if (!this.validateNumber(entity.startAngle, errorReporter, entityInfo, 'ellipse start angle')) {
      return null;
    }
    if (!this.validateNumber(entity.endAngle, errorReporter, entityInfo, 'ellipse end angle')) {
      return null;
    }

    const majorLength = Math.sqrt(
      entity.majorAxis.x * entity.majorAxis.x +
      entity.majorAxis.y * entity.majorAxis.y
    );

    if (!isFinite(majorLength) || majorLength === 0) {
      errorReporter.addWarning(
        'Invalid major axis length for ellipse',
        'INVALID_ELLIPSE_AXIS',
        {
          ...entityInfo,
          majorAxis: entity.majorAxis,
          majorLength
        }
      );
      return null;
    }

    const rotation = Math.atan2(entity.majorAxis.y, entity.majorAxis.x);
    let startA = entity.startAngle;
    let endA = entity.endAngle;
    
    if (endA <= startA) {
      endA += 2 * Math.PI;
    }
    
    const angleIncrement = (endA - startA) / CircleGeometryConverter.CIRCLE_SEGMENTS;
    const ellipseCoords: [number, number][] = [];

    for (let i = 0; i <= CircleGeometryConverter.CIRCLE_SEGMENTS; i++) {
      const angle = startA + (i * angleIncrement);
      const cosAngle = Math.cos(angle);
      const sinAngle = Math.sin(angle);
      const x = majorLength * cosAngle;
      const y = majorLength * entity.minorAxisRatio * sinAngle;
      const rotatedX = x * Math.cos(rotation) - y * Math.sin(rotation);
      const rotatedY = x * Math.sin(rotation) + y * Math.cos(rotation);
      const finalX = entity.center.x + rotatedX;
      const finalY = entity.center.y + rotatedY;

      if (!isFinite(finalX) || !isFinite(finalY)) {
        errorReporter.addWarning(
          'Invalid ellipse point calculation',
          'INVALID_ELLIPSE_POINT',
          {
            ...entityInfo,
            angle,
            point: { x: finalX, y: finalY }
          }
        );
        return null;
      }
      
      ellipseCoords.push([finalX, finalY]);
    }

    return createLineStringGeometry(ellipseCoords);
  }
}
