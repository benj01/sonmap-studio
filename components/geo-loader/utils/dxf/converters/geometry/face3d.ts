import { Geometry } from 'geojson';
import { BaseGeometryConverter } from './base';
import { ErrorReporter } from '../../../errors';
import { createPolygonGeometry } from '../../../geometry-utils';
import { DxfEntityBase, Face3DEntity, is3DFaceEntity, Point3D } from './types';

/**
 * Converter for 3DFACE entities
 */
export class Face3DGeometryConverter extends BaseGeometryConverter {
  canHandle(entityType: string): boolean {
    return entityType === '3DFACE';
  }

  convert(entity: DxfEntityBase, errorReporter: ErrorReporter): Geometry | null {
    if (!is3DFaceEntity(entity)) {
      return null;
    }

    const entityInfo = this.entityInfo(entity);

    // Validate all vertices
    for (let i = 0; i < entity.vertices.length; i++) {
      if (!this.validateCoordinates(entity.vertices[i], errorReporter, entityInfo, `vertex ${i + 1}`)) {
        return null;
      }
    }

    // Convert vertices to coordinate pairs - we know vertices exist from validation
    const coordinates: [number, number][] = entity.vertices
      .filter((vertex): vertex is Point3D => vertex !== undefined)
      .map((vertex) => [vertex.x, vertex.y] as [number, number]);

    // Close the polygon by repeating the first vertex
    coordinates.push(coordinates[0]);

    // Create a polygon with a single ring
    return createPolygonGeometry([coordinates]);
  }
}
