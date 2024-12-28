import { DxfEntity, DxfEntityType, Vector3 } from '../../types';
import { isValidPoint } from '../utils/point-utils';

export class EntityConverter {
  /**
   * Convert raw dxf-parser entities to our format
   */
  public convertEntities(entities: any[]): DxfEntity[] {
    const converted = entities
      .map(entity => this.convertEntity(entity))
      .filter((e): e is DxfEntity => e !== null);

    return converted;
  }

  private convertEntity(entity: any): DxfEntity | null {
    if (!entity?.type) return null;

    try {
      const baseEntity: DxfEntity = {
        type: entity.type as DxfEntityType,
        attributes: this.extractAttributes(entity),
        data: {}
      };

      if (entity.type === 'LWPOLYLINE') {
        return this.convertLwpolyline(entity, baseEntity);
      }

      baseEntity.data = this.convertEntityData(entity);
      return baseEntity;
    } catch (error) {
      console.warn('Failed to convert entity:', error);
      return null;
    }
  }

  private extractAttributes(entity: any) {
    return {
      layer: typeof entity.layer === 'string' ? entity.layer : '0',
      lineType: typeof entity.lineType === 'string' ? entity.lineType : undefined,
      color: typeof entity.color === 'number' ? entity.color : undefined,
      lineWeight: typeof entity.lineWeight === 'number' ? entity.lineWeight : undefined,
      handle: typeof entity.handle === 'string' ? entity.handle : undefined
    };
  }

  private convertLwpolyline(entity: any, baseEntity: DxfEntity): DxfEntity | null {
    const vertices = this.extractLwpolylineVertices(entity);
    if (vertices.length < 2) return null;

    return {
      ...baseEntity,
      data: {
        vertices,
        closed: !!entity.closed
      }
    };
  }

  private extractLwpolylineVertices(entity: any): Vector3[] {
    // First try vertices array
    if (Array.isArray(entity.vertices)) {
      return entity.vertices.map(v => ({
        x: typeof v.x === 'number' ? v.x : 0,
        y: typeof v.y === 'number' ? v.y : 0,
        z: typeof v.z === 'number' ? v.z : 0
      }));
    }

    // Fall back to raw DXF data
    const vertexGroups = new Map<number, { x?: number; y?: number; z?: number }>();
    
    Object.entries(entity)
      .map(([key, value]) => ({ key: parseInt(key), value }))
      .filter(({ key, value }) => !isNaN(key) && typeof value === 'number')
      .sort((a, b) => a.key - b.key)
      .forEach(({ key, value }) => {
        const baseCode = key % 10;
        const vertexIndex = Math.floor(key / 10) - 1;
        
        if (vertexIndex < 0) return;
        
        if (!vertexGroups.has(vertexIndex)) {
          vertexGroups.set(vertexIndex, {});
        }
        
        const vertex = vertexGroups.get(vertexIndex)!;
        switch (baseCode) {
          case 0: vertex.x = value; break;
          case 1: vertex.y = value; break;
          case 2: vertex.z = value; break;
        }
      });

    return Array.from(vertexGroups.entries())
      .sort(([a], [b]) => a - b)
      .map(([_, v]) => ({
        x: v.x ?? 0,
        y: v.y ?? 0,
        z: v.z ?? 0
      }))
      .filter(v => typeof v.x === 'number' && typeof v.y === 'number');
  }

  private convertEntityData(entity: any): Record<string, unknown> {
    const data: Record<string, unknown> = {};

    switch (entity.type.toUpperCase()) {
      case 'LINE':
        if (isValidPoint(entity.start) && isValidPoint(entity.end)) {
          Object.assign(data, {
            x: entity.start.x,
            y: entity.start.y,
            z: entity.start.z,
            x2: entity.end.x,
            y2: entity.end.y,
            z2: entity.end.z
          });
        }
        break;

      case 'POINT':
        if (isValidPoint(entity.position)) {
          Object.assign(data, {
            x: entity.position.x,
            y: entity.position.y,
            z: entity.position.z
          });
        }
        break;

      case 'CIRCLE':
        if (isValidPoint(entity.center) && typeof entity.radius === 'number') {
          Object.assign(data, {
            x: entity.center.x,
            y: entity.center.y,
            z: entity.center.z,
            radius: entity.radius
          });
        }
        break;

      case 'ARC':
        if (isValidPoint(entity.center) && 
            typeof entity.radius === 'number' &&
            typeof entity.startAngle === 'number' &&
            typeof entity.endAngle === 'number') {
          Object.assign(data, {
            x: entity.center.x,
            y: entity.center.y,
            z: entity.center.z,
            radius: entity.radius,
            startAngle: entity.startAngle,
            endAngle: entity.endAngle
          });
        }
        break;

      case 'ELLIPSE':
        if (isValidPoint(entity.center) && 
            isValidPoint(entity.majorAxis) &&
            typeof entity.ratio === 'number') {
          Object.assign(data, {
            x: entity.center.x,
            y: entity.center.y,
            z: entity.center.z,
            majorAxis: {
              x: entity.majorAxis.x,
              y: entity.majorAxis.y,
              z: entity.majorAxis.z
            },
            ratio: entity.ratio,
            startAngle: typeof entity.startAngle === 'number' ? entity.startAngle : 0,
            endAngle: typeof entity.endAngle === 'number' ? entity.endAngle : Math.PI * 2
          });
        }
        break;

      case 'SPLINE':
        if (Array.isArray(entity.controlPoints) && entity.controlPoints.length >= 2) {
          const validPoints = entity.controlPoints
            .filter((p: any) => isValidPoint(p))
            .map((p: any) => ({
              x: p.x,
              y: p.y,
              z: p.z
            }));

          if (validPoints.length >= 2) {
            Object.assign(data, {
              controlPoints: validPoints,
              degree: typeof entity.degree === 'number' ? entity.degree : 3,
              knots: Array.isArray(entity.knots) ? entity.knots : undefined,
              weights: Array.isArray(entity.weights) ? entity.weights : undefined,
              closed: !!entity.closed
            });
          }
        }
        break;

      case 'TEXT':
      case 'MTEXT':
        if (isValidPoint(entity.position) && typeof entity.text === 'string') {
          Object.assign(data, {
            x: entity.position.x,
            y: entity.position.y,
            z: entity.position.z,
            text: entity.text,
            height: typeof entity.height === 'number' ? entity.height : 1,
            rotation: typeof entity.rotation === 'number' ? entity.rotation : 0,
            width: typeof entity.width === 'number' ? entity.width : undefined
          });
        }
        break;
    }

    return data;
  }
}
