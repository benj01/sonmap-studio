import { Geometry, GeometryCollection } from 'geojson';
import { BaseGeometryConverter } from './base';
import { ErrorReporter } from '../../../errors';
import { createLineStringGeometry, createPolygonGeometry } from '../../../geometry-utils';
import {
  DxfEntityBase,
  DimensionEntity,
  isDimensionEntity,
  Point3D
} from './types';

/**
 * Converter for DIMENSION entities
 */
export class DimensionGeometryConverter extends BaseGeometryConverter {
  private static readonly ARROW_SIZE = 2.5;
  private static readonly TEXT_GAP = 1.0;

  canHandle(entityType: string): boolean {
    return entityType === 'DIMENSION';
  }

  convert(entity: DxfEntityBase, errorReporter: ErrorReporter): Geometry | null {
    if (!isDimensionEntity(entity)) {
      return null;
    }

    const entityInfo = this.entityInfo(entity);

    // Validate required points
    if (!this.validateCoordinates(entity.definitionPoint, errorReporter, entityInfo, 'definition point')) {
      return null;
    }

    // Validate optional points based on dimension type
    switch (entity.dimensionType) {
      case 'LINEAR':
      case 'ALIGNED':
        if (!this.validateLinearDimension(entity, errorReporter, entityInfo)) {
          return null;
        }
        break;
      case 'ANGULAR':
        if (!this.validateAngularDimension(entity, errorReporter, entityInfo)) {
          return null;
        }
        break;
      case 'RADIUS':
      case 'DIAMETER':
        if (!this.validateRadialDimension(entity, errorReporter, entityInfo)) {
          return null;
        }
        break;
      case 'ORDINATE':
        if (!this.validateOrdinateDimension(entity, errorReporter, entityInfo)) {
          return null;
        }
        break;
    }

    // Convert based on dimension type
    const geometries: Geometry[] = [];
    
    try {
      switch (entity.dimensionType) {
        case 'LINEAR':
        case 'ALIGNED':
          this.convertLinearDimension(entity, geometries);
          break;
        case 'ANGULAR':
          this.convertAngularDimension(entity, geometries);
          break;
        case 'RADIUS':
        case 'DIAMETER':
          this.convertRadialDimension(entity, geometries);
          break;
        case 'ORDINATE':
          this.convertOrdinateDimension(entity, geometries);
          break;
      }
    } catch (error) {
      errorReporter.addWarning(
        `Error converting ${entity.dimensionType} dimension`,
        'DIMENSION_CONVERSION_ERROR',
        {
          ...entityInfo,
          error: String(error)
        }
      );
      return null;
    }

    // Return as GeometryCollection if we have multiple geometries
    if (geometries.length > 1) {
      return {
        type: 'GeometryCollection',
        geometries
      };
    }

    // Return single geometry if we only have one
    if (geometries.length === 1) {
      return geometries[0];
    }

    return null;
  }

  private validateLinearDimension(
    entity: DimensionEntity,
    errorReporter: ErrorReporter,
    entityInfo: ReturnType<typeof this.entityInfo>
  ): boolean {
    if (!entity.firstPoint || !this.validateCoordinates(entity.firstPoint, errorReporter, entityInfo, 'first point')) {
      return false;
    }
    if (!entity.secondPoint || !this.validateCoordinates(entity.secondPoint, errorReporter, entityInfo, 'second point')) {
      return false;
    }
    return true;
  }

  private validateAngularDimension(
    entity: DimensionEntity,
    errorReporter: ErrorReporter,
    entityInfo: ReturnType<typeof this.entityInfo>
  ): boolean {
    if (!entity.angleVertex || !this.validateCoordinates(entity.angleVertex, errorReporter, entityInfo, 'angle vertex')) {
      return false;
    }
    if (!entity.firstPoint || !this.validateCoordinates(entity.firstPoint, errorReporter, entityInfo, 'first point')) {
      return false;
    }
    if (!entity.secondPoint || !this.validateCoordinates(entity.secondPoint, errorReporter, entityInfo, 'second point')) {
      return false;
    }
    return true;
  }

