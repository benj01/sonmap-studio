import { 
  DxfEntity, 
  DxfEntityBase,
  Vector3,
  isVector2,
  isVector3,
  isDxfPointEntity,
  isDxfLineEntity,
  isDxfPolylineEntity,
  isDxfCircleEntity,
  isDxfArcEntity,
  isDxfEllipseEntity
} from './types';

export class DxfValidator {
  static validateEntityBase(entity: unknown): entity is DxfEntityBase {
    if (!entity || typeof entity !== 'object') {
      return false;
    }

    const e = entity as any;
    
    // Required properties
    if (typeof e.type !== 'string') {
      return false;
    }

    // Optional properties with type checking
    if (e.layer !== undefined && typeof e.layer !== 'string') return false;
    if (e.handle !== undefined && typeof e.handle !== 'string') return false;
    if (e.color !== undefined && typeof e.color !== 'number') return false;
    if (e.colorRGB !== undefined && typeof e.colorRGB !== 'number') return false;
    if (e.lineType !== undefined && typeof e.lineType !== 'string') return false;
    if (e.lineWeight !== undefined && typeof e.lineWeight !== 'number') return false;
    if (e.elevation !== undefined && typeof e.elevation !== 'number') return false;
    if (e.thickness !== undefined && typeof e.thickness !== 'number') return false;
    if (e.visible !== undefined && typeof e.visible !== 'boolean') return false;
    if (e.extrusionDirection !== undefined && !isVector3(e.extrusionDirection)) return false;

    return true;
  }

  static validateEntity(entity: unknown): entity is DxfEntity {
    if (!this.validateEntityBase(entity)) {
      return false;
    }

    switch (entity.type) {
      case 'POINT':
        return isDxfPointEntity(entity);
      case 'LINE':
        return isDxfLineEntity(entity);
      case 'POLYLINE':
      case 'LWPOLYLINE':
        return isDxfPolylineEntity(entity);
      case 'CIRCLE':
        return isDxfCircleEntity(entity);
      case 'ARC':
        return isDxfArcEntity(entity);
      case 'ELLIPSE':
        return isDxfEllipseEntity(entity);
      default:
        return false;
    }
  }

  static validateCoordinates(coordinates: unknown): coordinates is [number, number] {
    return Array.isArray(coordinates) && 
           coordinates.length === 2 && 
           typeof coordinates[0] === 'number' && 
           typeof coordinates[1] === 'number' &&
           isFinite(coordinates[0]) && 
           isFinite(coordinates[1]);
  }

  static validateVector(vector: unknown): vector is Vector3 {
    return isVector3(vector);
  }

  static validateNumericValue(value: unknown): value is number {
    return typeof value === 'number' && isFinite(value);
  }

  static validateAngle(angle: unknown): angle is number {
    return this.validateNumericValue(angle) && angle as number >= 0 && angle as number <= 360;
  }

  static validateRadius(radius: unknown): radius is number {
    return this.validateNumericValue(radius) && radius as number > 0;
  }

  static validateVertices(vertices: unknown): vertices is Vector3[] {
    return Array.isArray(vertices) && 
           vertices.length >= 2 && 
           vertices.every(v => isVector3(v));
  }

  static getEntityValidationError(entity: unknown): string | null {
    if (!entity || typeof entity !== 'object') {
      return 'Invalid entity: must be an object';
    }

    const e = entity as any;

    if (!e.type) {
      return 'Entity missing required type property';
    }

    switch (e.type) {
      case 'POINT':
        if (!e.position) return 'POINT entity missing position';
        if (!isVector3(e.position)) return 'POINT entity has invalid position';
        break;

      case 'LINE':
        if (!e.start) return 'LINE entity missing start point';
        if (!e.end) return 'LINE entity missing end point';
        if (!isVector3(e.start)) return 'LINE entity has invalid start point';
        if (!isVector3(e.end)) return 'LINE entity has invalid end point';
        break;

      case 'POLYLINE':
      case 'LWPOLYLINE':
        if (!Array.isArray(e.vertices)) return `${e.type} entity missing vertices array`;
        if (e.vertices.length < 2) return `${e.type} entity has insufficient vertices`;
        if (!e.vertices.every(isVector3)) return `${e.type} entity has invalid vertices`;
        break;

      case 'CIRCLE':
        if (!e.center) return 'CIRCLE entity missing center';
        if (!isVector3(e.center)) return 'CIRCLE entity has invalid center';
        if (!this.validateRadius(e.radius)) return 'CIRCLE entity has invalid radius';
        break;

      case 'ARC':
        if (!e.center) return 'ARC entity missing center';
        if (!isVector3(e.center)) return 'ARC entity has invalid center';
        if (!this.validateRadius(e.radius)) return 'ARC entity has invalid radius';
        if (!this.validateAngle(e.startAngle)) return 'ARC entity has invalid start angle';
        if (!this.validateAngle(e.endAngle)) return 'ARC entity has invalid end angle';
        break;

      case 'ELLIPSE':
        if (!e.center) return 'ELLIPSE entity missing center';
        if (!e.majorAxis) return 'ELLIPSE entity missing major axis';
        if (!isVector3(e.center)) return 'ELLIPSE entity has invalid center';
        if (!isVector3(e.majorAxis)) return 'ELLIPSE entity has invalid major axis';
        if (!this.validateNumericValue(e.minorAxisRatio)) return 'ELLIPSE entity has invalid minor axis ratio';
        if (!this.validateAngle(e.startAngle)) return 'ELLIPSE entity has invalid start angle';
        if (!this.validateAngle(e.endAngle)) return 'ELLIPSE entity has invalid end angle';
        break;

      default:
        return `Unsupported entity type: ${e.type}`;
    }

    return null;
  }
}
