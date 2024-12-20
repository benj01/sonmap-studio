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
  isDxfSplineEntity,
  DxfHatchEntity,
  DxfSolidEntity,
  DxfDimensionEntity,
  DxfLeaderEntity,
  DxfRayEntity
} from './types';
import { DxfErrorReporter, createDxfErrorReporter } from './error-collector';
import { ErrorMessage } from '../errors';

interface ValidationContext {
  type: string;
  handle?: string;
}

export class DxfValidator {
  private errorReporter: DxfErrorReporter;

  constructor() {
    this.errorReporter = createDxfErrorReporter();
  }

  validateEntityBase(entity: unknown): entity is DxfEntityBase {
    if (!entity || typeof entity !== 'object') {
      this.errorReporter.addDxfError('Invalid entity: must be an object', {
        type: 'INVALID_ENTITY',
        value: entity
      });
      return false;
    }

    const e = entity as Partial<DxfEntityBase>;
    const context: ValidationContext = { type: e.type || 'UNKNOWN', handle: e.handle };
    
    // Required properties
    if (typeof e.type !== 'string') {
      this.errorReporter.addDxfError('Entity missing required type property', {
        type: 'MISSING_TYPE',
        value: e
      });
      return false;
    }

    // Optional properties with type checking
    if (e.layer !== undefined && typeof e.layer !== 'string') {
      this.addEntityError(context, 'Invalid layer property', {
        type: 'INVALID_LAYER',
        value: e.layer
      });
      return false;
    }
    if (e.handle !== undefined && typeof e.handle !== 'string') {
      this.addEntityError(context, 'Invalid handle property', {
        type: 'INVALID_HANDLE',
        value: e.handle
      });
      return false;
    }
    if (e.color !== undefined && (typeof e.color !== 'number' || !Number.isFinite(e.color))) {
      this.addEntityError(context, 'Invalid color property', {
        type: 'INVALID_COLOR',
        value: e.color
      });
      return false;
    }
    if (e.colorRGB !== undefined && (typeof e.colorRGB !== 'number' || !Number.isFinite(e.colorRGB))) {
      this.addEntityError(context, 'Invalid colorRGB property', {
        type: 'INVALID_COLOR_RGB',
        value: e.colorRGB
      });
      return false;
    }
    if (e.lineType !== undefined && typeof e.lineType !== 'string') {
      this.addEntityError(context, 'Invalid lineType property', {
        type: 'INVALID_LINE_TYPE',
        value: e.lineType
      });
      return false;
    }
    if (e.lineWeight !== undefined && (typeof e.lineWeight !== 'number' || !Number.isFinite(e.lineWeight))) {
      this.addEntityError(context, 'Invalid lineWeight property', {
        type: 'INVALID_LINE_WEIGHT',
        value: e.lineWeight
      });
      return false;
    }
    if (e.elevation !== undefined && (typeof e.elevation !== 'number' || !Number.isFinite(e.elevation))) {
      this.addEntityError(context, 'Invalid elevation property', {
        type: 'INVALID_ELEVATION',
        value: e.elevation
      });
      return false;
    }
    if (e.thickness !== undefined && (typeof e.thickness !== 'number' || !Number.isFinite(e.thickness))) {
      this.addEntityError(context, 'Invalid thickness property', {
        type: 'INVALID_THICKNESS',
        value: e.thickness
      });
      return false;
    }
    if (e.visible !== undefined && typeof e.visible !== 'boolean') {
      this.addEntityError(context, 'Invalid visible property', {
        type: 'INVALID_VISIBLE',
        value: e.visible
      });
      return false;
    }
    if (e.extrusionDirection !== undefined && !isVector3(e.extrusionDirection)) {
      this.addEntityError(context, 'Invalid extrusionDirection property', {
        type: 'INVALID_EXTRUSION_DIRECTION',
        value: e.extrusionDirection
      });
      return false;
    }

    return true;
  }

