import { Feature, Polygon } from 'geojson';
import { DxfEntity, Vector3 } from '../../types';
import { ValidationError } from '../../../../../errors/types';

/**
 * Handles conversion of SOLID entities to GeoJSON features
 * A SOLID is a filled polygon defined by 3 or 4 vertices
 */
export class SolidConverter {
  /**
   * Convert SOLID entity to GeoJSON feature
   */
  static convert(entity: DxfEntity): Feature {
    const vertices = this.extractVertices(entity);
    this.validateVertices(vertices);

    // Create polygon geometry
    const geometry: Polygon = {
      type: 'Polygon',
      coordinates: [this.createRing(vertices)]
    };

    return {
      type: 'Feature',
      geometry,
      properties: {
        entityType: 'SOLID',
        vertexCount: vertices.length
      }
    };
  }

  /**
   * Extract vertices from entity
   */
  private static extractVertices(entity: DxfEntity): Vector3[] {
    const data = entity.data;
    const vertices: Vector3[] = [];

    // First vertex
    vertices.push({
      x: typeof data.x === 'number' ? data.x : 0,
      y: typeof data.y === 'number' ? data.y : 0,
      z: typeof data.z === 'number' ? data.z : 0
    });

    // Second vertex
    vertices.push({
      x: typeof data.x2 === 'number' ? data.x2 : 0,
      y: typeof data.y2 === 'number' ? data.y2 : 0,
      z: typeof data.z2 === 'number' ? data.z2 : 0
    });

    // Third vertex
    vertices.push({
      x: typeof data.x3 === 'number' ? data.x3 : 0,
      y: typeof data.y3 === 'number' ? data.y3 : 0,
      z: typeof data.z3 === 'number' ? data.z3 : 0
    });

    // Fourth vertex (optional)
    if (
      typeof data.x4 === 'number' ||
      typeof data.y4 === 'number' ||
      typeof data.z4 === 'number'
    ) {
      vertices.push({
        x: typeof data.x4 === 'number' ? data.x4 : 0,
        y: typeof data.y4 === 'number' ? data.y4 : 0,
        z: typeof data.z4 === 'number' ? data.z4 : 0
      });
    }

    return vertices;
  }

  /**
   * Validate vertices
   */
  private static validateVertices(vertices: Vector3[]): void {
    // Check vertex count
    if (vertices.length < 3 || vertices.length > 4) {
      throw new ValidationError(
        'SOLID must have 3 or 4 vertices',
        'INVALID_VERTEX_COUNT',
        undefined,
        { vertexCount: vertices.length }
      );
    }

    // Validate each vertex
    vertices.forEach((vertex, index) => {
      if (!this.isValidPoint(vertex)) {
        throw new ValidationError(
          `Invalid vertex ${index + 1}`,
          'INVALID_VERTEX',
          undefined,
          { vertex, index }
        );
      }
    });

    // Check for degenerate cases
    if (this.isDegenerate(vertices)) {
      throw new ValidationError(
        'Degenerate SOLID (zero area)',
        'DEGENERATE_SOLID'
      );
    }
  }

  /**
   * Create polygon ring from vertices
   */
  private static createRing(vertices: Vector3[]): number[][] {
    const coordinates: number[][] = vertices.map(v => [v.x, v.y, v.z ?? 0]);

    // For triangular solids, duplicate the last vertex
    if (vertices.length === 3) {
      coordinates.push(coordinates[2]);
    }

    // Close the ring by adding the first vertex again
    coordinates.push(coordinates[0]);

    return coordinates;
  }

  /**
   * Check if point coordinates are valid numbers
   */
  private static isValidPoint(point: Vector3): boolean {
    return (
      typeof point.x === 'number' &&
      typeof point.y === 'number' &&
      isFinite(point.x) &&
      isFinite(point.y) &&
      (point.z === undefined || (typeof point.z === 'number' && isFinite(point.z)))
    );
  }

  /**
   * Check if solid is degenerate (has zero area)
   */
  private static isDegenerate(vertices: Vector3[]): boolean {
    // Calculate area using shoelace formula
    let area = 0;
    for (let i = 0; i < vertices.length; i++) {
      const j = (i + 1) % vertices.length;
      area += vertices[i].x * vertices[j].y;
      area -= vertices[j].x * vertices[i].y;
    }
    area = Math.abs(area) / 2;

    // Consider solid degenerate if area is very small
    return area < 1e-10;
  }
}
