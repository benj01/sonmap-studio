// components/geo-loader/loaders/dxf.ts

import DxfParser from 'dxf-parser';
import { GeoFileLoader, LoaderOptions, LoaderResult, GeoFeature, GeoFeatureCollection, AnalyzeResult } from '../../../types/geo';
import { COORDINATE_SYSTEMS } from '../utils/coordinate-systems';
import { createTransformer, suggestCoordinateSystem } from '../utils/coordinate-utils';
import {
  createPointGeometry,
  createLineStringGeometry,
  createPolygonGeometry,
  createMultiPointGeometry, // potentially useful if needed
  createMultiLineStringGeometry, // potentially useful if needed
  createMultiPolygonGeometry, // potentially useful if needed
  createFeature
} from '../utils/geometry-utils';

// Matrix type for transformations
type Matrix4 = [
  [number, number, number, number],
  [number, number, number, number],
  [number, number, number, number],
  [number, number, number, number]
];

// Basic vector interfaces
interface Vector2 {
  x: number;
  y: number;
}

interface Vector3 extends Vector2 {
  z: number;
}

// DXF specific interfaces
interface DxfEntity {
  type: string;
  layer?: string;
  handle?: string;
  color?: number;
  colorRGB?: number;
  lineType?: string;
  lineWeight?: number;
  elevation?: number;
  thickness?: number;
  extrusionDirection?: Vector3;
  visible?: boolean;
}

interface DxfPoint extends DxfEntity {
  type: 'POINT';
  position: Vector3;
}

interface DxfLine extends DxfEntity {
  type: 'LINE';
  start: Vector3;
  end: Vector3;
}

interface DxfPolyline extends DxfEntity {
  type: 'POLYLINE' | 'LWPOLYLINE';
  vertices: Vector3[];
  closed?: boolean;
}

interface DxfCircle extends DxfEntity {
  type: 'CIRCLE';
  center: Vector3;
  radius: number;
}

interface DxfArc extends DxfCircle {
  type: 'ARC';
  startAngle: number;
  endAngle: number;
}

interface DxfEllipse extends DxfEntity {
  type: 'ELLIPSE';
  center: Vector3;
  majorAxis: Vector3;
  minorAxisRatio: number;
  startAngle: number;
  endAngle: number;
}

interface DxfSpline extends DxfEntity {
  type: 'SPLINE';
  degree: number;
  controlPoints: Vector3[];
  knots: number[];
  weights?: number[];
  fitPoints?: Vector3[];
}

interface DxfBlock {
  name: string;
  position: Vector3;
  entities: DxfEntity[];
  layer: string;
}

interface DxfInsert extends DxfEntity {
  type: 'INSERT';
  name: string;
  position: Vector3;
  scale?: Vector3;
  rotation?: number;
  columns?: number;
  rows?: number;
  colSpacing?: number;
  rowSpacing?: number;
}

interface LayerInfo {
  name: string;
  color?: number;
  colorRGB?: number;
  lineType?: string;
  lineWeight?: number;
  frozen?: boolean;
  locked?: boolean;
  visible?: boolean;
}

class CustomDxfParser extends DxfParser {
  constructor() {
    super();
    (this as any).parseBoolean = (str: string | number | boolean): boolean => {
      if (str === undefined || str === null) {
        return false;
      }
      if (typeof str === 'boolean') return str;
      if (typeof str === 'number') return str !== 0;
      if (typeof str === 'string') {
        const normalized = str.toLowerCase().trim();
        if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
        if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
        const num = parseFloat(normalized);
        return !isNaN(num) && num > 0;
      }
      return false;
    };
  }
}

export class DxfLoader implements GeoFileLoader {
  private parser: CustomDxfParser;
  private blocks: Record<string, DxfBlock>;
  private layers: Map<string, LayerInfo>;

  constructor() {
    this.parser = new CustomDxfParser();
    this.blocks = {};
    this.layers = new Map();
  }

  async canLoad(file: File): Promise<boolean> {
    return file.name.toLowerCase().endsWith('.dxf');
  }

