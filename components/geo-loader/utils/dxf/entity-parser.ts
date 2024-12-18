import { DxfEntity, DxfEntityBase, Vector3, ParserResult, ParserContext } from './types';
import { DxfValidator } from './validator';
import { ErrorCollector } from './error-collector';
import { GeoFeature } from '../../../../types/geo';
import { entityToGeoFeature } from './geo-converter';

export class DxfEntityParser {
  private validator: DxfValidator;
  private errorCollector: ErrorCollector;

  constructor() {
    this.validator = new DxfValidator();
    this.errorCollector = new ErrorCollector();
  }

  parseEntity(rawEntity: any): DxfEntity | null {
    if (!rawEntity || typeof rawEntity !== 'object' || typeof rawEntity.type !== 'string') {
      this.errorCollector.addGeneralError('Invalid entity structure');
      return null;
    }

    try {
      const entity = this.convertEntity(rawEntity);
      if (!entity && rawEntity?.type) {
        this.errorCollector.addWarning(
          rawEntity.type,
          rawEntity.handle,
          'Failed to convert entity'
        );
      }
      return entity;
    } catch (error: any) {
      this.errorCollector.addError(
        rawEntity.type || 'UNKNOWN',
        rawEntity.handle,
        `Error parsing entity: ${error?.message || error}`
      );
      return null;
    }
  }

  private extractCommonProperties(entity: any): Omit<DxfEntityBase, 'type'> {
    return {
      layer: entity.layer,
      handle: entity.handle,
      color: entity.color,
      colorRGB: entity.colorRGB,
      lineType: entity.lineType,
      lineWeight: entity.lineWeight,
      elevation: entity.elevation,
      thickness: entity.thickness,
      visible: entity.visible,
      extrusionDirection: entity.extrusionDirection
    };
  }

