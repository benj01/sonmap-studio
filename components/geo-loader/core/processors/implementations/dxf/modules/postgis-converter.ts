import { DxfEntity, DxfEntityType } from '../types';
import {
  PostGISGeometry,
  PostGISFeature,
  PostGISPoint,
  PostGISLineString,
  PostGISPolygon,
  PostGISMultiPoint,
  PostGISMultiLineString,
  PostGISMultiPolygon,
  PostGISGeometryCollection,
  Point
} from '../types/postgis';
import { ValidationError } from '../../../../errors/types';

// Entity data type definitions
interface Point2D {
  x: number;
  y: number;
  z?: number;
}

interface LineData extends Point2D {
  x2: number;
  y2: number;
  z2?: number;
}

interface EllipseData extends Point2D {
  majorAxis: Point2D;
  ratio: number;
}

interface ArcData extends Point2D {
  radius: number;
  startAngle: number;
  endAngle: number;
}

interface SplineData extends Point2D {
  controlPoints: Point2D[];
  knots?: number[];
  weights?: number[];
}

/**
 * Converts DXF entities to PostGIS format
 */
export class PostGISConverter {
  /**
   * Type guards for entity data
   */
  private static isPoint2D(point: unknown): point is Point2D {
    if (!point || typeof point !== 'object') return false;
    const p = point as any;
    return (
      typeof p.x === 'number' &&
      typeof p.y === 'number' &&
      (p.z === undefined || typeof p.z === 'number')
    );
  }

  private static isLineData(data: unknown): data is LineData {
    if (!this.isPoint2D(data)) return false;
    const d = data as any;
    return (
      typeof d.x2 === 'number' &&
      typeof d.y2 === 'number' &&
      (d.z2 === undefined || typeof d.z2 === 'number')
    );
  }

  private static isEllipseData(data: unknown): data is EllipseData {
    if (!this.isPoint2D(data)) return false;
    const d = data as any;
    return (
      d.majorAxis && this.isPoint2D(d.majorAxis) &&
      typeof d.ratio === 'number'
    );
  }

  private static isArcData(data: unknown): data is ArcData {
    if (!this.isPoint2D(data)) return false;
    const d = data as any;
    return (
      typeof d.radius === 'number' &&
      typeof d.startAngle === 'number' &&
      typeof d.endAngle === 'number'
    );
  }

  private static isSplineData(data: unknown): data is SplineData {
    if (!this.isPoint2D(data)) return false;
    const d = data as any;
    return (
      Array.isArray(d.controlPoints) &&
      d.controlPoints.length >= 2 &&
      d.controlPoints.every((p: unknown) => this.isPoint2D(p)) &&
      (!d.knots || Array.isArray(d.knots)) &&
      (!d.weights || Array.isArray(d.weights))
    );
  }

  /**
   * Convert point coordinates to WKT format, including Z if available
   */
  private static pointToWKT(point: Point2D): string {
    return point.z !== undefined ? 
      `${point.x} ${point.y} ${point.z}` : 
      `${point.x} ${point.y}`;
  }

  /**
   * Interpolate points along an arc
   */
  private static interpolateArc(
    centerX: number,
    centerY: number,
    radius: number,
    startAngle: number,
    endAngle: number,
    segments: number = 32
  ): Point2D[] {
    const points: Point2D[] = [];
    const angleRange = endAngle - startAngle;
    
    for (let i = 0; i <= segments; i++) {
      const angle = startAngle + (angleRange * i) / segments;
      const x = centerX + radius * Math.cos(angle * Math.PI / 180);
      const y = centerY + radius * Math.sin(angle * Math.PI / 180);
      points.push({ x, y });
    }
    
    return points;
  }

  /**
   * Interpolate points along an ellipse
   */
  private static interpolateEllipse(
    centerX: number,
    centerY: number,
    majorAxis: number,
    minorAxis: number,
    rotation: number,
    segments: number = 32
  ): Point2D[] {
    const points: Point2D[] = [];
    const rotationRad = rotation * Math.PI / 180;
    
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * 2 * Math.PI;
      const x = majorAxis * Math.cos(angle);
      const y = minorAxis * Math.sin(angle);
      
      // Apply rotation and translation
      const rotatedX = centerX + x * Math.cos(rotationRad) - y * Math.sin(rotationRad);
      const rotatedY = centerY + x * Math.sin(rotationRad) + y * Math.cos(rotationRad);
      
      points.push({ x: rotatedX, y: rotatedY });
    }
    
