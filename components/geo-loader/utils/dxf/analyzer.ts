import { DxfData, DxfEntity, Vector3, isDxfEntity } from './types';

interface AnalysisResult {
  isValid: boolean;
  warnings: AnalysisWarning[];
  errors: AnalysisError[];
  stats: AnalysisStats;
}

interface AnalysisWarning {
  type: string;
  message: string;
  entity?: {
    type: string;
    handle?: string;
    layer?: string;
  };
}

interface AnalysisError {
  type: string;
  message: string;
  entity?: {
    type: string;
    handle?: string;
    layer?: string;
  };
  isCritical: boolean;
}

interface AnalysisStats {
  totalEntities: number;
  validEntities: number;
  skippedEntities: number;
  entitiesByType: Record<string, number>;
  entitiesByLayer: Record<string, number>;
  layers: string[];
  blocks: string[];
  lineTypes: string[];
  textStyles: string[];
}

export class DxfAnalyzer {
  private warnings: AnalysisWarning[] = [];
  private errors: AnalysisError[] = [];
  private stats: AnalysisStats = {
    totalEntities: 0,
    validEntities: 0,
    skippedEntities: 0,
    entitiesByType: {},
    entitiesByLayer: {},
    layers: [],
    blocks: [],
    lineTypes: [],
    textStyles: []
  };

  analyze(dxfData: DxfData): AnalysisResult {
    this.reset();
    
    // Analyze basic structure
    this.analyzeStructure(dxfData);
    
    // Analyze entities
    dxfData.entities.forEach(entity => {
      this.analyzeEntity(entity);
    });

    // Analyze blocks
    if (dxfData.blocks) {
      Object.entries(dxfData.blocks).forEach(([name, block]) => {
        this.stats.blocks.push(name);
        block.entities.forEach(entity => {
          this.analyzeEntity(entity, true);
        });
      });
    }

    return {
      isValid: this.errors.filter(e => e.isCritical).length === 0,
      warnings: this.warnings,
      errors: this.errors,
      stats: this.stats
    };
  }

  private reset() {
    this.warnings = [];
    this.errors = [];
    this.stats = {
      totalEntities: 0,
      validEntities: 0,
      skippedEntities: 0,
      entitiesByType: {},
      entitiesByLayer: {},
      layers: [],
      blocks: [],
      lineTypes: [],
      textStyles: []
    };
  }

  private analyzeStructure(dxfData: DxfData) {
    // Check for required sections
    if (!dxfData.entities) {
      this.errors.push({
        type: 'MISSING_SECTION',
        message: 'DXF data is missing entities section',
        isCritical: true
      });
    }

    // Analyze layers
    if (dxfData.tables?.layer?.layers) {
      this.stats.layers = Object.keys(dxfData.tables.layer.layers);
    } else {
      this.warnings.push({
        type: 'MISSING_LAYERS',
        message: 'DXF data is missing layer definitions'
      });
    }
  }

  private analyzeEntity(entity: DxfEntity, isInBlock: boolean = false) {
    if (!isDxfEntity(entity)) {
      this.errors.push({
        type: 'INVALID_ENTITY',
        message: 'Invalid entity structure',
        entity: { type: (entity as any)?.type || 'UNKNOWN' },
        isCritical: false
      });
      this.stats.skippedEntities++;
      return;
    }

    this.stats.totalEntities++;
    this.stats.entitiesByType[entity.type] = (this.stats.entitiesByType[entity.type] || 0) + 1;
    
    if (entity.layer) {
      this.stats.entitiesByLayer[entity.layer] = (this.stats.entitiesByLayer[entity.layer] || 0) + 1;
    }

    if (entity.lineType && !this.stats.lineTypes.includes(entity.lineType)) {
      this.stats.lineTypes.push(entity.lineType);
    }

    // Entity-specific validation
    switch (entity.type) {
      case 'LINE':
        this.validateLine(entity);
        break;
      case 'POLYLINE':
      case 'LWPOLYLINE':
        this.validatePolyline(entity);
        break;
      case 'TEXT':
      case 'MTEXT':
        this.validateText(entity);
        break;
      case 'CIRCLE':
        this.validateCircle(entity);
        break;
      case 'ARC':
        this.validateArc(entity);
        break;
      case 'ELLIPSE':
        this.validateEllipse(entity);
        break;
      case 'INSERT':
        this.validateInsert(entity);
        break;
      case 'SPLINE':
        this.validateSpline(entity);
        break;
    }

    this.stats.validEntities++;
  }

