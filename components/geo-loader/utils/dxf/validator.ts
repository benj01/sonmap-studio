import { 
  DxfEntity, 
  DxfEntityBase,
  Vector3,
  isVector3,
  isDxfPointEntity,
  isDxfLineEntity,
  isDxfPolylineEntity,
  isDxfCircleEntity,
  isDxfArcEntity,
  isDxfEllipseEntity,
  isDxfInsertEntity,
  isDxfTextEntity,
  isDxfSplineEntity
} from './types';
import { ErrorCollector } from './error-collector';

export class DxfValidator {
  private errorCollector: ErrorCollector;

  constructor() {
    this.errorCollector = new ErrorCollector();
  }

  validateEntityBase(entity: unknown): entity is DxfEntityBase {
    if (!entity || typeof entity !== 'object') {
      this.errorCollector.addGeneralError('Invalid entity: must be an object');
      return false;
    }

    const e = entity as any;
    
    // Required properties
    if (typeof e.type !== 'string') {
      this.errorCollector.addGeneralError('Entity missing required type property');
      return false;
    }

    // Optional properties with type checking
    if (e.layer !== undefined && typeof e.layer !== 'string') {
      this.errorCollector.addError(e.type, e.handle, 'Invalid layer property');
      return false;
    }
    if (e.handle !== undefined && typeof e.handle !== 'string') {
      this.errorCollector.addError(e.type, e.handle, 'Invalid handle property');
      return false;
    }
    if (e.color !== undefined && typeof e.color !== 'number') {
      this.errorCollector.addError(e.type, e.handle, 'Invalid color property');
      return false;
    }
    if (e.colorRGB !== undefined && typeof e.colorRGB !== 'number') {
      this.errorCollector.addError(e.type, e.handle, 'Invalid colorRGB property');
      return false;
    }
    if (e.lineType !== undefined && typeof e.lineType !== 'string') {
      this.errorCollector.addError(e.type, e.handle, 'Invalid lineType property');
      return false;
    }
    if (e.lineWeight !== undefined && typeof e.lineWeight !== 'number') {
      this.errorCollector.addError(e.type, e.handle, 'Invalid lineWeight property');
      return false;
    }
    if (e.elevation !== undefined && typeof e.elevation !== 'number') {
      this.errorCollector.addError(e.type, e.handle, 'Invalid elevation property');
      return false;
    }
    if (e.thickness !== undefined && typeof e.thickness !== 'number') {
      this.errorCollector.addError(e.type, e.handle, 'Invalid thickness property');
      return false;
    }
    if (e.visible !== undefined && typeof e.visible !== 'boolean') {
      this.errorCollector.addError(e.type, e.handle, 'Invalid visible property');
      return false;
    }
    if (e.extrusionDirection !== undefined && !isVector3(e.extrusionDirection)) {
      this.errorCollector.addError(e.type, e.handle, 'Invalid extrusionDirection property');
      return false;
    }

    return true;
  }

  validateEntity(entity: unknown): entity is DxfEntity {
    if (!this.validateEntityBase(entity)) {
      return false;
    }

    const e = entity as any;
    const handle = e.handle || 'unknown';

    switch (e.type) {
      case 'POINT':
        if (!isDxfPointEntity(e)) {
          this.errorCollector.addError('POINT', handle, 'Invalid point entity structure');
          return false;
        }
        break;

      case 'LINE':
        if (!isDxfLineEntity(e)) {
          this.errorCollector.addError('LINE', handle, 'Invalid line entity structure');
          return false;
        }
        break;

      case 'POLYLINE':
      case 'LWPOLYLINE':
        if (!isDxfPolylineEntity(e)) {
          this.errorCollector.addError(e.type, handle, 'Invalid polyline entity structure');
          return false;
        }
        break;

      case 'CIRCLE':
        if (!isDxfCircleEntity(e)) {
          this.errorCollector.addError('CIRCLE', handle, 'Invalid circle entity structure');
          return false;
        }
        break;

      case 'ARC':
        if (!isDxfArcEntity(e)) {
          this.errorCollector.addError('ARC', handle, 'Invalid arc entity structure');
          return false;
        }
        break;

      case 'ELLIPSE':
        if (!isDxfEllipseEntity(e)) {
          this.errorCollector.addError('ELLIPSE', handle, 'Invalid ellipse entity structure');
          return false;
        }
        break;

      case '3DFACE':
        if (!this.validate3DFaceEntity(e)) {
          this.errorCollector.addError('3DFACE', handle, 'Invalid 3DFACE entity structure');
          return false;
        }
        break;

      case 'INSERT':
        if (!isDxfInsertEntity(e)) {
          this.errorCollector.addError('INSERT', handle, 'Invalid insert entity structure');
          return false;
        }
        break;

      case 'TEXT':
      case 'MTEXT':
        if (!isDxfTextEntity(e)) {
          this.errorCollector.addError(e.type, handle, 'Invalid text entity structure');
          return false;
        }
        break;

      case 'SPLINE':
        if (!isDxfSplineEntity(e)) {
          this.errorCollector.addError('SPLINE', handle, 'Invalid spline entity structure');
          return false;
        }
        break;

      case 'HATCH':
        if (!this.validateHatchEntity(e)) {
          this.errorCollector.addError('HATCH', handle, 'Invalid hatch entity structure');
          return false;
        }
        break;

      case 'SOLID':
      case '3DSOLID':
        if (!this.validateSolidEntity(e)) {
          this.errorCollector.addError(e.type, handle, 'Invalid solid entity structure');
          return false;
        }
        break;

      case 'DIMENSION':
        if (!this.validateDimensionEntity(e)) {
          this.errorCollector.addError('DIMENSION', handle, 'Invalid dimension entity structure');
          return false;
        }
        break;

      case 'LEADER':
      case 'MLEADER':
        if (!this.validateLeaderEntity(e)) {
          this.errorCollector.addError(e.type, handle, 'Invalid leader entity structure');
          return false;
        }
        break;

      case 'RAY':
      case 'XLINE':
        if (!this.validateRayEntity(e)) {
          this.errorCollector.addError(e.type, handle, 'Invalid ray/xline entity structure');
          return false;
        }
        break;

      default:
        this.errorCollector.addWarning(e.type, handle, 'Unsupported entity type');
        return false;
    }

    return true;
  }

