import { Geometry } from 'geojson';
import { BaseGeometryConverter, geometryConverterRegistry } from './base';
import { ErrorReporter } from '../../../errors';
import { createLineStringGeometry, createPolygonGeometry } from '../../../geometry-utils';
import {
  DxfEntityBase,
  PolylineEntity,
  LWPolylineEntity,
  isPolylineEntity,
  LinearEntity
} from './types';

/**
 * Converter for polyline entities (POLYLINE and LWPOLYLINE)
 */
export class PolylineGeometryConverter extends BaseGeometryConverter {
  canHandle(entityType: string): boolean {
    return ['POLYLINE', 'LWPOLYLINE'].includes(entityType);
  }

  convert(entity: DxfEntityBase, errorReporter: ErrorReporter): Geometry | null {
    const entityInfo = this.entityInfo(entity);

    if (!isPolylineEntity(entity)) {
      return null;
    }

    return this.convertPolyline(entity, errorReporter, entityInfo);
  }

  private convertPolyline(
    entity: LinearEntity,
    errorReporter: ErrorReporter,
    entityInfo: ReturnType<typeof this.entityInfo>
  ): Geometry | null {
    // Validate vertices
    if (!entity.vertices || entity.vertices.length < 2) {
      errorReporter.addWarning(
        'Polyline has insufficient vertices',
        'INVALID_POLYLINE_VERTICES',
        {
          entityType: entityInfo.type,
          handle: entityInfo.handle,
          vertexCount: entity.vertices?.length ?? 0
        }
      );
      return null;
    }

    // Convert vertices to coordinates
    const coordinates = entity.vertices.map(v => {
      if (!isFinite(v.x) || !isFinite(v.y)) {
        errorReporter.addWarning(
          'Invalid polyline vertex coordinates',
          'INVALID_POLYLINE_VERTEX',
          {
            entityType: entityInfo.type,
            handle: entityInfo.handle,
            vertex: v
          }
        );
        return null;
      }
      return [v.x, v.y] as [number, number];
    });

    // Filter out any invalid coordinates
    const validCoordinates = coordinates.filter((coord): coord is [number, number] => coord !== null);

    if (validCoordinates.length < 2) {
      errorReporter.addWarning(
        'Polyline has insufficient valid vertices',
        'INVALID_POLYLINE_VERTICES',
        {
          entityType: entityInfo.type,
          handle: entityInfo.handle,
          validVertexCount: validCoordinates.length
        }
      );
      return null;
    }

    // Handle closed polylines
    if (entity.closed && validCoordinates.length >= 3) {
      const first = validCoordinates[0];
      const last = validCoordinates[validCoordinates.length - 1];
      
      // If the polyline isn't already closed, close it by adding the first point again
      if (first[0] !== last[0] || first[1] !== last[1]) {
        validCoordinates.push([first[0], first[1]]);
      }
      
      return createPolygonGeometry([validCoordinates]);
    }

    // For open polylines, create a LineString
    return createLineStringGeometry(validCoordinates);
  }
}

// Register the converter
geometryConverterRegistry.register(new PolylineGeometryConverter());
