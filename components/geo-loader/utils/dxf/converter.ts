import { DxfEntity, Vector3 } from './types';
import { GeoFeature } from '../../../../types/geo';
import { ErrorReporter } from '../errors';
import { TransformUtils } from './transform';

/**
 * Converts DXF entities to GeoJSON features
 */
export class DxfConverter {
  constructor(private readonly errorReporter: ErrorReporter) {}

  /**
   * Convert a DXF entity to a GeoJSON feature
   */
  entityToGeoFeature(entity: DxfEntity): GeoFeature | null {
    try {
      let geometry: any = null;
      const properties: Record<string, any> = {
        type: entity.type,
        layer: entity.layer,
        handle: entity.handle,
        color: entity.color,
        lineType: entity.lineType
      };

      switch (entity.type) {
        case 'POINT': {
          geometry = {
            type: 'Point',
            coordinates: [entity.position.x, entity.position.y]
          };
          break;
        }

        case 'LINE': {
          geometry = {
            type: 'LineString',
            coordinates: [
              [entity.start.x, entity.start.y],
              [entity.end.x, entity.end.y]
            ]
          };
          break;
        }

        case 'POLYLINE':
        case 'LWPOLYLINE': {
          const coordinates = entity.vertices.map(v => [v.x, v.y]);
          if (entity.closed && coordinates.length > 0) {
            coordinates.push(coordinates[0]); // Close the polygon
            geometry = {
              type: 'Polygon',
              coordinates: [coordinates]
            };
          } else {
            geometry = {
              type: 'LineString',
              coordinates
            };
          }
          break;
        }

        case 'CIRCLE': {
          // Approximate circle with 32 segments
          const segments = 32;
          const coordinates = [];
          for (let i = 0; i <= segments; i++) {
            const angle = (i * 2 * Math.PI) / segments;
            const x = entity.center.x + entity.radius * Math.cos(angle);
            const y = entity.center.y + entity.radius * Math.sin(angle);
            coordinates.push([x, y]);
          }
          geometry = {
            type: 'Polygon',
            coordinates: [coordinates]
          };
          break;
        }

        case 'ARC': {
          // Approximate arc with segments
          const segments = 32;
          const startRad = (entity.startAngle * Math.PI) / 180;
          const endRad = (entity.endAngle * Math.PI) / 180;
          const coordinates = [];
          for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const angle = startRad + t * (endRad - startRad);
            const x = entity.center.x + entity.radius * Math.cos(angle);
            const y = entity.center.y + entity.radius * Math.sin(angle);
            coordinates.push([x, y]);
          }
          geometry = {
            type: 'LineString',
            coordinates
          };
          break;
        }

        case 'ELLIPSE': {
          // Approximate ellipse with segments
          const segments = 32;
          const coordinates = [];
          const startRad = (entity.startAngle * Math.PI) / 180;
          const endRad = (entity.endAngle * Math.PI) / 180;
          for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const angle = startRad + t * (endRad - startRad);
            const x = entity.center.x + entity.majorAxis.x * Math.cos(angle);
            const y = entity.center.y + entity.majorAxis.y * Math.sin(angle) * entity.minorAxisRatio;
            coordinates.push([x, y]);
          }
          geometry = {
            type: 'LineString',
            coordinates
          };
          break;
        }

        case '3DFACE': {
          geometry = {
            type: 'Polygon',
            coordinates: [[
              [entity.vertices[0].x, entity.vertices[0].y],
              [entity.vertices[1].x, entity.vertices[1].y],
              [entity.vertices[2].x, entity.vertices[2].y],
              [entity.vertices[3].x, entity.vertices[3].y],
              [entity.vertices[0].x, entity.vertices[0].y] // Close the polygon
            ]]
          };
          break;
        }

        case 'TEXT':
        case 'MTEXT': {
          geometry = {
            type: 'Point',
            coordinates: [entity.position.x, entity.position.y]
          };
          properties.text = entity.text;
          properties.height = entity.height;
          properties.rotation = entity.rotation;
          properties.width = entity.width;
          properties.style = entity.style;
          break;
        }

        case 'SPLINE': {
          // Simple linear approximation using control points
          // TODO: Implement proper spline interpolation
          const coordinates = entity.controlPoints.map(p => [p.x, p.y]);
          if (entity.closed && coordinates.length > 0) {
            coordinates.push(coordinates[0]); // Close the spline
            geometry = {
              type: 'Polygon',
              coordinates: [coordinates]
            };
          } else {
            geometry = {
              type: 'LineString',
              coordinates
            };
          }
          properties.degree = entity.degree;
          break;
        }

        default: {
          this.errorReporter.reportWarning('UNSUPPORTED_ENTITY', `Unsupported entity type: ${entity.type}`, {
            entity
          });
          return null;
        }
      }

      if (!geometry) {
        this.errorReporter.reportError('CONVERSION_ERROR', 'Failed to generate geometry', {
          entity
        });
        return null;
      }

      return {
        type: 'Feature',
        geometry,
        properties
      };
    } catch (error) {
      this.errorReporter.reportError('CONVERSION_ERROR', 'Failed to convert entity to GeoJSON', {
        error: error instanceof Error ? error.message : 'Unknown error',
        entity
      });
      return null;
    }
  }
}
