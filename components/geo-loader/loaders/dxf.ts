import { GeoFileLoader, LoaderOptions, LoaderResult, AnalyzeResult, GeoFeature } from '../../../types/geo';
import { CoordinateTransformer, Point, suggestCoordinateSystem } from '../utils/coordinate-utils';
import { COORDINATE_SYSTEMS } from '../utils/coordinate-systems';
import { createDxfParser } from '../utils/dxf';
import { createDxfAnalyzer } from '../utils/dxf/analyzer';
import { Vector3 } from '../utils/dxf/types';
import { 
  Feature, 
  Geometry, 
  Position,
  Point as GeoPoint,
  LineString,
  Polygon,
  MultiPoint,
  MultiLineString,
  MultiPolygon
} from 'geojson';

// Reduce preview chunk size for better performance
const PREVIEW_CHUNK_SIZE = 1000;
// Sample rate for large files (e.g., show every Nth element)
const PREVIEW_SAMPLE_RATE = 5;

type GeometryWithCoordinates = 
  | GeoPoint 
  | LineString 
  | Polygon 
  | MultiPoint 
  | MultiLineString 
  | MultiPolygon;

function isGeometryWithCoordinates(geometry: Geometry): geometry is GeometryWithCoordinates {
  return geometry.type !== 'GeometryCollection';
}

