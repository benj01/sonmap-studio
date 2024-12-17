import { GeoFeature, Geometry } from '../../../../types/geo';
import { createFeature, createLineStringGeometry, createPointGeometry, createPolygonGeometry } from '../geometry-utils';
import { DxfEntity, DxfEntityBase, Vector3, DxfSplineEntity } from './types';
import { DxfValidator } from './validator';

export class DxfConverter {
  static entityToGeometry(entity: DxfEntity): Geometry | null {
    try {
      switch (entity.type) {
        case '3DFACE': {
          const coordinates = entity.vertices.map(v => [v.x, v.y] as [number, number]);
          // Ensure the polygon is closed
          if (
            coordinates[0][0] !== coordinates[coordinates.length - 1][0] ||
            coordinates[0][1] !== coordinates[coordinates.length - 1][1]
          ) {
            coordinates.push([coordinates[0][0], coordinates[0][1]]);
          }
          return createPolygonGeometry([coordinates]);
        }

        case 'POINT': {
          return createPointGeometry(
            entity.position.x,
            entity.position.y,
            entity.position.z
          );
        }

        case 'LINE': {
          const coordinates: [number, number][] = [
            [entity.start.x, entity.start.y],
            [entity.end.x, entity.end.y]
          ];
          return createLineStringGeometry(coordinates);
        }

        case 'POLYLINE':
        case 'LWPOLYLINE': {
          const coordinates = entity.vertices.map(v => [v.x, v.y] as [number, number]);
          if (entity.closed && coordinates.length >= 3) {
            const first = coordinates[0];
            const last = coordinates[coordinates.length - 1];
            if (first[0] !== last[0] || first[1] !== last[1]) {
              coordinates.push([first[0], first[1]]);
            }
            return createPolygonGeometry([coordinates]);
          }
          return createLineStringGeometry(coordinates);
        }

        case 'CIRCLE': {
          const circleCoords: [number, number][] = [];
          const segments = 64;
          for (let i = 0; i <= segments; i++) {
            const angle = (i * 2 * Math.PI) / segments;
            const x = entity.center.x + entity.radius * Math.cos(angle);
            const y = entity.center.y + entity.radius * Math.sin(angle);
            if (!isFinite(x) || !isFinite(y)) {
              console.warn('Invalid circle point calculation.');
              return null;
            }
            circleCoords.push([x, y]);
          }
          return createPolygonGeometry([circleCoords]);
        }

        case 'ARC': {
          const arcCoords: [number, number][] = [];
          const segments = 32;
          let startAngle = (entity.startAngle * Math.PI) / 180;
          let endAngle = (entity.endAngle * Math.PI) / 180;
          
          if (endAngle <= startAngle) {
            endAngle += 2 * Math.PI;
          }
          
          const angleIncrement = (endAngle - startAngle) / segments;

          for (let i = 0; i <= segments; i++) {
            const angle = startAngle + i * angleIncrement;
            const x = entity.center.x + entity.radius * Math.cos(angle);
            const y = entity.center.y + entity.radius * Math.sin(angle);
            if (!isFinite(x) || !isFinite(y)) {
              console.warn('Invalid arc point calculation.');
              return null;
            }
            arcCoords.push([x, y]);
          }
          return createLineStringGeometry(arcCoords);
        }

        case 'ELLIPSE': {
          const ellipseCoords: [number, number][] = [];
          const segments = 64;
          const majorLength = Math.sqrt(
            entity.majorAxis.x * entity.majorAxis.x +
            entity.majorAxis.y * entity.majorAxis.y
          );

          if (!isFinite(majorLength) || majorLength === 0) {
            console.warn('Invalid major axis length for ELLIPSE.');
            return null;
          }

          const rotation = Math.atan2(entity.majorAxis.y, entity.majorAxis.x);
          let startA = entity.startAngle;
          let endA = entity.endAngle;
          
          if (endA <= startA) {
            endA += 2 * Math.PI;
          }
          
          const angleIncrement = (endA - startA) / segments;

          for (let i = 0; i <= segments; i++) {
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
              console.warn('Invalid ellipse point calculation.');
              return null;
            }
            ellipseCoords.push([finalX, finalY]);
          }
          return createLineStringGeometry(ellipseCoords);
        }

        case 'TEXT':
        case 'MTEXT': {
          // Represent text entities as points with text properties
          return createPointGeometry(
            entity.position.x,
            entity.position.y,
            entity.position.z
          );
        }

        case 'SPLINE': {
          // For splines, we'll create a series of points along the curve
          // This is a simple linear approximation - for better results,
          // you might want to implement proper spline interpolation
          const coordinates = entity.controlPoints.map(p => [p.x, p.y] as [number, number]);
          
          if (entity.closed && coordinates.length >= 3) {
            coordinates.push(coordinates[0]);
            return createPolygonGeometry([coordinates]);
          }
          
          return createLineStringGeometry(coordinates);
        }

        default:
          console.warn(`Unsupported entity type: ${entity.type}`);
          return null;
      }
    } catch (error: any) {
      console.error('Error converting entity to geometry:', error?.message || error);
      return null;
    }
  }

  static entityToGeoFeature(entity: DxfEntity, layerInfo?: Record<string, any>): GeoFeature | null {
    try {
      const validationError = DxfValidator.getEntityValidationError(entity);
      if (validationError) {
        console.warn(`Validation error for entity ${entity.handle || 'unknown'}: ${validationError}`);
        return null;
      }

      const geometry = this.entityToGeometry(entity);
      if (!geometry) {
        return null;
      }

      const properties = this.extractEntityProperties(entity, layerInfo);

      // Add text-specific properties
      if (entity.type === 'TEXT' || entity.type === 'MTEXT') {
        Object.assign(properties, {
          text: (entity as any).text,
          height: (entity as any).height,
          rotation: (entity as any).rotation,
          width: (entity as any).width,
          style: (entity as any).style,
          horizontalAlignment: (entity as any).horizontalAlignment,
          verticalAlignment: (entity as any).verticalAlignment
        });
      }

      // Add spline-specific properties
      if (entity.type === 'SPLINE') {
        const spline = entity as DxfSplineEntity;
        Object.assign(properties, {
          degree: spline.degree,
          closed: spline.closed,
          hasKnots: !!spline.knots,
          hasWeights: !!spline.weights,
          controlPointCount: spline.controlPoints.length
        });
      }

      return createFeature(geometry, properties);
    } catch (error: any) {
      console.warn(
        `Error converting entity to feature (type: "${entity.type}", handle: "${entity.handle || 'unknown'}"):`,
        error?.message || error
      );
      return null;
    }
  }

  private static extractEntityProperties(
    entity: DxfEntityBase,
    layerInfo?: Record<string, any>
  ): Record<string, any> {
    const layer = layerInfo?.[entity.layer || '0'];
    return {
      id: entity.handle,
      type: entity.type,
      layer: entity.layer || '0',
      color: entity.color ?? layer?.color,
      colorRGB: entity.colorRGB ?? layer?.colorRGB,
      lineType: entity.lineType ?? layer?.lineType,
      lineWeight: entity.lineWeight ?? layer?.lineWeight,
      elevation: entity.elevation,
      thickness: entity.thickness,
      visible: entity.visible ?? layer?.visible,
      extrusionDirection: entity.extrusionDirection
    };
  }
}
