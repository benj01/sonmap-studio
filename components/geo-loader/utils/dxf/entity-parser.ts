import { DxfEntity, DxfEntityBase, Vector3, ParserResult, ParserContext } from './types';
import { validateEntity } from './validation';
import { createFeature } from '../geometry-utils';
import { GeoFeature } from '../../../../types/geo';

export class DxfEntityParser {
  parseEntity(rawEntity: any): DxfEntity | null {
    if (!rawEntity || typeof rawEntity !== 'object' || typeof rawEntity.type !== 'string') {
      console.warn('Invalid entity structure:', rawEntity);
      return null;
    }

    try {
      const entity = this.convertEntity(rawEntity);
      if (!entity && rawEntity?.type) {
        console.warn(`Failed to convert entity of type "${rawEntity.type}" with handle "${rawEntity.handle || 'unknown'}"`);
      }
      return entity;
    } catch (error: any) {
      console.error('Error parsing entity:', error?.message || error);
      return null;
    }
  }

  private extractCommonProperties(entity: any): Omit<DxfEntityBase, 'type'> {
    return {
      layer: entity.layer,
      handle: entity.handle,
      color: entity.color,
      colorRGB: entity.colorRGB,
      lineType: entity.lineType,
      lineWeight: entity.lineWeight,
      elevation: entity.elevation,
      thickness: entity.thickness,
      visible: entity.visible,
      extrusionDirection: entity.extrusionDirection
    };
  }

  private convertEntity(entity: any): DxfEntity | null {
    try {
      switch (entity.type) {
        case '3DFACE': {
          if (!Array.isArray(entity.vertices) || entity.vertices.length < 3) {
            console.warn(`3DFACE entity with handle "${entity.handle || 'unknown'}" has invalid vertices.`);
            return null;
          }
          return {
            ...this.extractCommonProperties(entity),
            type: '3DFACE',
            vertices: [
              entity.vertices[0] || { x: 0, y: 0, z: 0 },
              entity.vertices[1] || { x: 0, y: 0, z: 0 },
              entity.vertices[2] || { x: 0, y: 0, z: 0 },
              entity.vertices[3] || entity.vertices[2] || { x: 0, y: 0, z: 0 }
            ]
          };
        }

        case 'POINT': {
          if (!entity.position || typeof entity.position.x !== 'number' || typeof entity.position.y !== 'number') {
            console.warn(`POINT entity with handle "${entity.handle || 'unknown'}" has invalid position.`);
            return null;
          }
          return {
            ...this.extractCommonProperties(entity),
            type: 'POINT',
            position: entity.position
          };
        }

        case 'LINE': {
          if (!entity.start || !entity.end || typeof entity.start.x !== 'number' || typeof entity.end.x !== 'number') {
            console.warn(`LINE entity with handle "${entity.handle || 'unknown'}" has invalid start/end points.`);
            return null;
          }
          return {
            ...this.extractCommonProperties(entity),
            type: 'LINE',
            start: entity.start,
            end: entity.end
          };
        }

        case 'LWPOLYLINE':
        case 'POLYLINE': {
          if (!Array.isArray(entity.vertices)) {
            console.warn(`POLYLINE entity with handle "${entity.handle || 'unknown'}" is missing vertices array.`);
            return null;
          }
          return {
            ...this.extractCommonProperties(entity),
            type: entity.type,
            vertices: entity.vertices.map((v: any) => ({
              x: v.x ?? 0,
              y: v.y ?? 0,
              z: v.z ?? 0
            })),
            closed: entity.closed
          };
        }

        case 'CIRCLE': {
          if (!entity.center || typeof entity.radius !== 'number') {
            console.warn(`CIRCLE entity with handle "${entity.handle || 'unknown'}" missing center or radius.`);
            return null;
          }
          return {
            ...this.extractCommonProperties(entity),
            type: 'CIRCLE',
            center: entity.center,
            radius: entity.radius
          };
        }

        case 'ARC': {
          if (!entity.center || typeof entity.radius !== 'number' ||
              typeof entity.startAngle !== 'number' || typeof entity.endAngle !== 'number') {
            console.warn(`ARC entity with handle "${entity.handle || 'unknown'}" missing parameters.`);
            return null;
          }
          return {
            ...this.extractCommonProperties(entity),
            type: 'ARC',
            center: entity.center,
            radius: entity.radius,
            startAngle: entity.startAngle,
            endAngle: entity.endAngle
          };
        }

        case 'ELLIPSE': {
          if (!entity.center || !entity.majorAxis ||
              typeof entity.minorAxisRatio !== 'number' ||
              typeof entity.startAngle !== 'number' ||
              typeof entity.endAngle !== 'number') {
            console.warn(`ELLIPSE entity with handle "${entity.handle || 'unknown'}" missing parameters.`);
            return null;
          }
          return {
            ...this.extractCommonProperties(entity),
            type: 'ELLIPSE',
            center: entity.center,
            majorAxis: entity.majorAxis,
            minorAxisRatio: entity.minorAxisRatio,
            startAngle: entity.startAngle,
            endAngle: entity.endAngle
          };
        }

        default:
          console.warn(`Unsupported entity type "${entity.type}" with handle "${entity.handle || 'unknown'}".`);
          return null;
      }
    } catch (error: any) {
      console.warn(`Error converting entity type "${entity.type}" handle "${entity.handle || 'unknown'}":`, error?.message || error);
      return null;
    }
  }

  entityToGeoFeature(entity: DxfEntity, layerInfo?: Record<string, any>): GeoFeature | null {
    const errors = validateEntity(entity);
    if (errors.length > 0) {
      console.warn(`Entity validation failed:`, errors);
      return null;
    }

    const properties = {
      id: entity.handle,
      type: entity.type,
      layer: entity.layer || '0',
      color: entity.color ?? layerInfo?.color,
      colorRGB: entity.colorRGB ?? layerInfo?.colorRGB,
      lineType: entity.lineType ?? layerInfo?.lineType,
      lineWeight: entity.lineWeight ?? layerInfo?.lineWeight,
      elevation: entity.elevation,
      thickness: entity.thickness,
      visible: entity.visible ?? layerInfo?.visible,
      extrusionDirection: entity.extrusionDirection
    };

    return createFeature(entity, properties);
  }
}

export const createEntityParser = () => new DxfEntityParser();
