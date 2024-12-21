import { Geometry } from 'geojson';
import { BaseGeometryConverter } from './base';
import { ErrorReporter } from '../../../errors';
import { createPolygonGeometry } from '../../../geometry-utils';
import {
  DxfEntityBase,
  SolidEntity,
  Solid3DEntity,
  isSolidEntity,
  isSolid3DEntity
} from './types';

/**
 * Converter for SOLID and 3DSOLID entities
 */
export class SolidGeometryConverter extends BaseGeometryConverter {
  canHandle(entityType: string): boolean {
    return entityType === 'SOLID' || entityType === '3DSOLID';
  }

  convert(entity: DxfEntityBase, errorReporter: ErrorReporter): Geometry | null {
    if (isSolidEntity(entity)) {
      return this.convertSolid(entity, errorReporter);
    }
    if (isSolid3DEntity(entity)) {
      return this.convert3DSolid(entity, errorReporter);
    }
    return null;
  }

  private convertSolid(
    entity: SolidEntity,
    errorReporter: ErrorReporter
  ): Geometry | null {
    const entityInfo = this.entityInfo(entity);

    // Validate all points
    for (let i = 0; i < entity.points.length; i++) {
      if (!this.validateCoordinates(entity.points[i], errorReporter, entityInfo, `point ${i + 1}`)) {
        return null;
      }
    }

    // Convert points to coordinate pairs
    const coordinates: [number, number][] = entity.points.map(point => [point.x, point.y]);

    // Close the polygon by repeating the first point
    coordinates.push(coordinates[0]);

    // Create a polygon with a single ring
    return createPolygonGeometry([coordinates]);
  }

  private convert3DSolid(
    entity: Solid3DEntity,
    errorReporter: ErrorReporter
  ): Geometry | null {
    const entityInfo = this.entityInfo(entity);

    // Validate ACIS data
    if (!entity.acisData || entity.acisData.length === 0) {
      errorReporter.addWarning(
        'Empty ACIS data in 3DSOLID',
        'EMPTY_ACIS_DATA',
        entityInfo
      );
      return null;
    }

    // Validate version if present
    if (entity.version !== undefined && !this.validateNumber(entity.version, errorReporter, entityInfo, 'ACIS version')) {
      return null;
    }

    // TODO: Implement ACIS data parsing
    // For now, just add a warning that this isn't implemented yet
    errorReporter.addWarning(
      'ACIS data parsing not implemented yet',
      'ACIS_PARSING_PENDING',
      {
        ...entityInfo,
        version: entity.version,
        dataLength: entity.acisData.length
      }
    );

    return null;
  }
}