  validateEntity(entity: unknown): entity is DxfEntity {
    if (!this.validateEntityBase(entity)) {
      return false;
    }

    const e = entity as DxfEntityBase;
    const context: ValidationContext = { type: e.type, handle: e.handle };

    switch (e.type) {
      case 'POINT':
        if (!isDxfPointEntity(e)) {
          this.addEntityError(context, 'Invalid point entity structure', {
            type: 'INVALID_POINT',
            entity: e
          });
          return false;
        }
        break;

      case 'LINE':
        if (!isDxfLineEntity(e)) {
          this.addEntityError(context, 'Invalid line entity structure', {
            type: 'INVALID_LINE',
            entity: e
          });
          return false;
        }
        break;

      case 'POLYLINE':
      case 'LWPOLYLINE':
        if (!isDxfPolylineEntity(e)) {
          this.addEntityError(context, 'Invalid polyline entity structure', {
            type: 'INVALID_POLYLINE',
            entity: e
          });
          return false;
        }
        if (e.vertices.length < 2) {
          this.addEntityError(context, 'Polyline must have at least 2 vertices', {
            type: 'INSUFFICIENT_VERTICES',
            vertexCount: e.vertices.length,
            minimumRequired: 2
          });
          return false;
        }
        break;

      case 'CIRCLE':
        if (!isDxfCircleEntity(e)) {
          this.addEntityError(context, 'Invalid circle entity structure', {
            type: 'INVALID_CIRCLE',
            entity: e
          });
          return false;
        }
        if (e.radius <= 0) {
          this.addEntityError(context, 'Circle radius must be positive', {
            type: 'INVALID_RADIUS',
            radius: e.radius
          });
          return false;
        }
        break;

      case 'ARC':
        if (!isDxfArcEntity(e)) {
          this.addEntityError(context, 'Invalid arc entity structure', {
            type: 'INVALID_ARC',
            entity: e
          });
          return false;
        }
        if (e.radius <= 0) {
          this.addEntityError(context, 'Arc radius must be positive', {
            type: 'INVALID_RADIUS',
            radius: e.radius
          });
          return false;
        }
        break;

      case 'ELLIPSE':
        if (!isDxfEllipseEntity(e)) {
          this.addEntityError(context, 'Invalid ellipse entity structure', {
            type: 'INVALID_ELLIPSE',
            entity: e
          });
          return false;
        }
        if (e.minorAxisRatio <= 0 || e.minorAxisRatio > 1) {
          this.addEntityError(context, 'Minor axis ratio must be between 0 and 1', {
            type: 'INVALID_MINOR_AXIS_RATIO',
            ratio: e.minorAxisRatio
          });
          return false;
        }
        break;

      case '3DFACE':
        if (!this.validate3DFaceEntity(e as unknown as DxfEntity, context)) {
          return false;
        }
        break;

      case 'INSERT':
        if (!isDxfInsertEntity(e)) {
          this.addEntityError(context, 'Invalid insert entity structure', {
            type: 'INVALID_INSERT',
            entity: e
          });
          return false;
        }
        if (!e.block) {
          this.addEntityError(context, 'Insert entity must reference a block', {
            type: 'MISSING_BLOCK_REFERENCE'
          });
          return false;
        }
        break;

      case 'TEXT':
      case 'MTEXT':
        if (!isDxfTextEntity(e)) {
          this.addEntityError(context, 'Invalid text entity structure', {
            type: 'INVALID_TEXT',
            entity: e
          });
          return false;
        }
        break;

      case 'SPLINE':
        if (!isDxfSplineEntity(e)) {
          this.addEntityError(context, 'Invalid spline entity structure', {
            type: 'INVALID_SPLINE',
            entity: e
          });
          return false;
        }
        if (e.controlPoints.length < 2) {
          this.addEntityError(context, 'Spline must have at least 2 control points', {
            type: 'INSUFFICIENT_CONTROL_POINTS',
            pointCount: e.controlPoints.length,
            minimumRequired: 2
          });
          return false;
        }
        break;

      case 'HATCH':
        if (!this.validateHatchEntity(e as unknown as DxfHatchEntity, context)) {
          return false;
        }
        break;

      case 'SOLID':
      case '3DSOLID':
        if (!this.validateSolidEntity(e as unknown as DxfSolidEntity, context)) {
          return false;
        }
        break;

      case 'DIMENSION':
        if (!this.validateDimensionEntity(e as unknown as DxfDimensionEntity, context)) {
          return false;
        }
        break;

      case 'LEADER':
      case 'MLEADER':
        if (!this.validateLeaderEntity(e as unknown as DxfLeaderEntity, context)) {
          return false;
        }
        break;

      case 'RAY':
      case 'XLINE':
        if (!this.validateRayEntity(e as unknown as DxfRayEntity, context)) {
          return false;
        }
        break;

      default:
        this.addEntityWarning(context, 'Unsupported entity type', {
          type: 'UNSUPPORTED_TYPE'
        });
        return false;
    }

    return true;
  }

  private validate3DFaceEntity(entity: DxfEntity, context: ValidationContext): boolean {
    const e = entity as { vertices?: Vector3[] };
    
    if (!e.vertices || !Array.isArray(e.vertices)) {
      this.addEntityError(context, 'Missing vertices array', {
        type: 'MISSING_VERTICES'
      });
      return false;
    }
    
    if (e.vertices.length !== 4) {
      this.addEntityError(context, 'Must have exactly 4 vertices', {
        type: 'INVALID_VERTEX_COUNT',
        vertexCount: e.vertices.length,
        expectedCount: 4
      });
      return false;
    }

    if (!e.vertices.every(vertex => isVector3(vertex))) {
      this.addEntityError(context, 'Invalid vertex coordinates', {
        type: 'INVALID_VERTICES',
        vertices: e.vertices
      });
      return false;
    }

    return true;
  }

