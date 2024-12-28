import { DxfEntity } from '../types';
import { coordinateSystemManager } from '../../../../coordinate-system-manager';

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

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
              if (typeof vertex.x !== 'number' || typeof vertex.y !== 'number') {
                console.warn('[DEBUG] Invalid vertex coordinates:', vertex);
                return vertex;
              }
              const transformed = await coordinateSystemManager.transform(
                { x: vertex.x, y: vertex.y },
                sourceSystem,
                targetSystem
              );
              // Validate transformed coordinates
              if (!isFinite(transformed.x) || !isFinite(transformed.y)) {
                console.warn('[DEBUG] Invalid transformed coordinates:', { original: vertex, transformed });
                return vertex;
              }
              return { ...vertex, x: transformed.x, y: transformed.y };
            }));
            return {
              ...entity,
              data: { ...entity.data, vertices: transformedVertices }
            };
          }
          break;

        case 'LINE':
          if (typeof entity.data?.x === 'number' && 
              typeof entity.data?.y === 'number' && 
              typeof entity.data?.x2 === 'number' && 
              typeof entity.data?.y2 === 'number') {
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
            // Validate transformed coordinates
            if (!isFinite(start.x) || !isFinite(start.y) || !isFinite(end.x) || !isFinite(end.y)) {
              console.warn('[DEBUG] Invalid transformed coordinates:', { original: entity.data, start, end });
              return entity;
            }
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
          if (typeof entity.data?.x === 'number' && typeof entity.data?.y === 'number') {
            const transformed = await coordinateSystemManager.transform(
              { x: entity.data.x, y: entity.data.y },
              sourceSystem,
              targetSystem
            );
            // Validate transformed coordinates
            if (!isFinite(transformed.x) || !isFinite(transformed.y)) {
              console.warn('[DEBUG] Invalid transformed coordinates:', { original: entity.data, transformed });
              return entity;
            }
            return {
              ...entity,
              data: { ...entity.data, x: transformed.x, y: transformed.y }
            };
          }
          break;

        case 'SPLINE':
          if (Array.isArray(entity.data?.controlPoints)) {
            const transformedPoints = await Promise.all(entity.data.controlPoints.map(async point => {
              if (typeof point.x !== 'number' || typeof point.y !== 'number') {
                console.warn('[DEBUG] Invalid control point coordinates:', point);
                return point;
              }
              const transformed = await coordinateSystemManager.transform(
                { x: point.x, y: point.y },
                sourceSystem,
                targetSystem
              );
              // Validate transformed coordinates
              if (!isFinite(transformed.x) || !isFinite(transformed.y)) {
                console.warn('[DEBUG] Invalid transformed coordinates:', { original: point, transformed });
                return point;
              }
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
        error: error instanceof Error ? error.message : String(error),
        data: entity.data
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
   * Transform bounds from source to target coordinate system
   */
  static async transformBounds(
    bounds: Bounds,
    sourceSystem: string,
    targetSystem: string
  ): Promise<Bounds> {
    try {
      // Transform min point
      const minPoint = await coordinateSystemManager.transform(
        { x: bounds.minX, y: bounds.minY },
        sourceSystem,
        targetSystem
      );
      
      // Transform max point
      const maxPoint = await coordinateSystemManager.transform(
        { x: bounds.maxX, y: bounds.maxY },
        sourceSystem,
        targetSystem
      );

      // Validate transformed coordinates
      if (!isFinite(minPoint.x) || !isFinite(minPoint.y) || 
          !isFinite(maxPoint.x) || !isFinite(maxPoint.y)) {
        console.warn('[DEBUG] Invalid transformed bounds:', {
          original: bounds,
          transformed: { minPoint, maxPoint }
        });
        return bounds;
      }

      // Create new bounds with transformed coordinates
      const transformedBounds = {
        minX: minPoint.x,
        minY: minPoint.y,
        maxX: maxPoint.x,
        maxY: maxPoint.y
      };

      console.log('[DEBUG] Transformed bounds:', {
        from: bounds,
        to: transformedBounds,
        sourceSystem,
        targetSystem
      });

      return transformedBounds;
    } catch (error) {
      console.warn('[DEBUG] Failed to transform bounds:', {
        error: error instanceof Error ? error.message : String(error),
        bounds,
        sourceSystem,
        targetSystem
      });
      return bounds;
    }
  }

  /**
   * Transform a single coordinate pair
   */
  static async transformCoordinate(
    coord: { x: number; y: number },
    sourceSystem: string,
    targetSystem: string
  ): Promise<{ x: number; y: number }> {
    const transformed = await coordinateSystemManager.transform(coord, sourceSystem, targetSystem);
    
    // Validate transformed coordinates
    if (!isFinite(transformed.x) || !isFinite(transformed.y)) {
      console.warn('[DEBUG] Invalid transformed coordinate:', { original: coord, transformed });
      return coord;
    }
    
    return transformed;
  }
}