  private async readFileContent(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read file content'));
      reader.readAsText(file);
    });
  }

  private parseContent(content: string): any {
    try {
      const dxf = this.parser.parseSync(content);
      this.blocks = this.extractBlocks(dxf);
      this.layers = this.extractLayers(dxf);
      return dxf;
    } catch (error) {
      console.error('Error parsing DXF content:', error);
      throw new Error('Error parsing DXF content');
    }
  }

  private extractBlocks(dxf: any): Record<string, DxfBlock> {
    const blocks: Record<string, DxfBlock> = {};
    try {
      if (dxf.blocks) {
        Object.entries(dxf.blocks).forEach(([name, block]: [string, any]) => {
          if (block.entities) {
            blocks[name] = {
              name,
              position: block.position || { x: 0, y: 0, z: 0 },
              entities: block.entities,
              layer: block.layer || '0'
            };
          }
        });
      }
    } catch (error) {
      console.warn('Error extracting blocks:', error);
    }
    return blocks;
  }

  private extractLayers(dxf: any): Map<string, LayerInfo> {
    const layers = new Map<string, LayerInfo>();
    
    try {
      // First pass: extract layers from tables
      if (dxf.tables?.layer?.layers) {
        Object.entries(dxf.tables.layer.layers).forEach(([name, layer]: [string, any]) => {
          layers.set(name, {
            name,
            color: layer.color,
            colorRGB: layer.colorRGB,
            lineType: layer.lineType,
            lineWeight: layer.lineWeight,
            frozen: Boolean(layer.flags & 1),
            locked: Boolean(layer.flags & 4),
            visible: !(layer.flags & 1)
          });
        });
      }

      // Second pass: collect layers from entities
      if (Array.isArray(dxf.entities)) {
        dxf.entities.forEach((entity: any) => {
          if (entity.layer && !layers.has(entity.layer)) {
            layers.set(entity.layer, {
              name: entity.layer,
              visible: true
            });
          }
        });
      }

      // Ensure default layer exists
      if (!layers.has('0')) {
        layers.set('0', {
          name: '0',
          color: 7, // White in AutoCAD color index
          visible: true
        });
      }
    } catch (error) {
      console.warn('Error extracting layers:', error);
      if (!layers.has('0')) {
        layers.set('0', { name: '0', visible: true });
      }
    }

    return layers;
  }

  private expandBlockReferences(dxf: any): DxfEntity[] {
    const expandedEntities: DxfEntity[] = [];

    const processEntity = (entity: any, transformMatrix?: Matrix4): void => {
      if (entity.type === 'INSERT') {
        const block = this.blocks[entity.name];
        if (block) {
          const blockTransform = this.calculateBlockTransform(entity);
          const finalTransform = transformMatrix 
            ? this.combineTransforms(transformMatrix, blockTransform)
            : blockTransform;

          // Handle arrays (rows/columns) in INSERT
          const rowCount = entity.rows || 1;
          const colCount = entity.columns || 1;
          const rowSpacing = entity.rowSpacing || 0;
          const colSpacing = entity.colSpacing || 0;

          for (let row = 0; row < rowCount; row++) {
            for (let col = 0; col < colCount; col++) {
              // Calculate offset for array placement
              const offsetTransform = this.createTranslationMatrix(
                col * colSpacing,
                row * rowSpacing,
                0
              );
              const instanceTransform = this.combineTransforms(finalTransform, offsetTransform);

              // Process all entities in the block
              block.entities.forEach(blockEntity => {
                processEntity(blockEntity, instanceTransform);
              });
            }
          }
        }
      } else {
        // Transform the entity if needed
        const transformedEntity = transformMatrix 
          ? this.transformEntity(entity, transformMatrix)
          : entity;
        expandedEntities.push(transformedEntity);
      }
    };

    dxf.entities.forEach((entity: any) => processEntity(entity));
    return expandedEntities;
  }

  private calculateBlockTransform(insert: DxfInsert): Matrix4 {
    // Create transformation matrix for block insertion
    let matrix = this.createIdentityMatrix();
    
    // Apply translation
    matrix = this.combineTransforms(matrix, 
      this.createTranslationMatrix(insert.position.x, insert.position.y, insert.position.z));
    
    // Apply rotation if specified
    if (insert.rotation) {
      matrix = this.combineTransforms(matrix, 
        this.createRotationMatrix(insert.rotation));
    }
    
    // Apply scaling if specified
    if (insert.scale) {
      matrix = this.combineTransforms(matrix, 
        this.createScaleMatrix(insert.scale.x, insert.scale.y, insert.scale.z));
    }
    
    return matrix;
  }

  // Basic 4x4 matrix operations for transformations
  private createIdentityMatrix(): Matrix4 {
    return [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1]
    ];
  }

  private createTranslationMatrix(x: number, y: number, z: number): Matrix4 {
    return [
      [1, 0, 0, x],
      [0, 1, 0, y],
      [0, 0, 1, z],
      [0, 0, 0, 1]
    ];
  }

  private createRotationMatrix(angleInDegrees: number): Matrix4 {
    const angle = (angleInDegrees * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return [
      [cos, -sin, 0, 0],
      [sin, cos, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1]
    ];
  }

  private createScaleMatrix(x: number, y: number, z: number): Matrix4 {
    return [
      [x, 0, 0, 0],
      [0, y, 0, 0],
      [0, 0, z, 0],
      [0, 0, 0, 1]
    ];
  }

  private transformEntity(entity: DxfEntity, matrix: Matrix4): DxfEntity {
    const transformPoint = (point: Vector3): Vector3 => {
      const [px, py, pz] = this.applyMatrix(matrix, [point.x, point.y, point.z, 1]);
      return { x: px, y: py, z: pz };
    };

    switch (entity.type) {
      case 'POINT':
        return {
          ...entity,
          position: transformPoint((entity as DxfPoint).position)
        };
      case 'LINE':
        const line = entity as DxfLine;
        return {
          ...entity,
          start: transformPoint(line.start),
          end: transformPoint(line.end)
        };
      case 'POLYLINE':
      case 'LWPOLYLINE':
        const poly = entity as DxfPolyline;
        return {
          ...entity,
          vertices: poly.vertices.map(transformPoint)
        };
      case 'CIRCLE':
        const circle = entity as DxfCircle;
        return {
          ...entity,
          center: transformPoint(circle.center),
          radius: circle.radius * this.getScaleFactor(matrix)
        };
      case 'ARC':
        const arc = entity as DxfArc;
        return {
          ...entity,
          center: transformPoint(arc.center),
          radius: arc.radius * this.getScaleFactor(matrix),
          startAngle: this.transformAngle(arc.startAngle, matrix),
          endAngle: this.transformAngle(arc.endAngle, matrix)
        };
      case 'ELLIPSE':
        const ellipse = entity as DxfEllipse;
        return {
          ...entity,
          center: transformPoint(ellipse.center),
          majorAxis: this.transformVector(ellipse.majorAxis, matrix),
          minorAxisRatio: ellipse.minorAxisRatio,
          startAngle: this.transformAngle(ellipse.startAngle, matrix),
          endAngle: this.transformAngle(ellipse.endAngle, matrix)
        };
      case 'SPLINE':
        const spline = entity as DxfSpline;
        return {
          ...entity,
          controlPoints: spline.controlPoints.map(transformPoint),
          fitPoints: spline.fitPoints?.map(transformPoint)
        };
      default:
        return entity;
    }
  }

  private applyMatrix(matrix: Matrix4, point: [number, number, number, number]): [number, number, number] {
    const result: [number, number, number, number] = [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) {
      result[i] = matrix[i][0] * point[0] +
                  matrix[i][1] * point[1] +
                  matrix[i][2] * point[2] +
                  matrix[i][3] * point[3];
    }
    return [
      result[0] / result[3],
      result[1] / result[3],
      result[2] / result[3]
    ];
  }

  private getScaleFactor(matrix: Matrix4): number {
    // Calculate the average scale factor from the matrix
    const scaleX = Math.sqrt(matrix[0][0] * matrix[0][0] + matrix[0][1] * matrix[0][1] + matrix[0][2] * matrix[0][2]);
    const scaleY = Math.sqrt(matrix[1][0] * matrix[1][0] + matrix[1][1] * matrix[1][1] + matrix[1][2] * matrix[1][2]);
    return (scaleX + scaleY) / 2;
  }

  private transformAngle(angle: number, matrix: Matrix4): number {
    // Extract rotation from transformation matrix
    const rotationRad = Math.atan2(matrix[1][0], matrix[0][0]);
    const rotationDeg = (rotationRad * 180) / Math.PI;
    return (angle + rotationDeg) % 360;
  }

  private transformVector(vector: Vector3, matrix: Matrix4): Vector3 {
    const [x, y, z] = this.applyMatrix(matrix, [vector.x, vector.y, vector.z, 0]);
    return { x, y, z };
  }

  private entityToGeoFeature(entity: DxfEntity): GeoFeature | null {
    try {
      const geometry = this.entityToGeometry(entity);
      if (!geometry) return null;

      return createFeature(geometry, this.extractEntityProperties(entity));
    } catch (error) {
      console.warn(`Error converting entity to feature: ${error}`);
      return null;
    }
  }

  private extractEntityProperties(entity: DxfEntity): Record<string, any> {
    const layer = this.layers.get(entity.layer || '0');
    return {
      id: entity.handle,
      type: entity.type,
      layer: entity.layer || '0',
      color: entity.color ?? layer?.color,
      colorRGB: entity.colorRGB ?? layer?.colorRGB,
      lineType: entity.lineType ?? layer?.lineType,
      lineWeight: entity.lineWeight ?? layer?.lineWeight,
      elevation: entity.elevation,
      thickness: entity.thickness,
      visible: entity.visible ?? layer?.visible,
      extrusionDirection: entity.extrusionDirection
    };
  }

  private entityToGeometry(entity: DxfEntity): GeoFeature['geometry'] | null {
    switch (entity.type) {
      case 'POINT':
        const p = entity as DxfPoint;
        return createPointGeometry(p.position.x, p.position.y, isNaN(p.position.z) ? undefined : p.position.z);
      case 'LINE':
        const l = entity as DxfLine;
        return createLineStringGeometry([
          [l.start.x, l.start.y],
          [l.end.x, l.end.y]
        ]);
      case 'POLYLINE':
      case 'LWPOLYLINE':
        const poly = entity as DxfPolyline;
        const coordinates = poly.vertices.map(v => [v.x, v.y] as [number, number]);
        if (poly.closed && coordinates.length >= 3) {
          // Ensure closure
          const first = coordinates[0];
          const last = coordinates[coordinates.length - 1];
          if (first[0] !== last[0] || first[1] !== last[1]) {
            coordinates.push([first[0], first[1]]);
          }
          return createPolygonGeometry([coordinates]);
        } else {
          return createLineStringGeometry(coordinates);
        }
      case 'CIRCLE':
        // Approximate circle as polygon
        const c = entity as DxfCircle;
        const circleCoords: [number, number][] = [];
        const circleSegments = 64;
        for (let i = 0; i <= circleSegments; i++) {
          const angle = (i * 2 * Math.PI) / circleSegments;
          circleCoords.push([
            c.center.x + c.radius * Math.cos(angle),
            c.center.y + c.radius * Math.sin(angle)
          ]);
        }
        return createPolygonGeometry([circleCoords]);
      case 'ARC':
        const a = entity as DxfArc;
        const arcCoords: [number, number][] = [];
        const arcSegments = 32;
        let startAngle = (a.startAngle * Math.PI) / 180;
        let endAngle = (a.endAngle * Math.PI) / 180;
        if (endAngle <= startAngle) {
          endAngle += 2 * Math.PI;
        }
        const angleIncrement = (endAngle - startAngle) / arcSegments;
        for (let i = 0; i <= arcSegments; i++) {
          const angle = startAngle + i * angleIncrement;
          arcCoords.push([
            a.center.x + a.radius * Math.cos(angle),
            a.center.y + a.radius * Math.sin(angle)
          ]);
        }
        return createLineStringGeometry(arcCoords);
      case 'ELLIPSE':
        const e = entity as DxfEllipse;
        const ellipseCoords: [number, number][] = [];
        const ellipseSegments = 64;
        const majorLength = Math.sqrt(e.majorAxis.x * e.majorAxis.x + e.majorAxis.y * e.majorAxis.y);
        const rotation = Math.atan2(e.majorAxis.y, e.majorAxis.x);
        let startA = e.startAngle;
        let endA = e.endAngle;
        if (endA <= startA) {
          endA += 2 * Math.PI;
        }
        const ellipseAngleIncrement = (endA - startA) / ellipseSegments;
        for (let i = 0; i <= ellipseSegments; i++) {
          const angle = startA + (i * ellipseAngleIncrement);
          const cosAngle = Math.cos(angle);
          const sinAngle = Math.sin(angle);
          const x = majorLength * cosAngle;
          const y = majorLength * e.minorAxisRatio * sinAngle;
          const rotatedX = x * Math.cos(rotation) - y * Math.sin(rotation);
          const rotatedY = x * Math.sin(rotation) + y * Math.cos(rotation);
          ellipseCoords.push([
            e.center.x + rotatedX,
            e.center.y + rotatedY
          ]);
        }
        return createLineStringGeometry(ellipseCoords);
      case 'SPLINE':
        const s = entity as DxfSpline;
        // Just connect control points for now
        const splineCoords = s.controlPoints.map(p => [p.x, p.y] as [number, number]);
        return createLineStringGeometry(splineCoords);
      default:
        return null;
    }
  }

  async analyze(file: File): Promise<AnalyzeResult> {
    const content = await this.readFileContent(file);
    const dxf = this.parseContent(content);
    
    // Expand all block references
    const expandedEntities = this.expandBlockReferences(dxf);
    
    // Collect some sample points to guess CRS
    const samplePoints = this.collectPoints(expandedEntities);
    const coordinateSystem = suggestCoordinateSystem(samplePoints);

    const bounds = this.calculateBounds(expandedEntities);
    const preview = this.generatePreview(expandedEntities);

    return {
      layers: Array.from(this.layers.keys()),
      bounds,
      preview,
      coordinateSystem
    };
  }

  private collectPoints(entities: DxfEntity[]): { x: number; y: number; }[] {
    const points: { x: number; y: number; }[] = [];

    entities.forEach(entity => {
      switch (entity.type) {
        case 'POINT':
          points.push((entity as DxfPoint).position);
          break;
        case 'LINE':
          const line = entity as DxfLine;
          points.push(line.start, line.end);
          break;
        case 'POLYLINE':
        case 'LWPOLYLINE':
          points.push(...(entity as DxfPolyline).vertices);
          break;
        case 'CIRCLE':
        case 'ARC':
          points.push((entity as DxfCircle).center);
          break;
        case 'ELLIPSE':
          points.push((entity as DxfEllipse).center);
          break;
        case 'SPLINE':
          points.push(...(entity as DxfSpline).controlPoints);
          break;
      }
    });

    return points;
  }

  private calculateBounds(entities: DxfEntity[]): { minX: number; minY: number; maxX: number; maxY: number } {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    const updateBounds = (x: number, y: number) => {
      if (isFinite(x) && isFinite(y)) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    };

    this.collectPoints(entities).forEach(point => {
      updateBounds(point.x, point.y);
    });

    if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
      return { minX: -180, minY: -90, maxX: 180, maxY: 90 };
    }

    return { minX, minY, maxX, maxY };
  }

  private generatePreview(entities: DxfEntity[]): GeoFeatureCollection {
    const features = entities.map(entity => this.entityToGeoFeature(entity))
      .filter((feature): feature is GeoFeature => feature !== null);
    
    // Take a representative sample of each geometry type
    const pointFeatures = features.filter(f => f.geometry.type === 'Point');
    const lineFeatures = features.filter(f => f.geometry.type === 'LineString');
    const polygonFeatures = features.filter(f => f.geometry.type === 'Polygon');

    const selectedFeatures = [
      ...pointFeatures.slice(0, 500),
      ...lineFeatures.slice(0, 250),
      ...polygonFeatures.slice(0, 250)
    ];

    return {
      type: 'FeatureCollection',
      features: selectedFeatures
    };
  }

  async load(file: File, options: LoaderOptions): Promise<LoaderResult> {
    const content = await this.readFileContent(file);
    const dxf = this.parseContent(content);
    
    const expandedEntities = this.expandBlockReferences(dxf);
    const selectedLayers = options.selectedLayers || [];

    // Determine source coordinate system via sample points
    const samplePoints = this.collectPoints(expandedEntities);
    let sourceSystem = options.coordinateSystem;
    if (!sourceSystem) {
      sourceSystem = suggestCoordinateSystem(samplePoints);
    }

    let transformer: ReturnType<typeof createTransformer> | null = null;
    if (sourceSystem !== COORDINATE_SYSTEMS.WGS84) {
      transformer = createTransformer(sourceSystem, COORDINATE_SYSTEMS.WGS84);
    }

    const features = expandedEntities
      .filter(entity => selectedLayers.length === 0 || selectedLayers.includes(entity.layer || '0'))
      .map(entity => this.entityToGeoFeature(entity))
      .filter((feature): feature is GeoFeature => feature !== null);

    const bounds = this.calculateBounds(expandedEntities);
    const layers = Array.from(this.layers.keys());
    const coordinateSystem = COORDINATE_SYSTEMS.WGS84; // after transform if any

    const statistics = {
      featureCount: features.length,
      layerCount: layers.length,
      featureTypes: features.reduce((acc: Record<string, number>, feature) => {
        const type = feature.geometry.type;
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {})
    };

    return {
      features,
      bounds,
      layers,
      coordinateSystem,
      statistics
    };
  }

  // Matrix combination utility
  private combineTransforms(a: Matrix4, b: Matrix4): Matrix4 {
    const result: Matrix4 = [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,1]];
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        result[i][j] = a[i][0]*b[0][j] + a[i][1]*b[1][j] + a[i][2]*b[2][j] + a[i][3]*b[3][j];
      }
    }
    return result;
  }
}

export default new DxfLoader();
