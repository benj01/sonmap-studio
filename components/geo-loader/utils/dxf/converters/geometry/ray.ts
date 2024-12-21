import { Geometry } from 'geojson';
import { BaseGeometryConverter } from './base';
import { ErrorReporter } from '../../../errors';
import { createLineStringGeometry } from '../../../geometry-utils';
import {
  DxfEntityBase,
  RayEntity,
  XLineEntity,
  isRayEntity,
  isXLineEntity,
  Point3D
} from './types';

/**
 * Converter for RAY and XLINE entities
 */
export class RayGeometryConverter extends BaseGeometryConverter {
  // Use a large value for the line length to approximate infinity
  private static readonly MAX_LENGTH = 1e6;

  canHandle(entityType: string): boolean {
    return entityType === 'RAY' || entityType === 'XLINE';
  }

  convert(entity: DxfEntityBase, errorReporter: ErrorReporter): Geometry | null {
    if (isRayEntity(entity)) {
      return this.convertRay(entity, errorReporter);
    }
    if (isXLineEntity(entity)) {
      return this.convertXLine(entity, errorReporter);
    }
    return null;
  }

  private convertRay(
    entity: RayEntity,
    errorReporter: ErrorReporter
  ): Geometry | null {
    const entityInfo = this.entityInfo(entity);

    // Validate base point
    if (!this.validateCoordinates(entity.basePoint, errorReporter, entityInfo, 'base point')) {
      return null;
    }

    // Validate direction vector
    if (!this.validateCoordinates(entity.direction, errorReporter, entityInfo, 'direction vector')) {
      return null;
    }

    // Normalize direction vector
    const direction = this.normalizeVector(entity.direction);
    if (!direction) {
      errorReporter.addWarning(
        'Invalid direction vector (zero length)',
        'INVALID_DIRECTION',
        {
          ...entityInfo,
          direction: entity.direction
        }
      );
      return null;
    }

    // Create line from base point extending in direction
    const endPoint = {
      x: entity.basePoint.x + direction.x * RayGeometryConverter.MAX_LENGTH,
      y: entity.basePoint.y + direction.y * RayGeometryConverter.MAX_LENGTH,
      z: entity.basePoint.z !== undefined
        ? entity.basePoint.z + (direction.z || 0) * RayGeometryConverter.MAX_LENGTH
        : undefined
    };

    return createLineStringGeometry([
      [entity.basePoint.x, entity.basePoint.y],
      [endPoint.x, endPoint.y]
    ]);
  }

  private convertXLine(
    entity: XLineEntity,
    errorReporter: ErrorReporter
  ): Geometry | null {
    const entityInfo = this.entityInfo(entity);

    // Validate base point
    if (!this.validateCoordinates(entity.basePoint, errorReporter, entityInfo, 'base point')) {
      return null;
    }

    // Validate direction vector
    if (!this.validateCoordinates(entity.direction, errorReporter, entityInfo, 'direction vector')) {
      return null;
    }

    // Normalize direction vector
    const direction = this.normalizeVector(entity.direction);
    if (!direction) {
      errorReporter.addWarning(
        'Invalid direction vector (zero length)',
        'INVALID_DIRECTION',
        {
          ...entityInfo,
          direction: entity.direction
        }
      );
      return null;
    }

    // Create line extending in both directions
    const startPoint = {
      x: entity.basePoint.x - direction.x * RayGeometryConverter.MAX_LENGTH,
      y: entity.basePoint.y - direction.y * RayGeometryConverter.MAX_LENGTH,
      z: entity.basePoint.z !== undefined
        ? entity.basePoint.z - (direction.z || 0) * RayGeometryConverter.MAX_LENGTH
        : undefined
    };

    const endPoint = {
      x: entity.basePoint.x + direction.x * RayGeometryConverter.MAX_LENGTH,
      y: entity.basePoint.y + direction.y * RayGeometryConverter.MAX_LENGTH,
      z: entity.basePoint.z !== undefined
        ? entity.basePoint.z + (direction.z || 0) * RayGeometryConverter.MAX_LENGTH
        : undefined
    };

    return createLineStringGeometry([
      [startPoint.x, startPoint.y],
      [endPoint.x, endPoint.y]
    ]);
  }

  private normalizeVector(vector: Point3D): Point3D | null {
    const length = Math.sqrt(
      vector.x * vector.x +
      vector.y * vector.y +
      (vector.z || 0) * (vector.z || 0)
    );

    if (length === 0) {
      return null;
    }

    return {
      x: vector.x / length,
      y: vector.y / length,
      z: vector.z !== undefined ? vector.z / length : undefined
    };
  }
}