  private validateRadialDimension(
    entity: DimensionEntity,
    errorReporter: ErrorReporter,
    entityInfo: ReturnType<typeof this.entityInfo>
  ): boolean {
    if (!entity.centerPoint || !this.validateCoordinates(entity.centerPoint, errorReporter, entityInfo, 'center point')) {
      return false;
    }
    if (!entity.leaderPoint || !this.validateCoordinates(entity.leaderPoint, errorReporter, entityInfo, 'leader point')) {
      return false;
    }
    return true;
  }

  private validateOrdinateDimension(
    entity: DimensionEntity,
    errorReporter: ErrorReporter,
    entityInfo: ReturnType<typeof this.entityInfo>
  ): boolean {
    if (!entity.firstPoint || !this.validateCoordinates(entity.firstPoint, errorReporter, entityInfo, 'feature point')) {
      return false;
    }
    return true;
  }

  private convertLinearDimension(entity: DimensionEntity, geometries: Geometry[]): void {
    if (!entity.firstPoint || !entity.secondPoint) return;

    // Create extension lines
    geometries.push(createLineStringGeometry([
      [entity.firstPoint.x, entity.firstPoint.y],
      [entity.definitionPoint.x, entity.definitionPoint.y]
    ]));
    geometries.push(createLineStringGeometry([
      [entity.secondPoint.x, entity.secondPoint.y],
      [entity.definitionPoint.x, entity.definitionPoint.y]
    ]));

    // Create dimension line
    if (entity.textMidPoint) {
      geometries.push(createLineStringGeometry([
        [entity.definitionPoint.x, entity.definitionPoint.y],
        [entity.textMidPoint.x, entity.textMidPoint.y]
      ]));
    }

    // Add arrows at endpoints
    const arrowSize = entity.styleOverrides?.arrowSize || DimensionGeometryConverter.ARROW_SIZE;
    this.addArrowhead(geometries, entity.definitionPoint, this.calculateArrowDirection(entity), arrowSize);
  }

  private convertAngularDimension(entity: DimensionEntity, geometries: Geometry[]): void {
    // TODO: Implement angular dimension conversion
    // This requires arc generation and special arrow handling
  }

  private convertRadialDimension(entity: DimensionEntity, geometries: Geometry[]): void {
    if (!entity.centerPoint || !entity.leaderPoint) return;

    // Create leader line
    geometries.push(createLineStringGeometry([
      [entity.centerPoint.x, entity.centerPoint.y],
      [entity.leaderPoint.x, entity.leaderPoint.y]
    ]));

    // Add arrow at leader point
    const arrowSize = entity.styleOverrides?.arrowSize || DimensionGeometryConverter.ARROW_SIZE;
    this.addArrowhead(geometries, entity.leaderPoint, this.calculateArrowDirection(entity), arrowSize);
  }

  private convertOrdinateDimension(entity: DimensionEntity, geometries: Geometry[]): void {
    if (!entity.firstPoint) return;

    // Create leader line
    geometries.push(createLineStringGeometry([
      [entity.firstPoint.x, entity.firstPoint.y],
      [entity.definitionPoint.x, entity.definitionPoint.y]
    ]));
  }

  private calculateArrowDirection(entity: DimensionEntity): number {
    // Calculate arrow direction based on dimension type and points
    // For now, return a default direction
    return entity.rotation || 0;
  }

  private addArrowhead(geometries: Geometry[], point: Point3D, angle: number, size: number): void {
    const rad = (angle * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    // Create arrowhead as a small triangle
    const arrowPoints: [number, number][] = [
      [point.x, point.y],
      [point.x - size * cos - size * sin, point.y - size * sin + size * cos],
      [point.x - size * cos + size * sin, point.y - size * sin - size * cos],
      [point.x, point.y]  // Close the polygon
    ];

    geometries.push(createPolygonGeometry([arrowPoints]));
  }
}