  validate3DFaceEntity(entity: any): boolean {
    if (!entity.vertices || !Array.isArray(entity.vertices)) {
      this.errorCollector.addError('3DFACE', entity.handle, 'Missing vertices array');
      return false;
    }
    
    if (entity.vertices.length !== 4) {
      this.errorCollector.addError('3DFACE', entity.handle, 'Must have exactly 4 vertices');
      return false;
    }

    if (!entity.vertices.every((vertex: unknown) => isVector3(vertex))) {
      this.errorCollector.addError('3DFACE', entity.handle, 'Invalid vertex coordinates');
      return false;
    }

    return true;
  }

  validateHatchEntity(entity: any): boolean {
    if (!Array.isArray(entity.boundaries)) {
      this.errorCollector.addError('HATCH', entity.handle, 'Missing boundaries array');
      return false;
    }

    if (!entity.boundaries.every((boundary: unknown[]) => 
        Array.isArray(boundary) && boundary.every(point => isVector3(point)))) {
      this.errorCollector.addError('HATCH', entity.handle, 'Invalid boundary points');
      return false;
    }

    if (typeof entity.pattern !== 'string') {
      this.errorCollector.addError('HATCH', entity.handle, 'Missing or invalid pattern');
      return false;
    }

    if (typeof entity.solid !== 'boolean') {
      this.errorCollector.addError('HATCH', entity.handle, 'Missing or invalid solid flag');
      return false;
    }

    return true;
  }

  validateSolidEntity(entity: any): boolean {
    if (!Array.isArray(entity.vertices)) {
      this.errorCollector.addError(entity.type, entity.handle, 'Missing vertices array');
      return false;
    }

    if (!entity.vertices.every((vertex: unknown) => isVector3(vertex))) {
      this.errorCollector.addError(entity.type, entity.handle, 'Invalid vertex coordinates');
      return false;
    }

    return true;
  }

  validateDimensionEntity(entity: any): boolean {
    if (!isVector3(entity.definitionPoint)) {
      this.errorCollector.addError('DIMENSION', entity.handle, 'Invalid definition point');
      return false;
    }

    if (!isVector3(entity.textMidPoint)) {
      this.errorCollector.addError('DIMENSION', entity.handle, 'Invalid text mid point');
      return false;
    }

    if (!isVector3(entity.insertionPoint)) {
      this.errorCollector.addError('DIMENSION', entity.handle, 'Invalid insertion point');
      return false;
    }

    if (typeof entity.dimensionType !== 'number') {
      this.errorCollector.addError('DIMENSION', entity.handle, 'Invalid dimension type');
      return false;
    }

    return true;
  }

  validateLeaderEntity(entity: any): boolean {
    if (!Array.isArray(entity.vertices)) {
      this.errorCollector.addError(entity.type, entity.handle, 'Missing vertices array');
      return false;
    }

    if (!entity.vertices.every((vertex: unknown) => isVector3(vertex))) {
      this.errorCollector.addError(entity.type, entity.handle, 'Invalid vertex coordinates');
      return false;
    }

    if (entity.annotation && !isDxfTextEntity(entity.annotation)) {
      this.errorCollector.addError(entity.type, entity.handle, 'Invalid annotation');
      return false;
    }

    return true;
  }

  validateRayEntity(entity: any): boolean {
    if (!isVector3(entity.basePoint)) {
      this.errorCollector.addError(entity.type, entity.handle, 'Invalid base point');
      return false;
    }

    if (!isVector3(entity.direction)) {
      this.errorCollector.addError(entity.type, entity.handle, 'Invalid direction vector');
      return false;
    }

    return true;
  }

  getErrors(): string[] {
    return this.errorCollector.getErrors();
  }

  getWarnings(): string[] {
    return this.errorCollector.getWarnings();
  }

  clear() {
    this.errorCollector.clear();
  }
}
