import { Geometry, Polygon } from 'geojson';
import { BaseGeometryConverter } from './base';
import { ErrorReporter } from '../../../errors';
import { createPolygonGeometry } from '../../../geometry-utils';
import {
  DxfEntityBase,
  HatchEntity,
  HatchEdge,
  isHatchEntity,
  Point2D,
  HatchLineEdge,
  HatchArcEdge,
  HatchEllipseEdge,
  HatchSplineEdge
} from './types';

/**
 * Converter for HATCH entities
 */
export class HatchGeometryConverter extends BaseGeometryConverter {
  private static readonly ARC_SEGMENTS = 32;
  private static readonly ELLIPSE_SEGMENTS = 32;
  private static readonly SPLINE_SEGMENTS = 32;

  canHandle(entityType: string): boolean {
    return entityType === 'HATCH';
  }

  convert(entity: DxfEntityBase, errorReporter: ErrorReporter): Geometry | null {
    if (!isHatchEntity(entity)) {
      return null;
    }

    const entityInfo = this.entityInfo(entity);

    // Validate elevation if present
    if (entity.elevation !== undefined && !this.validateNumber(entity.elevation, errorReporter, entityInfo, 'elevation')) {
      return null;
    }

    // Convert each boundary path to a polygon ring
    const rings: [number, number][][] = [];
    
    for (const path of entity.paths) {
      const coordinates: [number, number][] = [];
      
      // Convert each edge to line segments
      for (const edge of path.edges) {
        const segments = this.convertEdgeToPoints(edge, errorReporter, entityInfo);
        if (!segments) {
          return null;
        }
        coordinates.push(...segments);
      }

      // Close the path if needed
      if (path.closed && coordinates.length > 0) {
        coordinates.push(coordinates[0]);
      }

      if (coordinates.length >= 3) {
        rings.push(coordinates);
      } else {
        errorReporter.addWarning(
          'Invalid hatch boundary path: insufficient points',
          'INVALID_BOUNDARY_PATH',
          {
            ...entityInfo,
            pointCount: coordinates.length
          }
        );
      }
    }

    if (rings.length === 0) {
      errorReporter.addWarning(
        'No valid boundary paths in hatch',
        'NO_VALID_PATHS',
        entityInfo
      );
      return null;
    }

    // Create a polygon with all boundary rings
    return createPolygonGeometry(rings);
  }

  private convertEdgeToPoints(
    edge: HatchEdge,
    errorReporter: ErrorReporter,
    entityInfo: ReturnType<typeof this.entityInfo>
  ): [number, number][] | null {
    switch (edge.type) {
      case 'LINE':
        return this.convertLineEdge(edge, errorReporter, entityInfo);
      case 'ARC':
        return this.convertArcEdge(edge, errorReporter, entityInfo);
      case 'ELLIPSE':
        return this.convertEllipseEdge(edge, errorReporter, entityInfo);
      case 'SPLINE':
        return this.convertSplineEdge(edge, errorReporter, entityInfo);
      default:
        errorReporter.addWarning(
          'Unsupported hatch edge type',
          'UNSUPPORTED_EDGE_TYPE',
          {
            ...entityInfo,
            edgeType: (edge as any).type
          }
        );
        return null;
    }
  }

  private convertLineEdge(
    edge: HatchLineEdge,
    errorReporter: ErrorReporter,
    entityInfo: ReturnType<typeof this.entityInfo>
  ): [number, number][] | null {
    // Validate points
    if (!this.validateCoordinates(edge.start, errorReporter, entityInfo, 'line start') ||
        !this.validateCoordinates(edge.end, errorReporter, entityInfo, 'line end')) {
      return null;
    }

    return [[edge.start.x, edge.start.y], [edge.end.x, edge.end.y]];
  }

