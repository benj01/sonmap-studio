import { DxfEntity, DxfEntityBase, Vector3, ParserResult, ParserContext, DxfTextEntity } from './types';
import { DxfValidator } from './validator';
import { DxfErrorReporter, createDxfErrorReporter } from './error-collector';
import { GeoFeature } from '../../../../types/geo';
import { entityToGeoFeature } from './geo-converter';
import { ValidationError, ErrorMessage } from '../errors';

export class DxfEntityParser {
  private validator: DxfValidator;
  private errorReporter: DxfErrorReporter;

  constructor() {
    this.validator = new DxfValidator();
    this.errorReporter = createDxfErrorReporter();
  }

  parseEntity(rawEntity: unknown): DxfEntity | null {
    if (!rawEntity || typeof rawEntity !== 'object' || !('type' in rawEntity) || typeof rawEntity.type !== 'string') {
      this.errorReporter.addDxfError('Invalid entity structure', {
        type: 'INVALID_ENTITY',
        rawEntity
      });
      return null;
    }

    try {
      const entity = this.convertEntity(rawEntity);
      if (!entity && rawEntity.type) {
        this.errorReporter.addEntityWarning(
          rawEntity.type,
          'handle' in rawEntity ? String(rawEntity.handle) : undefined,
          'Failed to convert entity',
          { type: 'CONVERSION_FAILED', entity: rawEntity }
        );
      }
      return entity;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.errorReporter.addEntityError(
        (rawEntity as { type?: string }).type || 'UNKNOWN',
        'handle' in rawEntity ? String(rawEntity.handle) : undefined,
        `Error parsing entity: ${errorMessage}`,
        { type: 'PARSE_ERROR', error: errorMessage }
      );
      return null;
    }
  }

  private extractCommonProperties(entity: Record<string, unknown>): Omit<DxfEntityBase, 'type'> {
    return {
      layer: typeof entity.layer === 'string' ? entity.layer : undefined,
      handle: typeof entity.handle === 'string' ? entity.handle : undefined,
      color: typeof entity.color === 'number' ? entity.color : undefined,
      colorRGB: typeof entity.colorRGB === 'number' ? entity.colorRGB : undefined,
      lineType: typeof entity.lineType === 'string' ? entity.lineType : undefined,
      lineWeight: typeof entity.lineWeight === 'number' ? entity.lineWeight : undefined,
      elevation: typeof entity.elevation === 'number' ? entity.elevation : undefined,
      thickness: typeof entity.thickness === 'number' ? entity.thickness : undefined,
      visible: typeof entity.visible === 'boolean' ? entity.visible : undefined,
      extrusionDirection: typeof entity.extrusionDirection === 'object' ? entity.extrusionDirection as Vector3 : undefined
    };
  }

