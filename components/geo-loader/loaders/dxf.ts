import { GeoFileLoader, LoaderOptions, LoaderResult, AnalyzeResult } from '../../../types/geo';
import { CoordinateTransformer, Point, suggestCoordinateSystem } from '../utils/coordinate-utils';
import { COORDINATE_SYSTEMS } from '../utils/coordinate-systems';
import { createDxfParser } from '../utils/dxf';
import { Vector3 } from '../utils/dxf/types';

const PREVIEW_CHUNK_SIZE = 5000; // Increased from 1000 to handle more complex files

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
            points.push(...entity.vertices.filter((v: Vector3) => v && isFinite(v.x) && isFinite(v.y)));
          }
          break;
        case 'POINT':
          if (entity.position && isFinite(entity.position.x) && isFinite(entity.position.y)) {
            points.push(entity.position);
          }
          break;
        case 'LINE':
          if (entity.start && isFinite(entity.start.x) && isFinite(entity.start.y)) {
            points.push(entity.start);
          }
          if (entity.end && isFinite(entity.end.x) && isFinite(entity.end.y)) {
            points.push(entity.end);
          }
          break;
        case 'POLYLINE':
        case 'LWPOLYLINE':
          if (Array.isArray(entity.vertices)) {
            points.push(...entity.vertices.filter((v: Vector3) => v && isFinite(v.x) && isFinite(v.y)));
          }
          break;
        case 'CIRCLE':
        case 'ARC':
        case 'ELLIPSE':
          if (entity.center && isFinite(entity.center.x) && isFinite(entity.center.y)) {
            points.push(entity.center);
          }
          break;
        case 'INSERT':
          if (entity.position && isFinite(entity.position.x) && isFinite(entity.position.y)) {
            points.push(entity.position);
          }
          break;
      }
    });
    return points;
  }

  async analyze(file: File): Promise<AnalyzeResult> {
    try {
      const content = await this.readFileContent(file);
      const dxf = this.parser.parse(content);
      
      if (!dxf || !dxf.entities) {
        throw new Error('Invalid DXF file structure');
      }

      // First expand block references to get all actual entities
      const expandedEntities = this.parser.expandBlockReferences(dxf);
      
      // Extract points for coordinate system detection
      const points = this.extractPoints(expandedEntities);
      if (points.length === 0) {
        throw new Error('No valid points found in DXF file');
      }
      
      const coordinateSystem = suggestCoordinateSystem(points);

      // Generate preview features with better error handling
      const previewFeatures = [];
      const processedLayers = new Set<string>();
      
      for (const entity of expandedEntities) {
        // Track which layers we've seen entities from
        if (entity.layer) {
          processedLayers.add(entity.layer);
        }

        try {
          const feature = this.parser.entityToGeoFeature(entity);
          if (feature && this.isValidFeature(feature)) {
            previewFeatures.push(feature);
            if (previewFeatures.length >= PREVIEW_CHUNK_SIZE) break;
          }
        } catch (error) {
          console.warn('Failed to convert entity to feature:', error);
          continue;
        }
      }

      if (previewFeatures.length === 0) {
        throw new Error('No valid features could be extracted from DXF file');
      }

      // Calculate bounds from preview features
      const bounds = this.calculateBoundsFromFeatures(previewFeatures);
      if (!bounds) {
        throw new Error('Could not calculate valid bounds from features');
      }

      // Get all layers, including those without preview features
      const allLayers = Array.from(new Set([
        ...this.parser.getLayers(),
        ...Array.from(processedLayers)
      ]));

      return {
        layers: allLayers,
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

  private isValidFeature(feature: any): boolean {
    if (!feature?.geometry?.coordinates) return false;
    
    const validateCoords = (coords: any): boolean => {
      if (Array.isArray(coords)) {
        if (coords.length === 2) {
          return typeof coords[0] === 'number' && 
                 typeof coords[1] === 'number' && 
                 isFinite(coords[0]) && 
                 isFinite(coords[1]);
        }
        return coords.every(coord => validateCoords(coord));
      }
      return false;
    };

    return validateCoords(feature.geometry.coordinates);
  }

  private calculateBoundsFromFeatures(features: any[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    let hasValidCoords = false;

    const updateBounds = (coords: number[]) => {
      if (coords.length >= 2) {
        const [x, y] = coords;
        if (isFinite(x) && isFinite(y)) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
          hasValidCoords = true;
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

    if (!hasValidCoords) {
      return null;
    }

    // Add a small buffer to the bounds
    const dx = (maxX - minX) * 0.05;
    const dy = (maxY - minY) * 0.05;
    
    return {
      minX: minX - dx,
      minY: minY - dy,
      maxX: maxX + dx,
      maxY: maxY + dy
    };
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

        try {
          const feature = this.parser.entityToGeoFeature(entity);
          if (feature && this.isValidFeature(feature)) {
            if (transformer) {
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
                  failedTransformations.add(entityId);
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
          }
        } catch (error) {
          // Track conversion errors
          const errorType = `${entity.type}_CONVERSION`;
          const existingError = errors.find(e => e.type === errorType);
          if (existingError) {
            existingError.count++;
          } else {
            errors.push({
              type: errorType,
              message: `Failed to convert ${entity.type} entity to feature`,
              count: 1
            });
          }
        }
      }

      if (features.length === 0) {
        throw new Error('No valid features could be extracted from DXF file');
      }

      // Calculate bounds from transformed features
      const bounds = this.calculateBoundsFromFeatures(features);
      if (!bounds) {
        throw new Error('Could not calculate valid bounds from features');
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
          featureTypes,
          failedTransformations: failedTransformations.size,
          errors: errors.length > 0 ? errors : undefined
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
