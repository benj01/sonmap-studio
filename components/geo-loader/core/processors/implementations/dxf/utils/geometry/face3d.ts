import { Feature, Polygon } from 'geojson';
import { DxfEntity, Vector3 } from '../../types';
import { ValidationError } from '../../../../../errors/types';

/**
 * Handles conversion of 3DFACE entities to GeoJSON features
 * A 3DFACE is a surface defined by 3 or 4 vertices in 3D space
 */
export class Face3DConverter {
  /**
   * Convert 3DFACE entity to GeoJSON feature
   */
  static convert(entity: DxfEntity): Feature {
    const vertices = this.extractVertices(entity);
    this.validateVertices(vertices);

    // Create polygon geometry
    // Note: We project the 3D face onto the XY plane for GeoJSON representation
    // The original Z coordinates are preserved in properties for reference
    const geometry: Polygon = {
      type: 'Polygon',
      coordinates: [this.createRing(vertices)]
    };

    return {
      type: 'Feature',
      geometry,
      properties: {
        entityType: '3DFACE',
        vertexCount: vertices.length,
        vertices: vertices.map(v => [v.x, v.y, v.z ?? 0]),
        isPlanar: this.isPlanar(vertices),
        normal: this.calculateNormal(vertices)
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
        '3DFACE must have 3 or 4 vertices',
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
        'Degenerate 3DFACE (zero area)',
        'DEGENERATE_FACE'
      );
    }
  }

  /**
   * Create polygon ring from vertices
   */
  private static createRing(vertices: Vector3[]): number[][] {
    const coordinates: number[][] = vertices.map(v => [v.x, v.y, v.z ?? 0]);

    // For triangular faces, duplicate the last vertex
    if (vertices.length === 3) {
      coordinates.push(coordinates[2]);
    }

    // Close the ring by adding the first vertex again
    coordinates.push(coordinates[0]);

    return coordinates;
  }

  /**
   * Calculate normal vector of the face
   */
  private static calculateNormal(vertices: Vector3[]): [number, number, number] {
    // Get vectors along two edges
    const v1: Vector3 = {
      x: vertices[1].x - vertices[0].x,
      y: vertices[1].y - vertices[0].y,
      z: (vertices[1].z ?? 0) - (vertices[0].z ?? 0)
    };

    const v2: Vector3 = {
      x: vertices[2].x - vertices[0].x,
      y: vertices[2].y - vertices[0].y,
      z: (vertices[2].z ?? 0) - (vertices[0].z ?? 0)
    };

    // Calculate cross product
    const normal: [number, number, number] = [
      v1.y * v2.z! - v1.z! * v2.y,
      v1.z! * v2.x - v1.x * v2.z!,
      v1.x * v2.y - v1.y * v2.x
    ];

    // Normalize
    const length = Math.sqrt(
      normal[0] * normal[0] +
      normal[1] * normal[1] +
      normal[2] * normal[2]
    );

    if (length > 0) {
      normal[0] /= length;
      normal[1] /= length;
      normal[2] /= length;
    }

    return normal;
  }

  /**
   * Check if face is planar
   */
  private static isPlanar(vertices: Vector3[]): boolean {
    if (vertices.length === 3) return true;

    // For 4 vertices, check if the fourth point lies on the plane
    // defined by the first three points
    const normal = this.calculateNormal(vertices);
    const point = vertices[0];
    const d = -(
      normal[0] * point.x +
      normal[1] * point.y +
      normal[2] * (point.z ?? 0)
    );

    // Check if fourth point satisfies plane equation
    const fourth = vertices[3];
    const distance = Math.abs(
      normal[0] * fourth.x +
      normal[1] * fourth.y +
      normal[2] * (fourth.z ?? 0) +
      d
    );

    // Consider face planar if distance is very small
    return distance < 1e-6;
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
   * Check if face is degenerate (has zero area when projected onto XY plane)
   */
  private static isDegenerate(vertices: Vector3[]): boolean {
    // Calculate area using shoelace formula in XY projection
    let area = 0;
    for (let i = 0; i < vertices.length; i++) {
      const j = (i + 1) % vertices.length;
      area += vertices[i].x * vertices[j].y;
      area -= vertices[j].x * vertices[i].y;
    }
    area = Math.abs(area) / 2;

    // Consider face degenerate if projected area is very small
    return area < 1e-10;
  }
}
