import { Geometry } from 'geojson';
import { BaseGeometryConverter } from './base';
import { ErrorReporter } from '../../../errors';
import { createLineStringGeometry, createPolygonGeometry } from '../../../geometry-utils';
import {
  DxfEntityBase,
  PolylineEntity,
  LWPolylineEntity,
  isPolylineEntity,
  LinearEntity,
  Point3D
} from './types';

/**
 * Converter for polyline entities (POLYLINE and LWPOLYLINE)
 */
export class PolylineGeometryConverter extends BaseGeometryConverter {
  canHandle(entityType: string): boolean {
    return ['POLYLINE', 'LWPOLYLINE', 'LINE'].includes(entityType);
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
    // Create a vertex validator closure that captures errorReporter and entityInfo
    const validateVertexWithContext = (vertex: unknown): vertex is Point3D => {
      const index = entity.vertices.indexOf(vertex as any);
      return this.validateVertex(errorReporter, entityInfo, vertex, index);
    };

    // Validate vertices array
    if (!this.validateArray<Point3D>(
      entity.vertices,
      validateVertexWithContext,
      errorReporter,
      entityInfo,
      'polyline vertices',
      { minLength: 2 }
    )) {
      return null;
    }

    // Convert vertices to coordinates
    const coordinates: [number, number][] = [];
    
    for (let i = 0; i < entity.vertices.length; i++) {
      const vertex = entity.vertices[i];
      
      // Skip validation since we already validated in validateVertex
      coordinates.push([vertex.x, vertex.y]);
    }

    // Handle closed polylines
    if (entity.closed && coordinates.length >= 3) {
      const first = coordinates[0];
      const last = coordinates[coordinates.length - 1];
      
      // If the polyline isn't already closed, close it by adding the first point again
      if (first[0] !== last[0] || first[1] !== last[1]) {
        coordinates.push([first[0], first[1]]);
      }
      
      return createPolygonGeometry([coordinates]);
    }

    // For open polylines, create a LineString
    return createLineStringGeometry(coordinates);
  }

  private validateVertex(
    errorReporter: ErrorReporter,
    entityInfo: ReturnType<typeof this.entityInfo>,
    vertex: unknown,
    index: number
  ): vertex is Point3D {
    if (!this.validateCoordinates(vertex, errorReporter, entityInfo, `polyline vertex ${index}`)) {
      return false;
    }

    // Additional validation for bulge if present
    const v = vertex as any;
    if ('bulge' in v && !this.validateNumber(v.bulge, errorReporter, entityInfo, `vertex ${index} bulge`)) {
      return false;
    }

    return true;
  }
}