  private convertEntity(entity: Record<string, unknown>): DxfEntity | null {
    try {
      switch (entity.type) {
        case '3DFACE':
          return this.parse3DFace(entity);
        case 'POINT':
          return this.parsePoint(entity);
        case 'LINE':
          return this.parseLine(entity);
        case 'POLYLINE':
        case 'LWPOLYLINE':
          return this.parsePolyline(entity);
        case 'CIRCLE':
          return this.parseCircle(entity);
        case 'ARC':
          return this.parseArc(entity);
        case 'ELLIPSE':
          return this.parseEllipse(entity);
        case 'INSERT':
          return this.parseInsert(entity);
        case 'TEXT':
        case 'MTEXT':
          return this.parseText(entity);
        case 'SPLINE':
          return this.parseSpline(entity);
        case 'HATCH':
          return this.parseHatch(entity);
        case 'SOLID':
        case '3DSOLID':
          return this.parseSolid(entity);
        case 'DIMENSION':
          return this.parseDimension(entity);
        case 'LEADER':
        case 'MLEADER':
          return this.parseLeader(entity);
        case 'RAY':
        case 'XLINE':
          return this.parseRay(entity);
        default:
          this.errorReporter.addEntityWarning(
            String(entity.type),
            typeof entity.handle === 'string' ? entity.handle : undefined,
            'Unsupported entity type',
            { type: 'UNSUPPORTED_TYPE' }
          );
          return null;
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.errorReporter.addEntityError(
        String(entity.type) || 'UNKNOWN',
        typeof entity.handle === 'string' ? entity.handle : undefined,
        `Error converting entity: ${errorMessage}`,
        { type: 'CONVERSION_ERROR', error: errorMessage }
      );
      return null;
    }
  }

  private parse3DFace(entity: Record<string, unknown>): DxfEntity | null {
    const vertices = entity.vertices as unknown[];
    if (!Array.isArray(vertices) || vertices.length < 3) {
      this.errorReporter.addEntityError(
        '3DFACE',
        typeof entity.handle === 'string' ? entity.handle : undefined,
        'Invalid vertices',
        { 
          type: 'INVALID_VERTICES',
          vertexCount: vertices?.length ?? 0,
          expectedCount: 3
        }
      );
      return null;
    }

    const defaultVertex = { x: 0, y: 0, z: 0 };
    return {
      ...this.extractCommonProperties(entity),
      type: '3DFACE',
      vertices: [
        vertices[0] as Vector3 || defaultVertex,
        vertices[1] as Vector3 || defaultVertex,
        vertices[2] as Vector3 || defaultVertex,
        vertices[3] as Vector3 || vertices[2] as Vector3 || defaultVertex
      ]
    };
  }

  private parsePoint(entity: Record<string, unknown>): DxfEntity | null {
    const position = entity.position as Vector3;
    if (!position || typeof position.x !== 'number' || typeof position.y !== 'number') {
      this.errorReporter.addEntityError(
        'POINT',
        typeof entity.handle === 'string' ? entity.handle : undefined,
        'Invalid position',
        { 
          type: 'INVALID_POSITION',
          position
        }
      );
      return null;
    }
    return {
      ...this.extractCommonProperties(entity),
      type: 'POINT',
      position
    };
  }

  private parseLine(entity: Record<string, unknown>): DxfEntity | null {
    const start = entity.start as Vector3;
    const end = entity.end as Vector3;
    if (!start || !end || typeof start.x !== 'number' || typeof end.x !== 'number') {
      this.errorReporter.addEntityError(
        'LINE',
        typeof entity.handle === 'string' ? entity.handle : undefined,
        'Invalid start/end points',
        { 
          type: 'INVALID_POINTS',
          start,
          end
        }
      );
      return null;
    }
    return {
      ...this.extractCommonProperties(entity),
      type: 'LINE',
      start,
      end
    };
  }

  private parsePolyline(entity: Record<string, unknown>): DxfEntity | null {
    const vertices = entity.vertices as unknown[];
    if (!Array.isArray(vertices)) {
      this.errorReporter.addEntityError(
        String(entity.type),
        typeof entity.handle === 'string' ? entity.handle : undefined,
        'Missing vertices array',
        { type: 'MISSING_VERTICES' }
      );
      return null;
    }

    // Ensure all vertices have valid x,y coordinates
    const validVertices = vertices.map(v => {
      const vertex = v as Record<string, unknown>;
      return {
        x: typeof vertex.x === 'number' ? vertex.x : 0,
        y: typeof vertex.y === 'number' ? vertex.y : 0,
        z: typeof vertex.z === 'number' ? vertex.z : 0
      };
    });

    if (validVertices.length < 2) {
      this.errorReporter.addEntityError(
        String(entity.type),
        typeof entity.handle === 'string' ? entity.handle : undefined,
        'Polyline must have at least 2 vertices',
        { 
          type: 'INSUFFICIENT_VERTICES',
          vertexCount: validVertices.length,
          minimumRequired: 2
        }
      );
      return null;
    }

    return {
      ...this.extractCommonProperties(entity),
      type: String(entity.type) as 'POLYLINE' | 'LWPOLYLINE',
      vertices: validVertices,
      closed: Boolean(entity.closed)
    };
  }

  private parseCircle(entity: Record<string, unknown>): DxfEntity | null {
    const center = entity.center as Vector3;
    const radius = entity.radius as number;
    if (!center || typeof radius !== 'number') {
      this.errorReporter.addEntityError(
        'CIRCLE',
        typeof entity.handle === 'string' ? entity.handle : undefined,
        'Missing center or radius',
        { 
          type: 'INVALID_CIRCLE',
          center,
          radius
        }
      );
      return null;
    }
    return {
      ...this.extractCommonProperties(entity),
      type: 'CIRCLE',
      center,
      radius
    };
  }

  private parseArc(entity: Record<string, unknown>): DxfEntity | null {
    const center = entity.center as Vector3;
    const radius = entity.radius as number;
    const startAngle = entity.startAngle as number;
    const endAngle = entity.endAngle as number;

    if (!center || typeof radius !== 'number' ||
        typeof startAngle !== 'number' || typeof endAngle !== 'number') {
      this.errorReporter.addEntityError(
        'ARC',
        typeof entity.handle === 'string' ? entity.handle : undefined,
        'Missing parameters',
        {
          type: 'INVALID_ARC',
          center,
          radius,
          startAngle,
          endAngle
        }
      );
      return null;
    }
    return {
      ...this.extractCommonProperties(entity),
      type: 'ARC',
      center,
      radius,
      startAngle,
      endAngle
    };
  }

  private parseEllipse(entity: Record<string, unknown>): DxfEntity | null {
    const center = entity.center as Vector3;
    const majorAxis = entity.majorAxis as Vector3;
    const minorAxisRatio = entity.minorAxisRatio as number;
    const startAngle = entity.startAngle as number;
    const endAngle = entity.endAngle as number;

    if (!center || !majorAxis ||
        typeof minorAxisRatio !== 'number' ||
        typeof startAngle !== 'number' ||
        typeof endAngle !== 'number') {
      this.errorReporter.addEntityError(
        'ELLIPSE',
        typeof entity.handle === 'string' ? entity.handle : undefined,
        'Missing parameters',
        {
          type: 'INVALID_ELLIPSE',
          center,
          majorAxis,
          minorAxisRatio,
          startAngle,
          endAngle
        }
      );
      return null;
    }
    return {
      ...this.extractCommonProperties(entity),
      type: 'ELLIPSE',
      center,
      majorAxis,
      minorAxisRatio,
      startAngle,
      endAngle
    };
  }

  private parseInsert(entity: Record<string, unknown>): DxfEntity | null {
    const position = entity.position as Vector3;
    const block = entity.block as string;
    if (!position || !block) {
      this.errorReporter.addEntityError(
        'INSERT',
        typeof entity.handle === 'string' ? entity.handle : undefined,
        'Missing position or block reference',
        {
          type: 'INVALID_INSERT',
          position,
          block
        }
      );
      return null;
    }
    return {
      ...this.extractCommonProperties(entity),
      type: 'INSERT',
      position,
      block,
      scale: entity.scale as Vector3,
      rotation: typeof entity.rotation === 'number' ? entity.rotation : undefined
    };
  }

  private parseText(entity: Record<string, unknown>): DxfEntity | null {
    const position = entity.position as Vector3;
    const text = entity.text as string;
    if (!position || typeof text !== 'string') {
      this.errorReporter.addEntityError(
        String(entity.type),
        typeof entity.handle === 'string' ? entity.handle : undefined,
        'Missing position or text content',
        {
          type: 'INVALID_TEXT',
          position,
          hasText: typeof text === 'string'
        }
      );
      return null;
    }
    return {
      ...this.extractCommonProperties(entity),
      type: String(entity.type) as 'TEXT' | 'MTEXT',
      position,
      text,
      height: typeof entity.height === 'number' ? entity.height : undefined,
      rotation: typeof entity.rotation === 'number' ? entity.rotation : undefined,
      width: typeof entity.width === 'number' ? entity.width : undefined,
      style: typeof entity.style === 'string' ? entity.style : undefined,
      horizontalAlignment: entity.horizontalAlignment as 'left' | 'center' | 'right',
      verticalAlignment: entity.verticalAlignment as 'baseline' | 'bottom' | 'middle' | 'top'
    };
  }

  private parseSpline(entity: Record<string, unknown>): DxfEntity | null {
    const controlPoints = entity.controlPoints as Vector3[];
    const degree = entity.degree as number;
    if (!Array.isArray(controlPoints) || typeof degree !== 'number') {
      this.errorReporter.addEntityError(
        'SPLINE',
        typeof entity.handle === 'string' ? entity.handle : undefined,
        'Missing control points or degree',
        {
          type: 'INVALID_SPLINE',
          hasControlPoints: Array.isArray(controlPoints),
          hasDegree: typeof degree === 'number'
        }
      );
      return null;
    }
    return {
      ...this.extractCommonProperties(entity),
      type: 'SPLINE',
      controlPoints,
      degree,
      knots: Array.isArray(entity.knots) ? entity.knots as number[] : undefined,
      weights: Array.isArray(entity.weights) ? entity.weights as number[] : undefined,
      closed: Boolean(entity.closed)
    };
  }

  private parseHatch(entity: Record<string, unknown>): DxfEntity | null {
    const boundaries = entity.boundaries as Vector3[][];
    const pattern = entity.pattern as string;
    if (!Array.isArray(boundaries) || typeof pattern !== 'string') {
      this.errorReporter.addEntityError(
        'HATCH',
        typeof entity.handle === 'string' ? entity.handle : undefined,
        'Missing boundaries or pattern',
        {
          type: 'INVALID_HATCH',
          hasBoundaries: Array.isArray(boundaries),
          hasPattern: typeof pattern === 'string'
        }
      );
      return null;
    }
    return {
      ...this.extractCommonProperties(entity),
      type: 'HATCH',
      boundaries,
      pattern,
      solid: Boolean(entity.solid),
      scale: typeof entity.scale === 'number' ? entity.scale : undefined,
      angle: typeof entity.angle === 'number' ? entity.angle : undefined
    };
  }

  private parseSolid(entity: Record<string, unknown>): DxfEntity | null {
    const vertices = entity.vertices as Vector3[];
    if (!Array.isArray(vertices)) {
      this.errorReporter.addEntityError(
        String(entity.type),
        typeof entity.handle === 'string' ? entity.handle : undefined,
        'Missing vertices',
        {
          type: 'INVALID_SOLID',
          hasVertices: Array.isArray(vertices)
        }
      );
      return null;
    }
    return {
      ...this.extractCommonProperties(entity),
      type: String(entity.type) as 'SOLID' | '3DSOLID',
      vertices
    };
  }

  private parseDimension(entity: Record<string, unknown>): DxfEntity | null {
    const definitionPoint = entity.definitionPoint as Vector3;
    const textMidPoint = entity.textMidPoint as Vector3;
    const insertionPoint = entity.insertionPoint as Vector3;
    const dimensionType = entity.dimensionType as number;

    if (!definitionPoint || !textMidPoint || !insertionPoint || 
        typeof dimensionType !== 'number') {
      this.errorReporter.addEntityError(
        'DIMENSION',
        typeof entity.handle === 'string' ? entity.handle : undefined,
        'Missing required parameters',
        {
          type: 'INVALID_DIMENSION',
          hasDefinitionPoint: !!definitionPoint,
          hasTextMidPoint: !!textMidPoint,
          hasInsertionPoint: !!insertionPoint,
          hasDimensionType: typeof dimensionType === 'number'
        }
      );
      return null;
    }
    return {
      ...this.extractCommonProperties(entity),
      type: 'DIMENSION',
      definitionPoint,
      textMidPoint,
      insertionPoint,
      dimensionType,
      text: typeof entity.text === 'string' ? entity.text : undefined,
      rotation: typeof entity.rotation === 'number' ? entity.rotation : undefined
    };
  }

  private parseLeader(entity: Record<string, unknown>): DxfEntity | null {
    const vertices = entity.vertices as Vector3[];
    if (!Array.isArray(vertices)) {
      this.errorReporter.addEntityError(
        String(entity.type),
        typeof entity.handle === 'string' ? entity.handle : undefined,
        'Missing vertices',
        {
          type: 'INVALID_LEADER',
          hasVertices: Array.isArray(vertices)
        }
      );
      return null;
    }
    return {
      ...this.extractCommonProperties(entity),
      type: String(entity.type) as 'LEADER' | 'MLEADER',
      vertices,
      annotation: entity.annotation as DxfTextEntity | undefined,
      arrowhead: Boolean(entity.arrowhead)
    };
  }

  private parseRay(entity: Record<string, unknown>): DxfEntity | null {
    const basePoint = entity.basePoint as Vector3;
    const direction = entity.direction as Vector3;
    if (!basePoint || !direction) {
      this.errorReporter.addEntityError(
        String(entity.type),
        typeof entity.handle === 'string' ? entity.handle : undefined,
        'Missing base point or direction',
        {
          type: 'INVALID_RAY',
          hasBasePoint: !!basePoint,
          hasDirection: !!direction
        }
      );
      return null;
    }
    return {
      ...this.extractCommonProperties(entity),
      type: String(entity.type) as 'RAY' | 'XLINE',
      basePoint,
      direction
    };
  }

  entityToGeoFeature(entity: DxfEntity & { type: string; handle?: string; layer?: string }, layerInfo?: Record<string, unknown>): GeoFeature | null {
    const type = entity.type;
    const handle = entity.handle || 'unknown';
    const layer = entity.layer || 'unknown';

    if (!this.validator.validateEntity(entity)) {
      const validationError = new ValidationError(
        'Entity validation failed',
        type,
        handle,
        {
          layer,
          validatorErrors: this.validator.getErrors()
        }
      );
      this.errorReporter.addError(
        validationError.message,
        validationError.code,
        {
          entityType: type,
          handle,
          layer,
          validatorErrors: this.validator.getErrors()
        }
      );
      return null;
    }

    try {
      const feature = entityToGeoFeature(entity, layerInfo);
      if (!feature) {
        this.errorReporter.addEntityWarning(
          type,
          handle,
          'Failed to convert entity to GeoJSON feature',
          { 
            type: 'GEOJSON_CONVERSION_FAILED',
            layer,
            layerInfo
          }
        );
      }
      return feature;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.errorReporter.addEntityError(
        type,
        handle,
        `Error converting to GeoJSON: ${errorMessage}`,
        {
          type: 'GEOJSON_CONVERSION_ERROR',
          layer,
          error: errorMessage
        }
      );
      return null;
    }
  }

  getErrors(): ErrorMessage[] {
    return this.errorReporter.getErrors();
  }

  getWarnings(): ErrorMessage[] {
    return this.errorReporter.getWarnings();
  }

  clear(): void {
    this.errorReporter.clear();
    this.validator.clear();
  }
}