  private convertEntity(entity: any): DxfEntity | null {
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
          this.errorCollector.addWarning(
            entity.type,
            entity.handle,
            'Unsupported entity type'
          );
          return null;
      }
    } catch (error: any) {
      this.errorCollector.addError(
        entity.type || 'UNKNOWN',
        entity.handle,
        `Error converting entity: ${error?.message || error}`
      );
      return null;
    }
  }

  private parse3DFace(entity: any): DxfEntity | null {
    if (!Array.isArray(entity.vertices) || entity.vertices.length < 3) {
      this.errorCollector.addError('3DFACE', entity.handle, 'Invalid vertices');
      return null;
    }
    return {
      ...this.extractCommonProperties(entity),
      type: '3DFACE',
      vertices: [
        entity.vertices[0] || { x: 0, y: 0, z: 0 },
        entity.vertices[1] || { x: 0, y: 0, z: 0 },
        entity.vertices[2] || { x: 0, y: 0, z: 0 },
        entity.vertices[3] || entity.vertices[2] || { x: 0, y: 0, z: 0 }
      ]
    };
  }

  private parsePoint(entity: any): DxfEntity | null {
    if (!entity.position || typeof entity.position.x !== 'number' || typeof entity.position.y !== 'number') {
      this.errorCollector.addError('POINT', entity.handle, 'Invalid position');
      return null;
    }
    return {
      ...this.extractCommonProperties(entity),
      type: 'POINT',
      position: entity.position
    };
  }

  private parseLine(entity: any): DxfEntity | null {
    if (!entity.start || !entity.end || typeof entity.start.x !== 'number' || typeof entity.end.x !== 'number') {
      this.errorCollector.addError('LINE', entity.handle, 'Invalid start/end points');
      return null;
    }
    return {
      ...this.extractCommonProperties(entity),
      type: 'LINE',
      start: entity.start,
      end: entity.end
    };
  }

  private parsePolyline(entity: any): DxfEntity | null {
    if (!Array.isArray(entity.vertices)) {
      this.errorCollector.addError(entity.type, entity.handle, 'Missing vertices array');
      return null;
    }

    // Ensure all vertices have valid x,y coordinates
    const vertices = entity.vertices.map((v: any) => ({
      x: typeof v.x === 'number' ? v.x : 0,
      y: typeof v.y === 'number' ? v.y : 0,
      z: typeof v.z === 'number' ? v.z : 0
    }));

    if (vertices.length < 2) {
      this.errorCollector.addError(entity.type, entity.handle, 'Polyline must have at least 2 vertices');
      return null;
    }

    return {
      ...this.extractCommonProperties(entity),
      type: entity.type,
      vertices,
      closed: entity.closed
    };
  }

  private parseCircle(entity: any): DxfEntity | null {
    if (!entity.center || typeof entity.radius !== 'number') {
      this.errorCollector.addError('CIRCLE', entity.handle, 'Missing center or radius');
      return null;
    }
    return {
      ...this.extractCommonProperties(entity),
      type: 'CIRCLE',
      center: entity.center,
      radius: entity.radius
    };
  }

  private parseArc(entity: any): DxfEntity | null {
    if (!entity.center || typeof entity.radius !== 'number' ||
        typeof entity.startAngle !== 'number' || typeof entity.endAngle !== 'number') {
      this.errorCollector.addError('ARC', entity.handle, 'Missing parameters');
      return null;
    }
    return {
      ...this.extractCommonProperties(entity),
      type: 'ARC',
      center: entity.center,
      radius: entity.radius,
      startAngle: entity.startAngle,
      endAngle: entity.endAngle
    };
  }

  private parseEllipse(entity: any): DxfEntity | null {
    if (!entity.center || !entity.majorAxis ||
        typeof entity.minorAxisRatio !== 'number' ||
        typeof entity.startAngle !== 'number' ||
        typeof entity.endAngle !== 'number') {
      this.errorCollector.addError('ELLIPSE', entity.handle, 'Missing parameters');
      return null;
    }
    return {
      ...this.extractCommonProperties(entity),
      type: 'ELLIPSE',
      center: entity.center,
      majorAxis: entity.majorAxis,
      minorAxisRatio: entity.minorAxisRatio,
      startAngle: entity.startAngle,
      endAngle: entity.endAngle
    };
  }

  private parseInsert(entity: any): DxfEntity | null {
    if (!entity.position || !entity.block) {
      this.errorCollector.addError('INSERT', entity.handle, 'Missing position or block reference');
      return null;
    }
    return {
      ...this.extractCommonProperties(entity),
      type: 'INSERT',
      position: entity.position,
      block: entity.block,
      scale: entity.scale,
      rotation: entity.rotation
    };
  }

  private parseText(entity: any): DxfEntity | null {
    if (!entity.position || typeof entity.text !== 'string') {
      this.errorCollector.addError(entity.type, entity.handle, 'Missing position or text content');
      return null;
    }
    return {
      ...this.extractCommonProperties(entity),
      type: entity.type,
      position: entity.position,
      text: entity.text,
      height: entity.height,
      rotation: entity.rotation,
      width: entity.width,
      style: entity.style,
      horizontalAlignment: entity.horizontalAlignment,
      verticalAlignment: entity.verticalAlignment
    };
  }

  private parseSpline(entity: any): DxfEntity | null {
    if (!Array.isArray(entity.controlPoints) || typeof entity.degree !== 'number') {
      this.errorCollector.addError('SPLINE', entity.handle, 'Missing control points or degree');
      return null;
    }
    return {
      ...this.extractCommonProperties(entity),
      type: 'SPLINE',
      controlPoints: entity.controlPoints,
      degree: entity.degree,
      knots: entity.knots,
      weights: entity.weights,
      closed: entity.closed
    };
  }

  private parseHatch(entity: any): DxfEntity | null {
    if (!Array.isArray(entity.boundaries) || typeof entity.pattern !== 'string') {
      this.errorCollector.addError('HATCH', entity.handle, 'Missing boundaries or pattern');
      return null;
    }
    return {
      ...this.extractCommonProperties(entity),
      type: 'HATCH',
      boundaries: entity.boundaries,
      pattern: entity.pattern,
      solid: entity.solid ?? false,
      scale: entity.scale,
      angle: entity.angle
    };
  }

  private parseSolid(entity: any): DxfEntity | null {
    if (!Array.isArray(entity.vertices)) {
      this.errorCollector.addError(entity.type, entity.handle, 'Missing vertices');
      return null;
    }
    return {
      ...this.extractCommonProperties(entity),
      type: entity.type,
      vertices: entity.vertices
    };
  }

  private parseDimension(entity: any): DxfEntity | null {
    if (!entity.definitionPoint || !entity.textMidPoint || !entity.insertionPoint || 
        typeof entity.dimensionType !== 'number') {
      this.errorCollector.addError('DIMENSION', entity.handle, 'Missing required parameters');
      return null;
    }
    return {
      ...this.extractCommonProperties(entity),
      type: 'DIMENSION',
      definitionPoint: entity.definitionPoint,
      textMidPoint: entity.textMidPoint,
      insertionPoint: entity.insertionPoint,
      dimensionType: entity.dimensionType,
      text: entity.text,
      rotation: entity.rotation
    };
  }

  private parseLeader(entity: any): DxfEntity | null {
    if (!Array.isArray(entity.vertices)) {
      this.errorCollector.addError(entity.type, entity.handle, 'Missing vertices');
      return null;
    }
    return {
      ...this.extractCommonProperties(entity),
      type: entity.type,
      vertices: entity.vertices,
      annotation: entity.annotation,
      arrowhead: entity.arrowhead
    };
  }

  private parseRay(entity: any): DxfEntity | null {
    if (!entity.basePoint || !entity.direction) {
      this.errorCollector.addError(entity.type, entity.handle, 'Missing base point or direction');
      return null;
    }
    return {
      ...this.extractCommonProperties(entity),
      type: entity.type,
      basePoint: entity.basePoint,
      direction: entity.direction
    };
  }

  entityToGeoFeature(entity: DxfEntity, layerInfo?: Record<string, any>): GeoFeature | null {
    if (!this.validator.validateEntity(entity)) {
      const errors = this.validator.getErrors();
      errors.forEach(error => this.errorCollector.addGeneralError(error));
      return null;
    }

    try {
      const feature = entityToGeoFeature(entity, layerInfo);
      if (!feature) {
        this.errorCollector.addWarning(
          entity.type,
          entity.handle,
          'Failed to convert entity to GeoJSON feature'
        );
      }
      return feature;
    } catch (error: any) {
      this.errorCollector.addError(
        entity.type,
        entity.handle,
        `Error converting to GeoJSON: ${error?.message || error}`
      );
      return null;
    }
  }

  getErrors(): string[] {
    return this.errorCollector.getErrors();
  }

  getWarnings(): string[] {
    return this.errorCollector.getWarnings();
  }

  clear() {
    this.errorCollector.clear();
    this.validator.clear();
  }
}