  private convertArcEdge(
    edge: HatchArcEdge,
    errorReporter: ErrorReporter,
    entityInfo: ReturnType<typeof this.entityInfo>
  ): [number, number][] | null {
    // Validate parameters
    if (!this.validateCoordinates(edge.center, errorReporter, entityInfo, 'arc center')) {
      return null;
    }
    if (!this.validateNumber(edge.radius, errorReporter, entityInfo, 'arc radius', { nonZero: true })) {
      return null;
    }
    if (!this.validateNumber(edge.startAngle, errorReporter, entityInfo, 'arc start angle')) {
      return null;
    }
    if (!this.validateNumber(edge.endAngle, errorReporter, entityInfo, 'arc end angle')) {
      return null;
    }

    const points: [number, number][] = [];
    let startAngle = (edge.startAngle * Math.PI) / 180;
    let endAngle = (edge.endAngle * Math.PI) / 180;

    // Handle counterclockwise flag
    if (edge.counterclockwise) {
      if (endAngle >= startAngle) {
        endAngle -= 2 * Math.PI;
      }
    } else {
      if (endAngle <= startAngle) {
        endAngle += 2 * Math.PI;
      }
    }

    const angleIncrement = (endAngle - startAngle) / HatchGeometryConverter.ARC_SEGMENTS;

    for (let i = 0; i <= HatchGeometryConverter.ARC_SEGMENTS; i++) {
      const angle = startAngle + i * angleIncrement;
      const x = edge.center.x + edge.radius * Math.cos(angle);
      const y = edge.center.y + edge.radius * Math.sin(angle);

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

      points.push([x, y]);
    }

    return points;
  }

  private convertEllipseEdge(
    edge: HatchEllipseEdge,
    errorReporter: ErrorReporter,
    entityInfo: ReturnType<typeof this.entityInfo>
  ): [number, number][] | null {
    // Validate parameters
    if (!this.validateCoordinates(edge.center, errorReporter, entityInfo, 'ellipse center')) {
      return null;
    }
    if (!this.validateCoordinates(edge.majorAxis, errorReporter, entityInfo, 'ellipse major axis')) {
      return null;
    }
    if (!this.validateNumber(edge.minorAxisRatio, errorReporter, entityInfo, 'ellipse minor axis ratio', { nonZero: true })) {
      return null;
    }
    if (!this.validateNumber(edge.startAngle, errorReporter, entityInfo, 'ellipse start angle')) {
      return null;
    }
    if (!this.validateNumber(edge.endAngle, errorReporter, entityInfo, 'ellipse end angle')) {
      return null;
    }

    const points: [number, number][] = [];
    let startAngle = edge.startAngle;
    let endAngle = edge.endAngle;

    // Handle counterclockwise flag
    if (edge.counterclockwise) {
      if (endAngle >= startAngle) {
        endAngle -= 2 * Math.PI;
      }
    } else {
      if (endAngle <= startAngle) {
        endAngle += 2 * Math.PI;
      }
    }

    const majorLength = Math.sqrt(
      edge.majorAxis.x * edge.majorAxis.x +
      edge.majorAxis.y * edge.majorAxis.y
    );

    if (!isFinite(majorLength) || majorLength === 0) {
      errorReporter.addWarning(
        'Invalid major axis length for ellipse',
        'INVALID_ELLIPSE_AXIS',
        {
          ...entityInfo,
          majorAxis: edge.majorAxis,
          majorLength
        }
      );
      return null;
    }

    const rotation = Math.atan2(edge.majorAxis.y, edge.majorAxis.x);
    const angleIncrement = (endAngle - startAngle) / HatchGeometryConverter.ELLIPSE_SEGMENTS;

    for (let i = 0; i <= HatchGeometryConverter.ELLIPSE_SEGMENTS; i++) {
      const angle = startAngle + i * angleIncrement;
      const cosAngle = Math.cos(angle);
      const sinAngle = Math.sin(angle);
      
      const x = majorLength * cosAngle;
      const y = majorLength * edge.minorAxisRatio * sinAngle;
      
      const rotatedX = x * Math.cos(rotation) - y * Math.sin(rotation);
      const rotatedY = x * Math.sin(rotation) + y * Math.cos(rotation);
      
      const finalX = edge.center.x + rotatedX;
      const finalY = edge.center.y + rotatedY;

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

      points.push([finalX, finalY]);
    }

    return points;
  }

  private convertSplineEdge(
    edge: HatchSplineEdge,
    errorReporter: ErrorReporter,
    entityInfo: ReturnType<typeof this.entityInfo>
  ): [number, number][] | null {
    // Validate parameters
    if (!this.validateNumber(edge.degree, errorReporter, entityInfo, 'spline degree', { min: 1 })) {
      return null;
    }

    // Validate control points
    for (let i = 0; i < edge.controlPoints.length; i++) {
      if (!this.validateCoordinates(edge.controlPoints[i], errorReporter, entityInfo, `control point ${i + 1}`)) {
        return null;
      }
    }

    // For now, just connect control points with straight lines
    // TODO: Implement proper spline interpolation
    return edge.controlPoints.map(point => [point.x, point.y] as [number, number]);
  }
}
