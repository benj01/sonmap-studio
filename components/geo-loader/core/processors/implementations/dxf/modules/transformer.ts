import { DxfEntity } from '../types';
import { coordinateSystemManager } from '../../../../coordinate-system-manager';

export class DxfTransformer {
  /**
   * Transform entity coordinates from source to target coordinate system
   */
  static async transformEntity(
    entity: DxfEntity, 
    sourceSystem: string, 
    targetSystem: string
  ): Promise<DxfEntity> {
    try {
      switch (entity.type) {
        case 'LWPOLYLINE':
          if (entity.data?.vertices) {
            const transformedVertices = await Promise.all(entity.data.vertices.map(async vertex => {
              const transformed = await coordinateSystemManager.transform(
                { x: vertex.x, y: vertex.y },
                sourceSystem,
                targetSystem
              );
              return { ...vertex, x: transformed.x, y: transformed.y };
            }));
            return {
              ...entity,
              data: { ...entity.data, vertices: transformedVertices }
            };
          }
          break;

        case 'LINE':
          if ('x' in entity.data && 'y' in entity.data && 'x2' in entity.data && 'y2' in entity.data) {
            const start = await coordinateSystemManager.transform(
              { x: entity.data.x, y: entity.data.y },
              sourceSystem,
              targetSystem
            );
            const end = await coordinateSystemManager.transform(
              { x: entity.data.x2, y: entity.data.y2 },
              sourceSystem,
              targetSystem
            );
            return {
              ...entity,
              data: { ...entity.data, x: start.x, y: start.y, x2: end.x, y2: end.y }
            };
          }
          break;

        case 'POINT':
        case 'CIRCLE':
        case 'ARC':
        case 'TEXT':
        case 'MTEXT':
          if ('x' in entity.data && 'y' in entity.data) {
            const transformed = await coordinateSystemManager.transform(
              { x: entity.data.x, y: entity.data.y },
              sourceSystem,
              targetSystem
            );
            return {
              ...entity,
              data: { ...entity.data, x: transformed.x, y: transformed.y }
            };
          }
          break;

        case 'SPLINE':
          if (Array.isArray(entity.data.controlPoints)) {
            const transformedPoints = await Promise.all(entity.data.controlPoints.map(async point => {
              const transformed = await coordinateSystemManager.transform(
                { x: point.x, y: point.y },
                sourceSystem,
                targetSystem
              );
              return { ...point, x: transformed.x, y: transformed.y };
            }));
            return {
              ...entity,
              data: { ...entity.data, controlPoints: transformedPoints }
            };
          }
          break;
      }

      return entity;
    } catch (error) {
      console.warn('[DEBUG] Failed to transform entity:', {
        type: entity.type,
        error: error instanceof Error ? error.message : String(error)
      });
      return entity;
    }
  }

  /**
   * Transform multiple entities
   */
  static async transformEntities(
    entities: DxfEntity[],
    sourceSystem: string,
    targetSystem: string
  ): Promise<DxfEntity[]> {
    console.log('[DEBUG] Transforming entities from', sourceSystem, 'to', targetSystem);
    
    const transformed = await Promise.all(
      entities.map(entity => this.transformEntity(entity, sourceSystem, targetSystem))
    );

    console.log('[DEBUG] Transformation complete:', {
      input: entities.length,
      output: transformed.length,
      types: Array.from(new Set(transformed.map(e => e.type)))
    });

    return transformed;
  }

  /**
   * Transform a single coordinate pair
   */
  static async transformCoordinate(
    coord: { x: number; y: number },
    sourceSystem: string,
    targetSystem: string
  ): Promise<{ x: number; y: number }> {
    return coordinateSystemManager.transform(coord, sourceSystem, targetSystem);
  }
}