class DxfLoader implements GeoFileLoader {
  private parser = createDxfParser();
  private analyzer = createDxfAnalyzer();

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
        case 'TEXT':
        case 'MTEXT':
          if (entity.position && isFinite(entity.position.x) && isFinite(entity.position.y)) {
            points.push(entity.position);
          }
          break;
        case 'SPLINE':
          if (Array.isArray(entity.controlPoints)) {
            points.push(...entity.controlPoints.filter((v: Vector3) => v && isFinite(v.x) && isFinite(v.y)));
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

      // Run comprehensive analysis
      const analysisResult = this.analyzer.analyze(dxf);
      if (!analysisResult.isValid) {
        const criticalErrors = analysisResult.errors.filter(e => e.isCritical);
        if (criticalErrors.length > 0) {
          throw new Error(
            'Critical errors found in DXF file:\n' +
            criticalErrors.map(e => `- ${e.message}`).join('\n')
          );
        }
      }

      const expandedEntities = this.parser.expandBlockReferences(dxf);
      
      const points = this.extractPoints(expandedEntities);
      if (points.length === 0) {
        throw new Error('No valid points found in DXF file');
      }
      
      const coordinateSystem = suggestCoordinateSystem(points);

      // Optimize preview by sampling entities for large files
      const shouldSample = expandedEntities.length > PREVIEW_CHUNK_SIZE * PREVIEW_SAMPLE_RATE;
      const previewFeatures = [];
      const processedLayers = new Set<string>();
      const unsupportedTypes = new Set<string>();
      
      for (let i = 0; i < expandedEntities.length; i++) {
        // Skip entities based on sample rate if needed
        if (shouldSample && i % PREVIEW_SAMPLE_RATE !== 0) continue;
        
        const entity = expandedEntities[i];
        if (entity.layer) {
          processedLayers.add(entity.layer);
        }

        try {
          const feature = this.parser.entityToGeoFeature(entity);
          if (feature && this.isValidFeature(feature)) {
            previewFeatures.push(feature);
            if (previewFeatures.length >= PREVIEW_CHUNK_SIZE) break;
          } else if (entity.type) {
            unsupportedTypes.add(entity.type);
          }
        } catch (error) {
          console.warn('Failed to convert entity to feature:', error);
          if (entity.type) {
            unsupportedTypes.add(entity.type);
          }
          continue;
        }
      }

      if (previewFeatures.length === 0) {
        const unsupportedList = Array.from(unsupportedTypes).join(', ');
        throw new Error(
          `No valid features could be extracted from DXF file. ` +
          (unsupportedList ? `Unsupported types found: ${unsupportedList}` : '')
        );
      }

      const bounds = this.calculateBoundsFromFeatures(previewFeatures);
      if (!bounds) {
        throw new Error('Could not calculate valid bounds from features');
      }

      const allLayers = Array.from(new Set([
        ...this.parser.getLayers(),
        ...Array.from(processedLayers)
      ]));

      // Include analysis results in the response
      return {
        layers: allLayers,
        coordinateSystem,
        bounds,
        preview: {
          type: 'FeatureCollection',
          features: previewFeatures
        },
        dxfData: dxf,
        analysis: {
          warnings: analysisResult.warnings,
          errors: analysisResult.errors,
          stats: analysisResult.stats
        }
      };
    } catch (err) {
      const error = err as Error;
      console.error('DXF analysis error:', error);
      throw new Error(`Failed to analyze DXF file: ${error.message}`);
    }
  }

  private isValidFeature(feature: Feature): boolean {
    if (!feature?.geometry) return false;
    
    const validatePosition = (position: Position): boolean => {
      return position.length >= 2 &&
             typeof position[0] === 'number' &&
             typeof position[1] === 'number' &&
             isFinite(position[0]) &&
             isFinite(position[1]);
    };

    const validatePositions = (positions: Position[]): boolean => {
      return positions.every(validatePosition);
    };

    const validateMultiPositions = (positions: Position[][]): boolean => {
      return positions.every(validatePositions);
    };

    const validateMultiPolygon = (polygons: Position[][][]): boolean => {
      return polygons.every(poly => validateMultiPositions(poly));
    };

    if (!isGeometryWithCoordinates(feature.geometry)) {
      return false;
    }

    switch (feature.geometry.type) {
      case 'Point':
        return validatePosition(feature.geometry.coordinates);
      case 'LineString':
        return validatePositions(feature.geometry.coordinates);
      case 'Polygon':
        return validateMultiPositions(feature.geometry.coordinates);
      case 'MultiPoint':
        return validatePositions(feature.geometry.coordinates);
      case 'MultiLineString':
        return validateMultiPositions(feature.geometry.coordinates);
      case 'MultiPolygon':
        return validateMultiPolygon(feature.geometry.coordinates);
      default:
        return false;
    }
  }

  private calculateBoundsFromFeatures(features: Feature[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    let hasValidCoords = false;

    const updateBounds = (position: Position) => {
      if (position.length >= 2) {
        const [x, y] = position;
        if (isFinite(x) && isFinite(y)) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
          hasValidCoords = true;
        }
      }
    };

    const processPositions = (positions: Position[]) => {
      positions.forEach(updateBounds);
    };

    const processMultiPositions = (multiPositions: Position[][]) => {
      multiPositions.forEach(processPositions);
    };

    const processMultiPolygon = (polygons: Position[][][]) => {
      polygons.forEach(processMultiPositions);
    };

    features.forEach(feature => {
      if (!feature.geometry || !isGeometryWithCoordinates(feature.geometry)) return;

      switch (feature.geometry.type) {
        case 'Point':
          updateBounds(feature.geometry.coordinates);
          break;
        case 'LineString':
          processPositions(feature.geometry.coordinates);
          break;
        case 'Polygon':
          processMultiPositions(feature.geometry.coordinates);
          break;
        case 'MultiPoint':
          processPositions(feature.geometry.coordinates);
          break;
        case 'MultiLineString':
          processMultiPositions(feature.geometry.coordinates);
          break;
        case 'MultiPolygon':
          processMultiPolygon(feature.geometry.coordinates);
          break;
      }
    });

    if (!hasValidCoords) {
      return null;
    }

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

      // Run analysis before loading
      const analysisResult = this.analyzer.analyze(dxf);
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

      const features: GeoFeature[] = [];
      const featureTypes: Record<string, number> = {};
      const failedTransformations = new Set<string>();
      const errors: Array<{type: string; message?: string; count: number}> = [];

      // Include analysis warnings in errors
      analysisResult.warnings.forEach(warning => {
        const existingError = errors.find(e => e.type === warning.type);
        if (existingError) {
          existingError.count++;
        } else {
          errors.push({
            type: warning.type,
            message: warning.message,
            count: 1
          });
        }
      });

      for (const entity of expandedEntities) {
        if (selectedLayers.length > 0 && !selectedLayers.includes(entity.layer || '0')) {
          continue;
        }

        try {
          const feature = this.parser.entityToGeoFeature(entity);
          if (feature && this.isValidFeature(feature)) {
            if (transformer && isGeometryWithCoordinates(feature.geometry)) {
              try {
                const transformedCoords = this.transformCoordinates(
                  feature.geometry.coordinates,
                  transformer
                );
                
                if (transformedCoords) {
                  feature.geometry.coordinates = transformedCoords;
                  features.push(feature as GeoFeature);
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
              features.push(feature as GeoFeature);
            }
            
            const type = feature.geometry.type;
            featureTypes[type] = (featureTypes[type] || 0) + 1;
          }
        } catch (error) {
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
          ...analysisResult.stats,
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
        
        // Validate WGS84 bounds
        if (transformed.y < -90 || transformed.y > 90) {
          console.warn('Transformed latitude out of bounds:', transformed.y);
          return null;
        }
        if (transformed.x < -180 || transformed.x > 180) {
          console.warn('Transformed longitude out of bounds:', transformed.x);
          return null;
        }
        
        return [transformed.x, transformed.y];
      }
      const transformedArray = coordinates.map(coord => this.transformCoordinates(coord, transformer));
      return transformedArray.every(item => item !== null) ? transformedArray : null;
    }
    return coordinates;
  }
}

export default new DxfLoader();