    return points;
  }

  /**
   * Interpolate points along a spline
   */
  private static interpolateSpline(
    controlPoints: Point2D[],
    knots: number[],
    weights: number[] | undefined,
    segments: number = 100
  ): Point2D[] {
    const effectiveWeights = weights || controlPoints.map(() => 1);
    const points: Point2D[] = [];
    const n = controlPoints.length - 1;
    
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      let x = 0;
      let y = 0;
      let w = 0;
      
      for (let j = 0; j <= n; j++) {
        const basis = this.bSplineBasis(j, 3, t, knots);
        const weight = effectiveWeights[j];
        x += controlPoints[j].x * basis * weight;
        y += controlPoints[j].y * basis * weight;
        w += basis * weight;
      }
      
      points.push({ x: x/w, y: y/w });
    }
    
    return points;
  }

  /**
   * Calculate B-spline basis function
   */
  private static bSplineBasis(
    i: number,
    degree: number,
    t: number,
    knots: number[]
  ): number {
    if (degree === 0) {
      return (t >= knots[i] && t < knots[i + 1]) ? 1 : 0;
    }
    
    let w1 = 0;
    let w2 = 0;
    
    if (knots[i + degree] - knots[i] !== 0) {
      w1 = ((t - knots[i]) / (knots[i + degree] - knots[i])) 
        * this.bSplineBasis(i, degree - 1, t, knots);
    }
    
    if (knots[i + degree + 1] - knots[i + 1] !== 0) {
      w2 = ((knots[i + degree + 1] - t) / (knots[i + degree + 1] - knots[i + 1])) 
        * this.bSplineBasis(i + 1, degree - 1, t, knots);
    }
    
    return w1 + w2;
  }

  /**
   * Convert DXF entity to WKT format
   */
  public static entityToWKT(entity: DxfEntity): string {
    if (!this.validateEntityData(entity)) {
      throw new ValidationError(
        `Invalid entity data for type: ${entity.type}`,
        'CONVERSION_ERROR'
      );
    }

    switch (entity.type) {
      case 'POINT': {
        if (!this.isPoint2D(entity.data)) {
          throw new ValidationError('Invalid point data', 'CONVERSION_ERROR');
        }
        return `POINT(${this.pointToWKT(entity.data)})`;
      }
      
      case 'LINE': {
        if (!this.isLineData(entity.data)) {
          throw new ValidationError('Invalid line data', 'CONVERSION_ERROR');
        }
        const start = this.pointToWKT(entity.data);
        const end = this.pointToWKT({
          x: entity.data.x2,
          y: entity.data.y2,
          z: entity.data.z2
        });
        return `LINESTRING(${start}, ${end})`;
      }
      
      case 'POLYLINE':
      case 'LWPOLYLINE': {
        if (!entity.data.vertices?.every(v => this.isPoint2D(v))) {
          throw new ValidationError('Invalid polyline vertices', 'CONVERSION_ERROR');
        }
        const vertices = entity.data.vertices.map(v => this.pointToWKT(v)).join(',');
        if (entity.data.closed) {
          return `POLYGON((${vertices},${this.pointToWKT(entity.data.vertices[0])}))`;
        }
        return `LINESTRING(${vertices})`;
      }
      
      case 'CIRCLE': {
        if (!this.isPoint2D(entity.data) || typeof entity.data.radius !== 'number') {
          throw new ValidationError('Invalid circle data', 'CONVERSION_ERROR');
        }
        const points = this.interpolateArc(
          entity.data.x,
          entity.data.y,
          entity.data.radius,
          0,
          360
        ).map(p => this.pointToWKT({ ...p, z: entity.data.z }));
        return `POLYGON((${points.join(',')}))`;
      }

      case 'ARC': {
        if (!this.isArcData(entity.data)) {
          throw new ValidationError('Invalid arc data', 'CONVERSION_ERROR');
        }
        const points = this.interpolateArc(
          entity.data.x,
          entity.data.y,
          entity.data.radius,
          entity.data.startAngle,
          entity.data.endAngle
        ).map(p => this.pointToWKT({ ...p, z: entity.data.z }));
        return `LINESTRING(${points.join(',')})`;
      }

      case 'ELLIPSE': {
        if (!this.isEllipseData(entity.data)) {
          throw new ValidationError('Invalid ellipse data', 'CONVERSION_ERROR');
        }
        const majorAxisLength = Math.sqrt(
          Math.pow(entity.data.majorAxis.x, 2) + 
          Math.pow(entity.data.majorAxis.y, 2)
        );
        const minorAxisLength = majorAxisLength * entity.data.ratio;
        const rotation = Math.atan2(
          entity.data.majorAxis.y,
          entity.data.majorAxis.x
        ) * 180 / Math.PI;

        const points = this.interpolateEllipse(
          entity.data.x,
          entity.data.y,
          majorAxisLength,
          minorAxisLength,
          rotation
        ).map(p => this.pointToWKT({ ...p, z: entity.data.z }));
        return `POLYGON((${points.join(',')}))`;
      }

      case 'SPLINE': {
        if (!this.isSplineData(entity.data)) {
          throw new ValidationError('Invalid spline data', 'CONVERSION_ERROR');
        }
        const points = this.interpolateSpline(
          entity.data.controlPoints,
          entity.data.knots || [],
          entity.data.weights
        ).map(p => this.pointToWKT({ ...p, z: entity.data.z }));
        return `LINESTRING(${points.join(',')})`;
      }

      case 'INSERT': {
        throw new ValidationError(
          'Block references should be expanded before conversion',
          'CONVERSION_ERROR'
        );
      }
      
      default:
        throw new ValidationError(
          `Unsupported entity type: ${entity.type}`,
          'CONVERSION_ERROR'
        );
    }
  }

  /**
   * Create PostGIS geometry from DXF entity
   */
  public static createGeometryFromEntity(
    entity: DxfEntity, 
    srid: number
  ): PostGISGeometry {
    if (!this.validateEntityData(entity)) {
      throw new ValidationError(
        `Invalid entity data for type: ${entity.type}`,
        'CONVERSION_ERROR'
      );
    }

    const wkt = this.entityToWKT(entity);
    const baseGeometry = {
      srid,
      wkt,
      attributes: entity.attributes
    };

    const toPoint = (p: Point2D): Point => [p.x, p.y];

    switch (entity.type) {
      case 'POINT': {
        if (!this.isPoint2D(entity.data)) {
          throw new ValidationError('Invalid point data', 'CONVERSION_ERROR');
        }
        const point: PostGISPoint = {
          ...baseGeometry,
          type: 'POINT',
          coordinates: toPoint(entity.data)
        };
        return point;
      }

      case 'LINE': {
        if (!this.isLineData(entity.data)) {
          throw new ValidationError('Invalid line data', 'CONVERSION_ERROR');
        }
        const lineString: PostGISLineString = {
          ...baseGeometry,
          type: 'LINESTRING',
          coordinates: [
            toPoint(entity.data),
            toPoint({ x: entity.data.x2, y: entity.data.y2, z: entity.data.z2 })
          ]
        };
        return lineString;
      }

      case 'POLYLINE':
      case 'LWPOLYLINE': {
        if (!entity.data.vertices?.every(v => this.isPoint2D(v))) {
          throw new ValidationError('Invalid polyline vertices', 'CONVERSION_ERROR');
        }
        const coords = entity.data.vertices.map(toPoint);
        if (entity.data.closed) {
          const polygon: PostGISPolygon = {
            ...baseGeometry,
            type: 'POLYGON',
            coordinates: [coords.concat([coords[0]])]
          };
          return polygon;
        }
        const lineString: PostGISLineString = {
          ...baseGeometry,
          type: 'LINESTRING',
          coordinates: coords
        };
        return lineString;
      }

      case 'CIRCLE': {
        if (!this.isPoint2D(entity.data) || typeof entity.data.radius !== 'number') {
          throw new ValidationError('Invalid circle data', 'CONVERSION_ERROR');
        }
        const points = this.interpolateArc(
          entity.data.x,
          entity.data.y,
          entity.data.radius,
          0,
          360
        ).map(toPoint);
        const polygon: PostGISPolygon = {
          ...baseGeometry,
          type: 'POLYGON',
          coordinates: [points]
        };
        return polygon;
      }

      case 'ARC': {
        if (!this.isArcData(entity.data)) {
          throw new ValidationError('Invalid arc data', 'CONVERSION_ERROR');
        }
        const points = this.interpolateArc(
          entity.data.x,
          entity.data.y,
          entity.data.radius,
          entity.data.startAngle,
          entity.data.endAngle
        ).map(toPoint);
        const lineString: PostGISLineString = {
          ...baseGeometry,
          type: 'LINESTRING',
          coordinates: points
        };
        return lineString;
      }

      case 'ELLIPSE': {
        if (!this.isEllipseData(entity.data)) {
          throw new ValidationError('Invalid ellipse data', 'CONVERSION_ERROR');
        }
        const majorAxisLength = Math.sqrt(
          Math.pow(entity.data.majorAxis.x, 2) + 
          Math.pow(entity.data.majorAxis.y, 2)
        );
        const minorAxisLength = majorAxisLength * entity.data.ratio;
        const rotation = Math.atan2(
          entity.data.majorAxis.y,
          entity.data.majorAxis.x
        ) * 180 / Math.PI;

        const points = this.interpolateEllipse(
          entity.data.x,
          entity.data.y,
          majorAxisLength,
          minorAxisLength,
          rotation
        ).map(toPoint);
        const polygon: PostGISPolygon = {
          ...baseGeometry,
          type: 'POLYGON',
          coordinates: [points]
        };
        return polygon;
      }

      case 'SPLINE': {
        if (!this.isSplineData(entity.data)) {
          throw new ValidationError('Invalid spline data', 'CONVERSION_ERROR');
        }
        const points = this.interpolateSpline(
          entity.data.controlPoints,
          entity.data.knots || [],
          entity.data.weights
        ).map(toPoint);
        const lineString: PostGISLineString = {
          ...baseGeometry,
          type: 'LINESTRING',
          coordinates: points
        };
        return lineString;
      }

      default:
        throw new ValidationError(
          `Unsupported entity type: ${entity.type}`,
          'CONVERSION_ERROR'
        );
    }
  }

  /**
   * Create PostGIS feature from DXF entity
   */
  public static createFeature(
    entity: DxfEntity,
    geometry: PostGISGeometry,
    srid: number
  ): PostGISFeature {
    const newGeometry = this.createGeometryFromEntity(entity, srid);

    return {
      type: 'Feature',
      id: entity.attributes?.handle || crypto.randomUUID(),
      layerId: '', // Will be set during import
      geometry: newGeometry,
      properties: {
        ...entity.attributes,
        entityType: entity.type
      }
    };
  }

  /**
   * Validate entity data for conversion
   */
  public static validateEntityData(entity: DxfEntity): boolean {
    switch (entity.type) {
      case 'POINT':
        return this.isPoint2D(entity.data);
      
      case 'LINE':
        return this.isLineData(entity.data);
      
      case 'POLYLINE':
      case 'LWPOLYLINE':
        // Allow multi-part polylines by validating each part separately
        if (!Array.isArray(entity.data.vertices)) return false;
        
        // For multi-part polylines, each part should have at least 2 vertices
        const numParts = typeof entity.data.numParts === 'number' ? entity.data.numParts : 1;
        if (numParts > 1) {
          // Split vertices into parts based on null points which act as separators
          const parts = entity.data.vertices.reduce((acc: Point2D[][], vertex) => {
            // null vertex indicates a new part
            if (!vertex) {
              acc.push([]);
              return acc;
            }
            // Add vertex to current part
            if (acc.length === 0) acc.push([]);
            if (this.isPoint2D(vertex)) {
              acc[acc.length - 1].push(vertex);
            }
            return acc;
          }, []);
          
          // Each part should have at least 2 vertices
          return parts.every(part => part.length >= 2 && part.every(v => this.isPoint2D(v)));
        }
        
        // For single-part polylines, just check if we have at least 2 valid vertices
        return entity.data.vertices.length >= 2 && 
               entity.data.vertices.every(v => this.isPoint2D(v));
      
      case 'CIRCLE':
        return this.isPoint2D(entity.data) &&
               typeof entity.data.radius === 'number';

      case 'ARC':
        return this.isArcData(entity.data);

      case 'ELLIPSE':
        return this.isEllipseData(entity.data);

      case 'SPLINE':
        return this.isSplineData(entity.data);
      
      default:
        return false;
    }
  }
}
