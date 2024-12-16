import { GeoFileLoader, LoaderOptions, LoaderResult, AnalyzeResult } from '../../../types/geo';
import { CoordinateTransformer, Point, suggestCoordinateSystem } from '../utils/coordinate-utils';
import { COORDINATE_SYSTEMS } from '../utils/coordinate-systems';
import { createDxfParser } from '../utils/dxf';

const PREVIEW_CHUNK_SIZE = 1000;

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

  private extractPoints(entities: any[]): Point[] {
    const points: Point[] = [];
    entities.forEach(entity => {
      if (!entity) return;

      switch (entity.type) {
        case '3DFACE':
          if (Array.isArray(entity.vertices)) {
            points.push(...entity.vertices);
          }
          break;
        case 'POINT':
          if (entity.position) {
            points.push(entity.position);
          }
          break;
        case 'LINE':
          if (entity.start) points.push(entity.start);
          if (entity.end) points.push(entity.end);
          break;
        case 'POLYLINE':
        case 'LWPOLYLINE':
          if (Array.isArray(entity.vertices)) {
            points.push(...entity.vertices);
          }
          break;
        case 'CIRCLE':
        case 'ARC':
        case 'ELLIPSE':
          if (entity.center) {
            points.push(entity.center);
          }
          break;
      }
    });
    return points.filter(point => 
      point && 
      typeof point.x === 'number' && 
      typeof point.y === 'number' && 
      isFinite(point.x) && 
      isFinite(point.y)
    );
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
      const points = this.extractPoints(expandedEntities);
      const coordinateSystem = suggestCoordinateSystem(points);

      // Generate preview features
      const previewFeatures = [];
      for (const entity of expandedEntities) {
        const feature = this.parser.entityToGeoFeature(entity);
        if (feature) {
          previewFeatures.push(feature);
          if (previewFeatures.length >= PREVIEW_CHUNK_SIZE) break;
        }
      }

      // Calculate bounds from preview features
      const bounds = this.calculateBoundsFromFeatures(previewFeatures);

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

  private calculateBoundsFromFeatures(features: any[]): { minX: number; minY: number; maxX: number; maxY: number } {
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    const updateBounds = (coords: number[]) => {
      if (coords.length >= 2) {
        const [x, y] = coords;
        if (isFinite(x) && isFinite(y)) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    };

    const processCoordinates = (coords: any) => {
      if (Array.isArray(coords)) {
        if (coords.length === 2 && typeof coords[0] === 'number') {
          updateBounds(coords);
        } else {
          coords.forEach(processCoordinates);
        }
      }
    };

    features.forEach(feature => {
      if (feature?.geometry?.coordinates) {
        processCoordinates(feature.geometry.coordinates);
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
        try {
          transformer = new CoordinateTransformer(sourceSystem, COORDINATE_SYSTEMS.WGS84);
        } catch (error) {
          console.error('Failed to create coordinate transformer:', error);
          throw new Error(`Unsupported coordinate system: ${sourceSystem}`);
        }
      }

      const features = [];
      const featureTypes: Record<string, number> = {};
      const failedTransformations = new Set<string>();
      const errors: Array<{type: string; message?: string; count: number}> = [];

      for (const entity of expandedEntities) {
        // Skip entities not in selected layers
        if (selectedLayers.length > 0 && !selectedLayers.includes(entity.layer || '0')) {
          continue;
        }

        const feature = this.parser.entityToGeoFeature(entity);
        if (feature) {
          if (transformer) {
            // Transform coordinates if needed
            try {
              const transformedCoords = this.transformCoordinates(
                feature.geometry.coordinates,
                transformer
              );
              
              if (transformedCoords) {
                feature.geometry.coordinates = transformedCoords;
                features.push(feature);
              } else {
                const entityId = entity.handle || 'unknown';
                if (!failedTransformations.has(entityId)) {
                  console.warn(`Failed to transform coordinates for entity ${entityId}`);
                  failedTransformations.add(entityId);
                }
                continue;
              }
            } catch (error) {
              console.warn('Failed to transform coordinates:', error);
              continue;
            }
          } else {
            features.push(feature);
          }
          
          // Count feature types
          const type = feature.geometry.type;
          featureTypes[type] = (featureTypes[type] || 0) + 1;
        } else if (entity.type === '3DFACE') {
          // Track 3DFACE conversion errors
          const errorType = '3DFACE_CONVERSION';
          const existingError = errors.find(e => e.type === errorType);
          if (existingError) {
            existingError.count++;
          } else {
            errors.push({
              type: errorType,
              message: 'Failed to convert 3DFACE entity to feature',
              count: 1
            });
          }
        }
      }

      if (failedTransformations.size > 0) {
        console.warn(`Failed to transform ${failedTransformations.size} entities`);
      }

      // Calculate bounds from transformed features
      const bounds = this.calculateBoundsFromFeatures(features);

      const layers = this.parser.getLayers();

      return {
        features,
        bounds,
        layers,
        coordinateSystem: COORDINATE_SYSTEMS.WGS84,
        statistics: {
          pointCount: features.length,
          layerCount: layers.length,
          featureTypes,
          failedTransformations: failedTransformations.size,
          errors
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
        if (!transformed) return null;
        return [transformed.x, transformed.y];
      }
      const transformedArray = coordinates.map(coord => this.transformCoordinates(coord, transformer));
      return transformedArray.every(item => item !== null) ? transformedArray : null;
    }
    return coordinates;
  }
}

export default new DxfLoader();
