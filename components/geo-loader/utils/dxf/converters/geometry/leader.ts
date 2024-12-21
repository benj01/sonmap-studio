import { Geometry, GeometryCollection } from 'geojson';
import { BaseGeometryConverter } from './base';
import { ErrorReporter } from '../../../errors';
import { createLineStringGeometry, createPolygonGeometry } from '../../../geometry-utils';
import {
  DxfEntityBase,
  LeaderEntity,
  MLeaderEntity,
  isLeaderEntity,
  isMLeaderEntity,
  Point3D,
  LeaderVertex
} from './types';

/**
 * Converter for LEADER and MLEADER entities
 */
export class LeaderGeometryConverter extends BaseGeometryConverter {
  private static readonly ARROW_SIZE = 2.5;
  private static readonly LANDING_GAP = 1.0;
  private static readonly DOGLEG_LENGTH = 2.0;

  canHandle(entityType: string): boolean {
    return entityType === 'LEADER' || entityType === 'MLEADER';
  }

  convert(entity: DxfEntityBase, errorReporter: ErrorReporter): Geometry | null {
    if (isLeaderEntity(entity)) {
      return this.convertLeader(entity, errorReporter);
    }
    if (isMLeaderEntity(entity)) {
      return this.convertMLeader(entity, errorReporter);
    }
    return null;
  }

  private convertLeader(
    entity: LeaderEntity,
    errorReporter: ErrorReporter
  ): Geometry | null {
    const entityInfo = this.entityInfo(entity);

    // Validate vertices
    for (let i = 0; i < entity.vertices.length; i++) {
      if (!this.validateCoordinates(entity.vertices[i], errorReporter, entityInfo, `vertex ${i + 1}`)) {
        return null;
      }
    }

    // Validate annotation if present
    if (entity.annotation) {
      if (!this.validateCoordinates(entity.annotation.position, errorReporter, entityInfo, 'annotation position')) {
        return null;
      }
      if (!this.validateNumber(entity.annotation.height || 1.0, errorReporter, entityInfo, 'text height')) {
        return null;
      }
    }

    const geometries: Geometry[] = [];

    // Convert leader line
    const leaderPoints = entity.vertices.map(vertex => [vertex.x, vertex.y] as [number, number]);
    geometries.push(createLineStringGeometry(leaderPoints));

    // Add arrowhead at first vertex
    if (entity.arrowhead) {
      const arrowSize = entity.arrowhead.size || LeaderGeometryConverter.ARROW_SIZE;
      this.addArrowhead(
        geometries,
        entity.vertices[0],
        this.calculateArrowDirection(entity.vertices[0], entity.vertices[1]),
        arrowSize
      );
    }

    // Return as GeometryCollection if we have multiple geometries
    if (geometries.length > 1) {
      return {
        type: 'GeometryCollection',
        geometries
      };
    }

    // Return single geometry if we only have one
    if (geometries.length === 1) {
      return geometries[0];
    }

    return null;
  }

  private convertMLeader(
    entity: MLeaderEntity,
    errorReporter: ErrorReporter
  ): Geometry | null {
    const entityInfo = this.entityInfo(entity);
    const geometries: Geometry[] = [];

    // Process each leader
    for (const leader of entity.leaders) {
      // Validate vertices
      for (let i = 0; i < leader.vertices.length; i++) {
        if (!this.validateCoordinates(leader.vertices[i], errorReporter, entityInfo, `leader ${entity.leaders.indexOf(leader) + 1} vertex ${i + 1}`)) {
          continue;  // Skip this leader but continue with others
        }
      }

      // Validate annotation if present
      if (leader.annotation) {
        if (!this.validateCoordinates(leader.annotation.position, errorReporter, entityInfo, `leader ${entity.leaders.indexOf(leader) + 1} annotation position`)) {
          continue;
        }
        if (!this.validateNumber(leader.annotation.height || entity.style?.textHeight || 1.0, errorReporter, entityInfo, 'text height')) {
          continue;
        }
      }

      // Convert leader line
      const leaderPoints = leader.vertices.map(vertex => [vertex.x, vertex.y] as [number, number]);
      geometries.push(createLineStringGeometry(leaderPoints));

      // Add arrowhead
      if (leader.arrowhead) {
        const arrowSize = leader.arrowhead.size || entity.style?.arrowSize || LeaderGeometryConverter.ARROW_SIZE;
        this.addArrowhead(
          geometries,
          leader.vertices[0],
          this.calculateArrowDirection(leader.vertices[0], leader.vertices[1]),
          arrowSize
        );
      }

      // Add landing line if needed
      if (leader.annotation && entity.style?.landingGap) {
        this.addLandingLine(
          geometries,
          leader.vertices[leader.vertices.length - 1],
          leader.annotation.position,
          entity.style.landingGap,
          entity.style.doglegLength || LeaderGeometryConverter.DOGLEG_LENGTH
        );
      }
    }

    // Return as GeometryCollection if we have multiple geometries
    if (geometries.length > 1) {
      return {
        type: 'GeometryCollection',
        geometries
      };
    }

    // Return single geometry if we only have one
    if (geometries.length === 1) {
      return geometries[0];
    }

    return null;
  }

  private calculateArrowDirection(start: Point3D, end: Point3D): number {
    return Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI;
  }

  private addArrowhead(
    geometries: Geometry[],
    point: Point3D,
    angle: number,
    size: number
  ): void {
    const rad = (angle * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    // Create arrowhead as a small triangle
    const arrowPoints: [number, number][] = [
      [point.x, point.y],
      [point.x - size * cos - size * sin, point.y - size * sin + size * cos],
      [point.x - size * cos + size * sin, point.y - size * sin - size * cos],
      [point.x, point.y]  // Close the polygon
    ];

    geometries.push(createPolygonGeometry([arrowPoints]));
  }

  private addLandingLine(
    geometries: Geometry[],
    start: Point3D,
    end: Point3D,
    gap: number,
    doglegLength: number
  ): void {
    // Calculate landing line points with dogleg
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist < gap) return;  // Skip if too close

    const dirX = dx / dist;
    const dirY = dy / dist;

    const landingPoints: [number, number][] = [
      [start.x, start.y],
      [start.x + dirX * (dist - gap), start.y + dirY * (dist - gap)],
      [end.x, end.y]
    ];

    geometries.push(createLineStringGeometry(landingPoints));
  }
}