  private validateHatchEntity(entity: DxfHatchEntity, context: ValidationContext): boolean {
    if (!Array.isArray(entity.boundaries)) {
      this.addEntityError(context, 'Missing boundaries array', {
        type: 'MISSING_BOUNDARIES'
      });
      return false;
    }

    if (!entity.boundaries.every(boundary => 
        Array.isArray(boundary) && boundary.every(point => isVector3(point)))) {
      this.addEntityError(context, 'Invalid boundary points', {
        type: 'INVALID_BOUNDARY_POINTS',
        boundaries: entity.boundaries
      });
      return false;
    }

    if (typeof entity.pattern !== 'string' || !entity.pattern) {
      this.addEntityError(context, 'Missing or invalid pattern', {
        type: 'INVALID_PATTERN',
        pattern: entity.pattern
      });
      return false;
    }

    if (typeof entity.solid !== 'boolean') {
      this.addEntityError(context, 'Missing or invalid solid flag', {
        type: 'INVALID_SOLID_FLAG',
        solid: entity.solid
      });
      return false;
    }

    return true;
  }

  private validateSolidEntity(entity: DxfSolidEntity, context: ValidationContext): boolean {
    if (!Array.isArray(entity.vertices)) {
      this.addEntityError(context, 'Missing vertices array', {
        type: 'MISSING_VERTICES'
      });
      return false;
    }

    if (!entity.vertices.every(vertex => isVector3(vertex))) {
      this.addEntityError(context, 'Invalid vertex coordinates', {
        type: 'INVALID_VERTICES',
        vertices: entity.vertices
      });
      return false;
    }

    return true;
  }

  private validateDimensionEntity(entity: DxfDimensionEntity, context: ValidationContext): boolean {
    if (!isVector3(entity.definitionPoint)) {
      this.addEntityError(context, 'Invalid definition point', {
        type: 'INVALID_DEFINITION_POINT',
        point: entity.definitionPoint
      });
      return false;
    }

    if (!isVector3(entity.textMidPoint)) {
      this.addEntityError(context, 'Invalid text mid point', {
        type: 'INVALID_TEXT_MID_POINT',
        point: entity.textMidPoint
      });
      return false;
    }

    if (!isVector3(entity.insertionPoint)) {
      this.addEntityError(context, 'Invalid insertion point', {
        type: 'INVALID_INSERTION_POINT',
        point: entity.insertionPoint
      });
      return false;
    }

    if (typeof entity.dimensionType !== 'number' || !Number.isFinite(entity.dimensionType)) {
      this.addEntityError(context, 'Invalid dimension type', {
        type: 'INVALID_DIMENSION_TYPE',
        dimensionType: entity.dimensionType
      });
      return false;
    }

    return true;
  }

  private validateLeaderEntity(entity: DxfLeaderEntity, context: ValidationContext): boolean {
    if (!Array.isArray(entity.vertices)) {
      this.addEntityError(context, 'Missing vertices array', {
        type: 'MISSING_VERTICES'
      });
      return false;
    }

    if (entity.vertices.length < 2) {
      this.addEntityError(context, 'Leader must have at least 2 vertices', {
        type: 'INSUFFICIENT_VERTICES',
        vertexCount: entity.vertices.length,
        minimumRequired: 2
      });
      return false;
    }

    if (!entity.vertices.every(vertex => isVector3(vertex))) {
      this.addEntityError(context, 'Invalid vertex coordinates', {
        type: 'INVALID_VERTICES',
        vertices: entity.vertices
      });
      return false;
    }

    if (entity.annotation && !isDxfTextEntity(entity.annotation)) {
      this.addEntityError(context, 'Invalid annotation', {
        type: 'INVALID_ANNOTATION',
        annotation: entity.annotation
      });
      return false;
    }

    return true;
  }

  private validateRayEntity(entity: DxfRayEntity, context: ValidationContext): boolean {
    if (!isVector3(entity.basePoint)) {
      this.addEntityError(context, 'Invalid base point', {
        type: 'INVALID_BASE_POINT',
        point: entity.basePoint
      });
      return false;
    }

    if (!isVector3(entity.direction)) {
      this.addEntityError(context, 'Invalid direction vector', {
        type: 'INVALID_DIRECTION',
        direction: entity.direction
      });
      return false;
    }

    // Check if direction vector is non-zero
    const { x, y, z = 0 } = entity.direction;
    if (x === 0 && y === 0 && z === 0) {
      this.addEntityError(context, 'Direction vector cannot be zero', {
        type: 'ZERO_DIRECTION_VECTOR',
        direction: entity.direction
      });
      return false;
    }

    return true;
  }

  private addEntityError(context: ValidationContext, message: string, details: Record<string, unknown>) {
    this.errorReporter.addEntityError(context.type, context.handle || 'unknown', message, details);
  }

  private addEntityWarning(context: ValidationContext, message: string, details: Record<string, unknown>) {
    this.errorReporter.addEntityWarning(context.type, context.handle || 'unknown', message, details);
  }

  getErrors(): ErrorMessage[] {
    return this.errorReporter.getErrors();
  }

  getWarnings(): ErrorMessage[] {
    return this.errorReporter.getWarnings();
  }

  clear() {
    this.errorReporter.clear();
  }
}
