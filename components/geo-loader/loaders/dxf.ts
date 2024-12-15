import DxfParser from 'dxf-parser';
import { GeoFileLoader, LoaderOptions, LoaderResult, GeoFeature, GeoFeatureCollection } from '../../../types/geo';
import { COORDINATE_SYSTEMS } from '../utils/coordinate-systems';

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
        // Handle POINT entities
        if (entity.type === 'POINT' && entity.position) {
          if (isFinite(entity.position.x) && isFinite(entity.position.y)) {
            points.push({ x: entity.position.x, y: entity.position.y });
          }
        }
        // Handle vertices from polylines
        else if (entity.vertices) {
          entity.vertices.forEach((v: any) => {
            if (v.x !== undefined && v.y !== undefined && isFinite(v.x) && isFinite(v.y)) {
              points.push({ x: v.x, y: v.y });
            }
          });
        }
        // Handle line endpoints
        else if (entity.start && entity.end) {
          if (isFinite(entity.start.x) && isFinite(entity.start.y)) {
            points.push({ x: entity.start.x, y: entity.start.y });
          }
          if (isFinite(entity.end.x) && isFinite(entity.end.y)) {
            points.push({ x: entity.end.x, y: entity.end.y });
          }
        }
        // Handle INSERT entities (block references) which can represent points
        else if (entity.type === 'INSERT' && entity.position) {
          if (isFinite(entity.position.x) && isFinite(entity.position.y)) {
            points.push({ x: entity.position.x, y: entity.position.y });
          }
        }
      });
    }

    return points;
  }

  private detectCoordinateSystem(dxf: any): string {
    const points = this.collectPoints(dxf);
    if (points.length === 0) return COORDINATE_SYSTEMS.WGS84;
    
    // Check if points are likely in Swiss coordinates
    const sampleSize = Math.min(points.length, 10);
    const sample = points.slice(0, sampleSize);
    const isSwiss = sample.every(point => {
      const isXInRange = point.x >= 2485000 && point.x <= 2835000;
      const isYInRange = point.y >= 1075000 && point.y <= 1295000;
      return isXInRange && isYInRange;
    });

    return isSwiss ? COORDINATE_SYSTEMS.SWISS_LV95 : COORDINATE_SYSTEMS.WGS84;
  }

  private calculateBounds(dxf: any): { minX: number; minY: number; maxX: number; maxY: number } {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    const updateBounds = (x: number, y: number) => {
      if (x !== undefined && y !== undefined && isFinite(x) && isFinite(y)) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    };

    const points = this.collectPoints(dxf);
    points.forEach(point => updateBounds(point.x, point.y));

    // If no valid bounds were found, return a default area
    if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
      return { minX: -180, minY: -90, maxX: 180, maxY: 90 };
    }

    return { minX, minY, maxX, maxY };
  }

  private generatePreview(dxf: any): GeoFeatureCollection {
    const features = this.convertToGeoFeatures(dxf);
    
    // Ensure we include a good mix of each geometry type in the preview
    const pointFeatures = features.filter(f => f.geometry.type === 'Point');
    const lineFeatures = features.filter(f => f.geometry.type === 'LineString');
    const polygonFeatures = features.filter(f => f.geometry.type === 'Polygon');

    // Take up to 500 of each type to ensure good representation
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

  private convertToGeoFeatures(dxf: any): GeoFeature[] {
    const features: GeoFeature[] = [];
    try {
      if (Array.isArray(dxf.entities)) {
        dxf.entities.forEach((entity: any) => {
          const feature = this.entityToGeoFeature(entity);
          if (feature) features.push(feature);
        });
      }
    } catch (error) {
      console.error('Error converting entities to features:', error);
    }
    return features;
  }

  private transformPoint(point: { x: number; y: number }): [number, number] {
    if (!isFinite(point.x) || !isFinite(point.y)) {
      console.warn('Invalid point coordinates:', point);
      return [0, 0]; // Default to origin for invalid points
    }
    return [point.x, point.y];
  }

  private entityToGeoFeature(entity: any): GeoFeature | null {
    if (!entity || !entity.type) return null;

    let geometry: GeoFeature['geometry'] | null = null;

    switch (entity.type) {
      case 'POINT':
      case 'INSERT': // Handle block references as points
        if (entity.position) {
          const point = this.transformPoint(entity.position);
          geometry = {
            type: 'Point',
            coordinates: point,
          };
        }
        break;
      case 'LINE':
        if (entity.start && entity.end) {
          const start = this.transformPoint(entity.start);
          const end = this.transformPoint(entity.end);
          geometry = {
            type: 'LineString',
            coordinates: [start, end],
          };
        }
        break;
      case 'POLYLINE':
      case 'LWPOLYLINE':
        if (entity.vertices?.length >= 3) {
          const coordinates = entity.vertices.map((v: any) => 
            this.transformPoint(v)
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
              this.transformPoint(v)
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
    coordinateSystem: string;
    bounds: LoaderResult['bounds'];
    preview: GeoFeatureCollection;
  }> {
    const content = await this.readFileContent(file);
    const dxf = this.parseContent(content);

    const layers = this.extractLayers(dxf);
    const coordinateSystem = this.detectCoordinateSystem(dxf);
    const bounds = this.calculateBounds(dxf);
    const preview = this.generatePreview(dxf);

    console.debug('DXF Analysis:', {
      layerCount: layers.length,
      coordinateSystem,
      bounds,
      previewFeatureCount: preview.features.length
    });

    return { 
      layers, 
      bounds, 
      preview,
      coordinateSystem
    };
  }

  async load(file: File, options: LoaderOptions): Promise<LoaderResult> {
    const content = await this.readFileContent(file);
    const dxf = this.parseContent(content);
    
    const selectedLayers = options.selectedLayers || [];
    const features = this.convertToGeoFeatures(dxf).filter(
      feature => selectedLayers.length === 0 || selectedLayers.includes(feature.properties.layer)
    );
    
    const bounds = this.calculateBounds(dxf);
    const layers = this.extractLayers(dxf);
    const coordinateSystem = this.detectCoordinateSystem(dxf);

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
      coordinateSystem,
      statistics 
    };
  }
}

export default new DxfLoader();
