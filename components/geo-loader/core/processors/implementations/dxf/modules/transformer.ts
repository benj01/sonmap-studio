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
            console.debug('[DEBUG] Starting LWPOLYLINE transformation:', {
              entityType: entity.type,
              vertexCount: entity.data.vertices.length,
              originalVertices: entity.data.vertices.map(v => ({ x: v.x, y: v.y })),
              sourceSystem,
              targetSystem,
              layer: entity.attributes?.layer,
              bounds: {
                minX: Math.min(...entity.data.vertices.map(v => v.x)),
                minY: Math.min(...entity.data.vertices.map(v => v.y)),
                maxX: Math.max(...entity.data.vertices.map(v => v.x)),
                maxY: Math.max(...entity.data.vertices.map(v => v.y))
              }
            });

            const transformedVertices = [];
            let hasValidTransformation = false;

            for (let i = 0; i < entity.data.vertices.length; i++) {
              const vertex = entity.data.vertices[i];
              
              // Validate input coordinates
              if (typeof vertex.x !== 'number' || typeof vertex.y !== 'number' ||
                  !isFinite(vertex.x) || !isFinite(vertex.y)) {
                console.warn('[DEBUG] Invalid input vertex coordinates:', {
                  index: i,
                  vertex,
                  entityType: entity.type,
                  layer: entity.attributes?.layer
                });
                transformedVertices.push(vertex);
                continue;
              }

              try {
                const transformed = await coordinateSystemManager.transform(
                  { x: vertex.x, y: vertex.y },
                  sourceSystem,
                  targetSystem
                );

                // Validate transformed coordinates with tolerance
                const isValid = typeof transformed.x === 'number' && 
                              typeof transformed.y === 'number' &&
                              isFinite(transformed.x) && 
                              isFinite(transformed.y);

                if (isValid) {
                  hasValidTransformation = true;
                  transformedVertices.push({ ...vertex, x: transformed.x, y: transformed.y });
                  
                  console.debug(`[DEBUG] Vertex ${i} transformed successfully:`, {
                    original: { x: vertex.x, y: vertex.y },
                    transformed: { x: transformed.x, y: transformed.y },
                    layer: entity.attributes?.layer
                  });
                } else {
                  console.warn(`[DEBUG] Invalid transformation result for vertex ${i}:`, {
                    original: { x: vertex.x, y: vertex.y },
                    transformed,
                    layer: entity.attributes?.layer
                  });
                  transformedVertices.push(vertex);
                }
              } catch (error) {
                console.warn(`[DEBUG] Transformation error for vertex ${i}:`, {
                  error: error instanceof Error ? error.message : String(error),
                  vertex,
                  layer: entity.attributes?.layer
                });
                transformedVertices.push(vertex);
              }
            }

            // Only update entity if at least one vertex was transformed successfully
            if (!hasValidTransformation) {
              console.warn('[DEBUG] No valid transformations for LWPOLYLINE:', {
                vertexCount: entity.data.vertices.length,
                layer: entity.attributes?.layer,
                sourceSystem,
                targetSystem
              });
              return entity;
            }
            console.debug('[DEBUG] LWPOLYLINE transformation complete:', {
              entityType: entity.type,
              layer: entity.attributes?.layer,
              originalCount: entity.data.vertices.length,
              transformedCount: transformedVertices.length,
              originalVertices: entity.data.vertices.map(v => ({ x: v.x, y: v.y })),
              transformedVertices: transformedVertices.map(v => ({ x: v.x, y: v.y })),
              sourceSystem,
              targetSystem,
              bounds: {
                original: {
                  minX: Math.min(...entity.data.vertices.map(v => v.x)),
                  minY: Math.min(...entity.data.vertices.map(v => v.y)),
                  maxX: Math.max(...entity.data.vertices.map(v => v.x)),
                  maxY: Math.max(...entity.data.vertices.map(v => v.y))
                },
                transformed: {
                  minX: Math.min(...transformedVertices.map(v => v.x)),
                  minY: Math.min(...transformedVertices.map(v => v.y)),
                  maxX: Math.max(...transformedVertices.map(v => v.x)),
                  maxY: Math.max(...transformedVertices.map(v => v.y))
                }
              }
            });

            return {
              ...entity,
              data: { 
                ...entity.data, 
                vertices: transformedVertices,
                transformed: true // Mark as transformed for downstream processing
              }
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
    console.debug('[DEBUG] Starting batch transformation:', {
      entityCount: entities.length,
      entityTypes: Array.from(new Set(entities.map(e => e.type))),
      sourceSystem,
      targetSystem
    });
    
    const transformed = await Promise.all(
      entities.map(entity => this.transformEntity(entity, sourceSystem, targetSystem))
    );

    console.debug('[DEBUG] Batch transformation complete:', {
      input: entities.length,
      output: transformed.length,
      types: Array.from(new Set(transformed.map(e => e.type))),
      transformedTypes: transformed.map(e => ({
        type: e.type,
        hasVertices: 'vertices' in e.data,
        vertexCount: Array.isArray(e.data.vertices) ? e.data.vertices.length : 0
      }))
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
