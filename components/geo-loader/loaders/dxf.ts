import { GeoFileLoader, LoaderOptions, LoaderResult, GeoFeature, AnalyzeResult } from '../../../types/geo';
import { CoordinateTransformer } from '../utils/coordinate-utils';
import { COORDINATE_SYSTEMS } from '../utils/coordinate-systems';
import { createDxfParser } from '../utils/dxf-parser';

const PREVIEW_CHUNK_SIZE = 1000;

interface Vector2 {
  x: number;
  y: number;
}

interface Vector3 extends Vector2 {
  z?: number;
}

interface DxfEntityBase {
  type: string;
  layer?: string;
  handle?: string;
}

type DxfPointEntity = DxfEntityBase & {
  type: 'POINT';
  position: Vector3;
};

type DxfLineEntity = DxfEntityBase & {
  type: 'LINE';
  start: Vector3;
  end: Vector3;
};

type DxfPolylineEntity = DxfEntityBase & {
  type: 'POLYLINE' | 'LWPOLYLINE';
  vertices: Vector3[];
  closed?: boolean;
};

type DxfCircleEntity = DxfEntityBase & {
  type: 'CIRCLE' | 'ARC';
  center: Vector3;
  radius: number;
  startAngle?: number;
  endAngle?: number;
};

type DxfEllipseEntity = DxfEntityBase & {
  type: 'ELLIPSE';
  center: Vector3;
  majorAxis: Vector3;
  minorAxisRatio: number;
  startAngle: number;
  endAngle: number;
};

type DxfEntity = DxfPointEntity | DxfLineEntity | DxfPolylineEntity | DxfCircleEntity | DxfEllipseEntity;

interface Point2D {
  x: number;
  y: number;
}

function isPoint2D(value: unknown): value is Point2D {
  if (!value || typeof value !== 'object') return false;
  const point = value as any;
  return typeof point.x === 'number' && typeof point.y === 'number';
}

function isDxfPointEntity(entity: unknown): entity is DxfPointEntity {
  if (!entity || typeof entity !== 'object') return false;
  const e = entity as any;
  return e.type === 'POINT' && e.position && isPoint2D(e.position);
}

class DxfLoader implements GeoFileLoader {
  private parser = createDxfParser();

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

  async analyze(file: File): Promise<AnalyzeResult> {
    try {
      const content = await this.readFileContent(file);
      const dxf = this.parser.parse(content);
      
      if (!dxf || !dxf.entities) {
        throw new Error('Invalid DXF file structure');
      }

      const expandedEntities = this.parser.expandBlockReferences(dxf);
      
      // Extract points for coordinate system detection
      const points: Point2D[] = [];
      for (const entity of expandedEntities) {
        if (isDxfPointEntity(entity)) {
          points.push({
            x: entity.position.x,
            y: entity.position.y
          });
          if (points.length >= 5) break;
        }
      }

      // Default to WGS84 if no clear pattern is detected
      const coordinateSystem = COORDINATE_SYSTEMS.WGS84;

      // Calculate bounds from all entities
      const bounds = this.calculateBounds(expandedEntities);

      // Generate preview features
      const previewFeatures: GeoFeature[] = [];
      for (const entity of expandedEntities) {
        if (this.isValidEntity(entity)) {
          const feature = this.parser.entityToGeoFeature(entity);
          if (feature) {
            previewFeatures.push(feature);
            if (previewFeatures.length >= PREVIEW_CHUNK_SIZE) break;
          }
        }
      }

      return {
        layers: this.parser.getLayers(),
        coordinateSystem,
        bounds,
        preview: {
          type: 'FeatureCollection',
          features: previewFeatures
        }
      };
    } catch (err) {
      const error = err as Error;
      console.error('DXF analysis error:', error);
      throw new Error(`Failed to analyze DXF file: ${error.message}`);
    }
  }

  private isValidEntity(entity: unknown): entity is DxfEntity {
    if (!entity || typeof entity !== 'object') return false;
    const e = entity as any;
    
    switch (e.type) {
      case 'POINT':
        return isDxfPointEntity(e);
      case 'LINE':
        return e.start && e.end && isPoint2D(e.start) && isPoint2D(e.end);
      case 'POLYLINE':
      case 'LWPOLYLINE':
        return Array.isArray(e.vertices) && e.vertices.every((v: unknown) => isPoint2D(v));
      case 'CIRCLE':
      case 'ARC':
        return e.center && isPoint2D(e.center) && typeof e.radius === 'number';
      case 'ELLIPSE':
        return e.center && e.majorAxis && 
               isPoint2D(e.center) && isPoint2D(e.majorAxis) &&
               typeof e.minorAxisRatio === 'number';
      default:
        return false;
    }
  }

