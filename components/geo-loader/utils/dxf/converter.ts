import { GeoFeature } from '../../../../types/geo';
import { Geometry } from 'geojson';
import { createFeature, createLineStringGeometry, createPointGeometry, createPolygonGeometry } from '../geometry-utils';
import { DxfEntity, DxfEntityBase, Vector3, DxfSplineEntity } from './types';
import { DxfValidator } from './validator';
import { ErrorReporter, GeometryError } from '../errors';

// Type for entity info used in error handling
interface EntityErrorInfo {
  type: string;
  handle: string;
}

// Helper function for handling errors
function handleError(
  error: unknown,
  errorReporter: ErrorReporter,
  entityInfo: EntityErrorInfo,
  context: string
): void {
  if (error instanceof GeometryError) {
    errorReporter.addError(error.message, error.code, error.details);
  } else {
    errorReporter.addError(
      `Failed to ${context}`,
      `${context.toUpperCase()}_ERROR`,
      {
        entityType: entityInfo.type,
        handle: entityInfo.handle,
        error: error instanceof Error ? error.message : String(error)
      }
    );
  }
}

export class DxfConverter {
  private validator: DxfValidator;

  constructor(private errorReporter: ErrorReporter) {
    this.validator = new DxfValidator();
  }

  // Rest of the class implementation remains the same until the catch blocks...
  entityToGeometry(entity: DxfEntity): Geometry | null {
    // Store entity info for error handling
    const entityInfo: EntityErrorInfo = {
      type: entity.type,
      handle: entity.handle || 'unknown'
    };

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
              this.errorReporter.addWarning(
                'Invalid circle point calculation',
                'INVALID_CIRCLE_POINT',
                {
                  entityType: entityInfo.type,
                  handle: entityInfo.handle,
                  center: entity.center,
                  radius: entity.radius,
                  angle: angle
                }
              );
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
              this.errorReporter.addWarning(
                'Invalid arc point calculation',
                'INVALID_ARC_POINT',
                {
                  entityType: entityInfo.type,
                  handle: entityInfo.handle,
                  center: entity.center,
                  radius: entity.radius,
                  angle: angle
                }
              );
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
            this.errorReporter.addWarning(
              'Invalid major axis length for ELLIPSE',
              'INVALID_ELLIPSE_AXIS',
              {
                entityType: entityInfo.type,
                handle: entityInfo.handle,
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
              this.errorReporter.addWarning(
                'Invalid ellipse point calculation',
                'INVALID_ELLIPSE_POINT',
                {
                  entityType: entityInfo.type,
                  handle: entityInfo.handle,
                  center: entity.center,
                  majorAxis: entity.majorAxis,
                  angle: angle,
                  point: { x: finalX, y: finalY }
                }
              );
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
          this.errorReporter.addWarning(
            `Unsupported entity type: ${entityInfo.type}`,
            'UNSUPPORTED_ENTITY_TYPE',
            {
              entityType: entityInfo.type,
              handle: entityInfo.handle
            }
          );
          return null;
      }
    } catch (error: unknown) {
      handleError(error, this.errorReporter, entityInfo, 'convert entity to geometry');
      return null;
    }
  }

  entityToGeoFeature(entity: DxfEntity, layerInfo?: Record<string, any>): GeoFeature | null {
    // Store entity info for error handling
    const entityInfo: EntityErrorInfo = {
      type: entity.type,
      handle: entity.handle || 'unknown'
    };

    try {
      const validationError = this.validator.validateEntity(entity);
      if (validationError) {
        this.errorReporter.addWarning(
          `Validation error for entity ${entityInfo.handle}: ${validationError}`,
          'ENTITY_VALIDATION_ERROR',
          {
            entityType: entityInfo.type,
            handle: entityInfo.handle,
            validationError
          }
        );
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
    } catch (error: unknown) {
      handleError(error, this.errorReporter, entityInfo, 'convert entity to feature');
      return null;
    }
  }

  private extractEntityProperties(
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