  private getDistance(p1: Vector3, p2: Vector3): number {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dz = (p2.z ?? 0) - (p1.z ?? 0); // Handle optional z coordinates
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  private validateLine(entity: DxfEntity & { start: Vector3; end: Vector3 }) {
    const length = this.getDistance(entity.start, entity.end);

    if (length < 1e-6) {
      this.warnings.push({
        type: 'ZERO_LENGTH_LINE',
        message: 'Line has zero or near-zero length',
        entity: {
          type: entity.type,
          handle: entity.handle,
          layer: entity.layer
        }
      });
    }
  }

  private validatePolyline(entity: DxfEntity & { vertices: Vector3[] }) {
    if (entity.vertices.length < 2) {
      this.warnings.push({
        type: 'INVALID_POLYLINE',
        message: 'Polyline has less than 2 vertices',
        entity: {
          type: entity.type,
          handle: entity.handle,
          layer: entity.layer
        }
      });
    }

    // Check for self-intersections
    if (entity.vertices.length > 3) {
      const intersections = this.findSelfIntersections(entity.vertices);
      if (intersections > 0) {
        this.warnings.push({
          type: 'SELF_INTERSECTING_POLYLINE',
          message: `Polyline has ${intersections} self-intersection(s)`,
          entity: {
            type: entity.type,
            handle: entity.handle,
            layer: entity.layer
          }
        });
      }
    }
  }

  private validateText(entity: DxfEntity & { text: string }) {
    if (!entity.text.trim()) {
      this.warnings.push({
        type: 'EMPTY_TEXT',
        message: 'Text entity has no content',
        entity: {
          type: entity.type,
          handle: entity.handle,
          layer: entity.layer
        }
      });
    }

    // Check for non-ASCII characters that might indicate encoding issues
    if (/[^\x00-\x7F]/.test(entity.text)) {
      this.warnings.push({
        type: 'NON_ASCII_TEXT',
        message: 'Text contains non-ASCII characters which may have encoding issues',
        entity: {
          type: entity.type,
          handle: entity.handle,
          layer: entity.layer
        }
      });
    }
  }

  private validateCircle(entity: DxfEntity & { radius: number }) {
    if (entity.radius <= 0) {
      this.warnings.push({
        type: 'INVALID_RADIUS',
        message: 'Circle has zero or negative radius',
        entity: {
          type: entity.type,
          handle: entity.handle,
          layer: entity.layer
        }
      });
    }
  }

  private validateArc(entity: DxfEntity & { radius: number; startAngle: number; endAngle: number }) {
    if (entity.radius <= 0) {
      this.warnings.push({
        type: 'INVALID_RADIUS',
        message: 'Arc has zero or negative radius',
        entity: {
          type: entity.type,
          handle: entity.handle,
          layer: entity.layer
        }
      });
    }

    if (entity.startAngle === entity.endAngle) {
      this.warnings.push({
        type: 'ZERO_LENGTH_ARC',
        message: 'Arc has zero length (start angle equals end angle)',
        entity: {
          type: entity.type,
          handle: entity.handle,
          layer: entity.layer
        }
      });
    }
  }

  private validateEllipse(entity: DxfEntity & { 
    majorAxis: Vector3; 
    minorAxisRatio: number;
    startAngle: number;
    endAngle: number;
  }) {
    const majorAxisLength = Math.sqrt(
      entity.majorAxis.x * entity.majorAxis.x + 
      entity.majorAxis.y * entity.majorAxis.y + 
      (entity.majorAxis.z ?? 0) * (entity.majorAxis.z ?? 0) // Handle optional z coordinate
    );

    if (majorAxisLength < 1e-6) {
      this.warnings.push({
        type: 'INVALID_ELLIPSE',
        message: 'Ellipse has zero or near-zero major axis length',
        entity: {
          type: entity.type,
          handle: entity.handle,
          layer: entity.layer
        }
      });
    }

    if (entity.minorAxisRatio <= 0 || entity.minorAxisRatio > 1) {
      this.warnings.push({
        type: 'INVALID_MINOR_AXIS_RATIO',
        message: 'Ellipse has invalid minor axis ratio',
        entity: {
          type: entity.type,
          handle: entity.handle,
          layer: entity.layer
        }
      });
    }
  }

  private validateInsert(entity: DxfEntity & { 
    name: string;
    rows?: number;
    columns?: number;
    rowSpacing?: number;
    colSpacing?: number;
  }) {
    if (entity.rows !== undefined && entity.rows <= 0) {
      this.warnings.push({
        type: 'INVALID_ROWS',
        message: 'Insert has invalid row count',
        entity: {
          type: entity.type,
          handle: entity.handle,
          layer: entity.layer
        }
      });
    }

    if (entity.columns !== undefined && entity.columns <= 0) {
      this.warnings.push({
        type: 'INVALID_COLUMNS',
        message: 'Insert has invalid column count',
        entity: {
          type: entity.type,
          handle: entity.handle,
          layer: entity.layer
        }
      });
    }
  }

  private validateSpline(entity: DxfEntity & {
    degree?: number;
    controlPoints: Vector3[];
    knots?: number[];
    weights?: number[];
  }) {
    if (entity.degree !== undefined && entity.degree < 1) {
      this.warnings.push({
        type: 'INVALID_SPLINE_DEGREE',
        message: 'Spline has invalid degree',
        entity: {
          type: entity.type,
          handle: entity.handle,
          layer: entity.layer
        }
      });
    }

    if (entity.controlPoints.length < 2) {
      this.warnings.push({
        type: 'INVALID_CONTROL_POINTS',
        message: 'Spline has insufficient control points',
        entity: {
          type: entity.type,
          handle: entity.handle,
          layer: entity.layer
        }
      });
    }
  }

  private findSelfIntersections(vertices: Vector3[]): number {
    let intersections = 0;
    for (let i = 0; i < vertices.length - 1; i++) {
      for (let j = i + 2; j < vertices.length - 1; j++) {
        if (this.lineSegmentsIntersect(
          vertices[i],
          vertices[i + 1],
          vertices[j],
          vertices[j + 1]
        )) {
          intersections++;
        }
      }
    }
    return intersections;
  }

  private lineSegmentsIntersect(
    p1: Vector3,
    p2: Vector3,
    p3: Vector3,
    p4: Vector3
  ): boolean {
    const ccw = (A: Vector3, B: Vector3, C: Vector3) => {
      return (C.y - A.y) * (B.x - A.x) > (B.y - A.y) * (C.x - A.x);
    };

    return ccw(p1, p3, p4) !== ccw(p2, p3, p4) && 
           ccw(p1, p2, p3) !== ccw(p1, p2, p4);
  }
}

export const createDxfAnalyzer = () => new DxfAnalyzer();
