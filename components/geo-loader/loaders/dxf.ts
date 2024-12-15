import DxfParser from 'dxf-parser';
import { GeoFileLoader, LoaderOptions, LoaderResult, GeoFeature, GeoFeatureCollection } from '../../../types/geo';
import { CoordinateTransformer, COORDINATE_SYSTEMS } from '../utils/coordinate-systems';

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

  constructor() {
    this.parser = new CustomDxfParser();
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
      return this.parser.parseSync(content);
    } catch (error) {
      throw new Error('Error parsing DXF content');
    }
  }

  private extractLayers(dxf: any): string[] {
    const layers = new Set<string>();
    try {
      if (dxf.tables?.layer?.layers) {
        Object.keys(dxf.tables.layer.layers).forEach((layer) => layers.add(layer));
      }
      if (Array.isArray(dxf.entities)) {
        dxf.entities.forEach((entity: any) => {
          if (entity.layer) layers.add(entity.layer);
        });
      }
    } catch {
      // Log warning if needed
    }
    return layers.size > 0 ? Array.from(layers) : ['0']; // Default layer
  }

  private collectPoints(dxf: any): { x: number; y: number }[] {
    const points: { x: number; y: number }[] = [];
    
    if (Array.isArray(dxf.entities)) {
      dxf.entities.forEach((entity: any) => {
        if (entity.vertices) {
          entity.vertices.forEach((v: any) => {
            if (v.x !== undefined && v.y !== undefined && isFinite(v.x) && isFinite(v.y)) {
              points.push({ x: v.x, y: v.y });
            }
          });
        } else if (entity.position) {
          if (isFinite(entity.position.x) && isFinite(entity.position.y)) {
            points.push({ x: entity.position.x, y: entity.position.y });
          }
        } else if (entity.start && entity.end) {
          if (isFinite(entity.start.x) && isFinite(entity.start.y)) {
            points.push({ x: entity.start.x, y: entity.start.y });
          }
          if (isFinite(entity.end.x) && isFinite(entity.end.y)) {
            points.push({ x: entity.end.x, y: entity.end.y });
          }
        }
      });
    }

    return points;
  }

  private detectCoordinateSystem(dxf: any): string {
    const points = this.collectPoints(dxf);
    if (points.length === 0) return COORDINATE_SYSTEMS.WGS84;
    
    return CoordinateTransformer.suggestCoordinateSystem(points);
  }

  private calculateBounds(dxf: any, transformer?: CoordinateTransformer): { minX: number; minY: number; maxX: number; maxY: number } {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    const updateBounds = (x: number, y: number) => {
      if (x !== undefined && y !== undefined && isFinite(x) && isFinite(y)) {
        let point = { x, y };
        if (transformer) {
          point = transformer.transform(point);
        }
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      }
    };

    if (Array.isArray(dxf.entities)) {
      dxf.entities.forEach((entity: any) => {
        if (entity.vertices) {
          entity.vertices.forEach((v: any) => updateBounds(v.x, v.y));
        } else if (entity.position) {
          updateBounds(entity.position.x, entity.position.y);
        } else if (entity.start && entity.end) {
          updateBounds(entity.start.x, entity.start.y);
          updateBounds(entity.end.x, entity.end.y);
        }
      });
    }

    // If no valid bounds were found, return a default area
    if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
      return { minX: -180, minY: -90, maxX: 180, maxY: 90 };
    }

    return { minX, minY, maxX, maxY };
  }

  private generatePreview(dxf: any, transformer?: CoordinateTransformer): GeoFeatureCollection {
    const features = this.convertToGeoFeatures(dxf, transformer);
    return {
      type: 'FeatureCollection',
      features: features.slice(0, 1000), // Limit for performance
    };
  }

  private convertToGeoFeatures(dxf: any, transformer?: CoordinateTransformer): GeoFeature[] {
    const features: GeoFeature[] = [];
    try {
      if (Array.isArray(dxf.entities)) {
        dxf.entities.forEach((entity: any) => {
          const feature = this.entityToGeoFeature(entity, transformer);
          if (feature) features.push(feature);
        });
      }
    } catch {
      // Log warning if needed
    }
    return features;
  }

  private transformPoint(point: { x: number; y: number }, transformer?: CoordinateTransformer): [number, number] {
    if (transformer) {
      const transformed = transformer.transform(point);
      return [transformed.x, transformed.y];
    }
    return [point.x, point.y];
  }

  private entityToGeoFeature(entity: any, transformer?: CoordinateTransformer): GeoFeature | null {
    if (!entity || !entity.type) return null;

    let geometry: GeoFeature['geometry'] | null = null;

    switch (entity.type) {
      case 'LINE':
        if (entity.start && entity.end) {
          const start = this.transformPoint(entity.start, transformer);
          const end = this.transformPoint(entity.end, transformer);
          geometry = {
            type: 'LineString',
            coordinates: [start, end],
          };
        }
        break;
      case 'POINT':
        if (entity.position) {
          const point = this.transformPoint(entity.position, transformer);
          geometry = {
            type: 'Point',
            coordinates: point,
          };
        }
        break;
      case 'POLYLINE':
      case 'LWPOLYLINE':
        if (entity.vertices?.length >= 3) {
          const coordinates = entity.vertices.map((v: any) => 
            this.transformPoint(v, transformer)
          );
          // Close the polygon if it's not already closed
          if (coordinates[0][0] !== coordinates[coordinates.length - 1][0] ||
              coordinates[0][1] !== coordinates[coordinates.length - 1][1]) {
            coordinates.push([coordinates[0][0], coordinates[0][1]]);
          }
          geometry = {
            type: 'Polygon',
            coordinates: [coordinates], // Polygon coordinates must be an array of linear rings
          };
        } else if (entity.vertices?.length === 2) {
          // If only 2 vertices, treat as LineString
          geometry = {
            type: 'LineString',
            coordinates: entity.vertices.map((v: any) => 
              this.transformPoint(v, transformer)
            ),
          };
        }
        break;
    }

    if (geometry) {
      return {
        type: 'Feature',
        geometry,
        properties: { 
          layer: entity.layer || '0', 
          type: entity.type,
          ...entity.properties
        },
      };
    }

    return null;
  }

  async analyze(file: File): Promise<{
    layers: string[];
    coordinateSystem?: string;
    bounds: LoaderResult['bounds'];
    preview: GeoFeatureCollection;
  }> {
    const content = await this.readFileContent(file);
    const dxf = this.parseContent(content);

    const detectedSystem = this.detectCoordinateSystem(dxf);
    const transformer = detectedSystem !== COORDINATE_SYSTEMS.WGS84 
      ? new CoordinateTransformer(detectedSystem, COORDINATE_SYSTEMS.WGS84)
      : undefined;

    const layers = this.extractLayers(dxf);
    const bounds = this.calculateBounds(dxf, transformer);
    const preview = this.generatePreview(dxf, transformer);

    return { 
      layers, 
      bounds, 
      preview,
      coordinateSystem: detectedSystem
    };
  }

  async load(file: File, options: LoaderOptions): Promise<LoaderResult> {
    const content = await this.readFileContent(file);
    const dxf = this.parseContent(content);
    
    const detectedSystem = this.detectCoordinateSystem(dxf);
    const transformer = detectedSystem !== COORDINATE_SYSTEMS.WGS84 
      ? new CoordinateTransformer(detectedSystem, COORDINATE_SYSTEMS.WGS84)
      : undefined;

    const selectedLayers = options.selectedLayers || [];
    const features = this.convertToGeoFeatures(dxf, transformer).filter(
      feature => selectedLayers.length === 0 || selectedLayers.includes(feature.properties.layer)
    );
    
    const bounds = this.calculateBounds(dxf, transformer);
    const layers = this.extractLayers(dxf);

    const statistics = {
      pointCount: features.length,
      layerCount: layers.length,
      featureTypes: features.reduce((acc: Record<string, number>, feature) => {
        const type = feature.properties.type;
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {}),
    };

    return { 
      features, 
      bounds, 
      layers,
      coordinateSystem: detectedSystem,
      statistics 
    };
  }
}

export default new DxfLoader();