  private calculateBounds(entities: unknown[]): { minX: number; minY: number; maxX: number; maxY: number } {
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    const updateBounds = (x: number, y: number) => {
      if (typeof x === 'number' && typeof y === 'number' && isFinite(x) && isFinite(y)) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    };

    entities.forEach(entity => {
      if (!this.isValidEntity(entity)) return;

      switch (entity.type) {
        case 'POINT':
          updateBounds(entity.position.x, entity.position.y);
          break;
        case 'LINE':
          updateBounds(entity.start.x, entity.start.y);
          updateBounds(entity.end.x, entity.end.y);
          break;
        case 'POLYLINE':
        case 'LWPOLYLINE':
          entity.vertices.forEach(v => updateBounds(v.x, v.y));
          break;
        case 'CIRCLE':
        case 'ARC':
          updateBounds(entity.center.x - entity.radius, entity.center.y - entity.radius);
          updateBounds(entity.center.x + entity.radius, entity.center.y + entity.radius);
          break;
        case 'ELLIPSE':
          const majorLength = Math.sqrt(
            entity.majorAxis.x * entity.majorAxis.x + 
            entity.majorAxis.y * entity.majorAxis.y
          );
          updateBounds(
            entity.center.x - majorLength,
            entity.center.y - majorLength * entity.minorAxisRatio
          );
          updateBounds(
            entity.center.x + majorLength,
            entity.center.y + majorLength * entity.minorAxisRatio
          );
          break;
      }
    });

    if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
      return { minX: -180, minY: -90, maxX: 180, maxY: 90 };
    }

    return { minX, minY, maxX, maxY };
  }

  async load(file: File, options: LoaderOptions): Promise<LoaderResult> {
    try {
      const content = await this.readFileContent(file);
      const dxf = this.parser.parse(content);
      
      if (!dxf || !dxf.entities) {
        throw new Error('Invalid DXF file structure');
      }

      const expandedEntities = this.parser.expandBlockReferences(dxf);
      
      const selectedLayers = options.selectedLayers || [];
      const sourceSystem = options.coordinateSystem || COORDINATE_SYSTEMS.WGS84;
      
      let transformer: CoordinateTransformer | null = null;
      if (sourceSystem !== COORDINATE_SYSTEMS.WGS84) {
        transformer = new CoordinateTransformer(sourceSystem, COORDINATE_SYSTEMS.WGS84);
      }

      const features: GeoFeature[] = [];
      const featureTypes: Record<string, number> = {};

      for (const entity of expandedEntities) {
        if (!this.isValidEntity(entity)) continue;

        // Skip entities not in selected layers
        if (selectedLayers.length > 0 && !selectedLayers.includes(entity.layer || '0')) {
          continue;
        }

        const feature = this.parser.entityToGeoFeature(entity);
        if (feature) {
          if (transformer) {
            // Transform coordinates if needed
            try {
              feature.geometry.coordinates = this.transformCoordinates(
                feature.geometry.coordinates,
                transformer
              );
            } catch (error) {
              console.warn('Failed to transform coordinates:', error);
              continue;
            }
          }

          features.push(feature);
          
          // Count feature types
          const type = feature.geometry.type;
          featureTypes[type] = (featureTypes[type] || 0) + 1;
        }
      }

      // Calculate bounds
      let bounds = this.calculateBounds(expandedEntities);

      // Transform bounds if needed
      if (transformer) {
        try {
          bounds = transformer.transformBounds(bounds);
        } catch (error) {
          console.warn('Failed to transform bounds:', error);
        }
      }

      const layers = this.parser.getLayers();

      return {
        features,
        bounds,
        layers,
        coordinateSystem: COORDINATE_SYSTEMS.WGS84,
        statistics: {
          pointCount: features.length,
          layerCount: layers.length,
          featureTypes
        }
      };
    } catch (err) {
      const error = err as Error;
      console.error('DXF loading error:', error);
      throw new Error(`Failed to load DXF file: ${error.message}`);
    }
  }

  private transformCoordinates(coordinates: any, transformer: CoordinateTransformer): any {
    if (Array.isArray(coordinates)) {
      if (coordinates.length === 2 && typeof coordinates[0] === 'number') {
        const transformed = transformer.transform({ x: coordinates[0], y: coordinates[1] });
        return [transformed.x, transformed.y];
      }
      return coordinates.map(coord => this.transformCoordinates(coord, transformer));
    }
    return coordinates;
  }
}

export default new DxfLoader();
