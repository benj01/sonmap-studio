import { GeoFileLoader, LoaderOptions, LoaderResult, GeoFeature, AnalyzeResult } from '../../../types/geo';
import { CoordinateTransformer } from '../utils/coordinate-utils';
import { COORDINATE_SYSTEMS, CoordinateSystem } from '../types/coordinates';
import { createShapefileParser } from '../utils/shapefile-parser';
import { suggestCoordinateSystem } from '../utils/coordinate-utils';
import { Feature, Geometry, Point as GeoJSONPoint, LineString, Polygon, Position } from 'geojson';

const PREVIEW_CHUNK_SIZE = 100;
const LOAD_CHUNK_SIZE = 1000;
const MAX_SAMPLE_POINTS = 5;

interface ShapeFile extends File {
  relatedFiles?: {
    [key: string]: File
  }
}

interface FileValidationResult {
  isValid: boolean;
  missingComponents: string[];
  availableComponents: { [key: string]: File };
  warnings: string[];
}

// Type guards for geometry types
function isPoint(geometry: Geometry): geometry is GeoJSONPoint {
  return geometry.type === 'Point';
}

function getPointCoordinates(geometry: Geometry): Position | null {
  if (isPoint(geometry)) {
    return geometry.coordinates;
  }
  return null;
}

function isGeometryWithCoordinates(geometry: Geometry): geometry is GeoJSONPoint | LineString | Polygon {
  return ['Point', 'LineString', 'Polygon'].includes(geometry.type);
}

class ShapefileLoader implements GeoFileLoader {
  private parser = createShapefileParser();

  async canLoad(file: File): Promise<boolean> {
    return file.name.toLowerCase().endsWith('.shp');
  }

  private validateComponents(file: File): FileValidationResult {
    const shapeFile = file as ShapeFile;
    const relatedFiles = shapeFile.relatedFiles || {};
    const requiredComponents = ['.dbf', '.shx'];
    const optionalComponents = ['.prj'];
    const missingRequired = requiredComponents.filter(ext => !relatedFiles[ext]);
    const missingOptional = optionalComponents.filter(ext => !relatedFiles[ext]);
    
    const warnings: string[] = [];
    
    if (missingRequired.length > 0) {
      warnings.push(`Missing required components: ${missingRequired.join(', ')}`);
    }
    
    if (missingOptional.length > 0) {
      warnings.push(`Missing optional components: ${missingOptional.join(', ')}`);
    }

    return {
      isValid: missingRequired.length === 0,
      missingComponents: [...missingRequired, ...missingOptional],
      availableComponents: relatedFiles,
      warnings
    };
  }

  private async readPRJFile(prjFile: File): Promise<CoordinateSystem | undefined> {
    try {
      const text = await prjFile.text();
      // Common Swiss projection identifiers
      const projectionMap: Record<string, CoordinateSystem> = {
        'CH1903+': COORDINATE_SYSTEMS.SWISS_LV95,
        'CH1903': COORDINATE_SYSTEMS.SWISS_LV03,
        'EPSG:2056': COORDINATE_SYSTEMS.SWISS_LV95,
        'EPSG:21781': COORDINATE_SYSTEMS.SWISS_LV03,
        'PROJCS["CH1903+': COORDINATE_SYSTEMS.SWISS_LV95,
        'PROJCS["CH1903': COORDINATE_SYSTEMS.SWISS_LV03
      };

      // Check for known projection strings
      for (const [key, value] of Object.entries(projectionMap)) {
        if (text.includes(key)) {
          console.debug('Detected coordinate system from PRJ:', value);
          return value;
        }
      }

      console.debug('Unknown projection in PRJ file:', text);
      return undefined;
    } catch (err) {
      console.warn('Failed to parse PRJ file:', err);
      return undefined;
    }
  }

  private async getSamplePoints(file: File, header: any): Promise<{ x: number; y: number }[]> {
    const shpBuffer = await file.arrayBuffer();
    const points: { x: number; y: number }[] = [];
    
    try {
      for await (const feature of this.parser.streamFeatures(shpBuffer, header)) {
        if (isPoint(feature.geometry)) {
          const coords = getPointCoordinates(feature.geometry);
          if (coords) {
            points.push({ x: coords[0], y: coords[1] });
          }
          if (points.length >= MAX_SAMPLE_POINTS) break;
        }
      }
    } catch (error) {
      console.warn('Error sampling points:', error);
    }
    
    return points;
  }

  private async analyzeCoordinateSystem(
    file: File, 
    header: any, 
    validation: FileValidationResult,
    options?: LoaderOptions
  ): Promise<{ 
    coordinateSystem?: CoordinateSystem; 
    warnings: string[];
  }> {
    const warnings: string[] = [];
    let coordinateSystem = options?.coordinateSystem;

    // Try to read from PRJ file first
    if (validation.availableComponents['.prj']) {
      try {
        coordinateSystem = await this.readPRJFile(validation.availableComponents['.prj']);
        if (coordinateSystem) {
          console.debug('Using coordinate system from PRJ:', coordinateSystem);
        } else {
          warnings.push('Could not determine coordinate system from PRJ file');
        }
      } catch (error) {
        warnings.push('Failed to parse PRJ file');
        console.warn('PRJ parsing error:', error);
      }
    }

    // If no coordinate system determined yet, try to detect from coordinates
    if (!coordinateSystem) {
      try {
        const samplePoints = await this.getSamplePoints(file, header);
        if (samplePoints.length > 0) {
          coordinateSystem = suggestCoordinateSystem(samplePoints);
          console.debug('Detected coordinate system from sample points:', coordinateSystem);
          warnings.push(`No projection file found. Detected coordinate system: ${coordinateSystem}`);
        }
      } catch (error) {
        warnings.push('Failed to detect coordinate system from coordinates');
        console.warn('Coordinate system detection error:', error);
      }
    }

    // Default to WGS84 if nothing else determined
    if (!coordinateSystem) {
      coordinateSystem = COORDINATE_SYSTEMS.WGS84;
      warnings.push('Using default WGS84 coordinate system');
    }

    return { coordinateSystem, warnings };
  }

  private emitProgress(count: number) {
    const progressEvent = new CustomEvent('shapefileLoadProgress', { 
      detail: { count } 
    });
    window.dispatchEvent(progressEvent);
  }

  async analyze(file: File, options?: LoaderOptions): Promise<AnalyzeResult> {
    const validation = this.validateComponents(file);
    const warnings = [...validation.warnings];
    const errors: Array<{ type: string; message: string; isCritical: boolean }> = [];
    
    try {
      // Read the main shapefile
      const shpBuffer = await file.arrayBuffer();
      const header = await this.parser.readShapefileHeader(shpBuffer);
      
      // Determine coordinate system
      const { coordinateSystem, warnings: csWarnings } = 
        await this.analyzeCoordinateSystem(file, header, validation, options);
      warnings.push(...csWarnings);
      
      // Read DBF header if available
      if (validation.availableComponents['.dbf']) {
        try {
          const dbfBuffer = await validation.availableComponents['.dbf'].arrayBuffer();
          await this.parser.readDBFHeader(dbfBuffer);
        } catch (error) {
          warnings.push('Failed to read attribute data');
          console.warn('DBF header error:', error);
          errors.push({
            type: 'dbf_read_error',
            message: 'Failed to read attribute data',
            isCritical: false
          });
        }
      }
      
      // Generate preview features with progress tracking
      const previewFeatures: GeoFeature[] = [];
      let processedCount = 0;
      let entityCount = 0;
      
      for await (const feature of this.parser.streamFeatures(shpBuffer, header)) {
        previewFeatures.push(feature);
        processedCount++;
        entityCount++;
        
        if (options?.onProgress) {
          options.onProgress(Math.min(processedCount / PREVIEW_CHUNK_SIZE, 1));
        }
        
        if (previewFeatures.length >= PREVIEW_CHUNK_SIZE) break;
      }

      // Calculate and transform bounds
      let bounds = {
        minX: header.bounds.xMin,
        minY: header.bounds.yMin,
        maxX: header.bounds.xMax,
        maxY: header.bounds.yMax
      };

      if (coordinateSystem && coordinateSystem !== COORDINATE_SYSTEMS.WGS84) {
        try {
          const transformer = new CoordinateTransformer(coordinateSystem, COORDINATE_SYSTEMS.WGS84);
          const transformedBounds = transformer.transformBounds(bounds);
          if (transformedBounds) {
            bounds = transformedBounds;
          } else {
            warnings.push('Failed to transform bounds to WGS84');
            errors.push({
              type: 'bounds_transform_error',
              message: 'Failed to transform bounds to WGS84',
              isCritical: false
            });
          }
        } catch (error) {
          warnings.push('Error transforming bounds');
          console.warn('Bounds transformation error:', error);
          errors.push({
            type: 'bounds_transform_error',
            message: 'Error transforming bounds',
            isCritical: false
          });
        }
      }

      return {
        layers: ['default'],
        coordinateSystem,
        bounds,
        preview: {
          type: 'FeatureCollection',
          features: previewFeatures
        },
        analysis: {
          warnings: warnings.map(w => ({ type: 'warning', message: w })),
          errors,
          stats: {
            entityCount,
            layerCount: 1
          }
        }
      };
    } catch (err) {
      const error = err as Error;
      console.error('Shapefile analysis error:', error);
      throw new Error(`Failed to analyze shapefile: ${error.message}`);
    }
  }

  async load(file: File, options: LoaderOptions): Promise<LoaderResult> {
    const validation = this.validateComponents(file);
    if (!validation.isValid) {
      throw new Error(`Cannot load shapefile: ${validation.warnings.join(', ')}`);
    }

    try {
      // Read projection information if available
      let sourceSystem = options.coordinateSystem;
      if (!sourceSystem && validation.availableComponents['.prj']) {
        sourceSystem = await this.readPRJFile(validation.availableComponents['.prj']);
      }
      
      // Read the main shapefile
      const shpBuffer = await file.arrayBuffer();
      const header = await this.parser.readShapefileHeader(shpBuffer);
      
      // Read DBF data if attributes should be imported and DBF file is available
      let attributeData: Record<number, Record<string, any>> = {};
      if (options.importAttributes && validation.availableComponents['.dbf']) {
        try {
          const dbfBuffer = await validation.availableComponents['.dbf'].arrayBuffer();
          const dbfHeader = await this.parser.readDBFHeader(dbfBuffer);
          attributeData = await this.parser.readDBFRecords(dbfBuffer, dbfHeader);
        } catch (error) {
          console.warn('Failed to read DBF data:', error);
        }
      }
      
      // Process all features
      const features: GeoFeature[] = [];
      const featureTypes: Record<string, number> = {};
      let count = 0;
      let failedTransformations = 0;
      const errors: { type: string; count: number; message?: string }[] = [];
      
      let transformer: CoordinateTransformer | null = null;
      if (sourceSystem && sourceSystem !== COORDINATE_SYSTEMS.WGS84) {
        try {
          transformer = new CoordinateTransformer(sourceSystem, COORDINATE_SYSTEMS.WGS84);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          errors.push({
            type: 'transformation_setup',
            count: 1,
            message: `Failed to create coordinate transformer: ${message}`
          });
        }
      }

      for await (const feature of this.parser.streamFeatures(shpBuffer, header)) {
        try {
          // Add attributes if available
          if (attributeData[count + 1]) {
            feature.properties = { ...feature.properties, ...attributeData[count + 1] };
          }

          // Transform coordinates if needed
          if (transformer && isGeometryWithCoordinates(feature.geometry)) {
            try {
              const coords = feature.geometry.coordinates;
              if (Array.isArray(coords)) {
                const transformedCoords = this.transformCoordinates(coords, transformer);
                if (transformedCoords) {
                  feature.geometry.coordinates = transformedCoords;
                } else {
                  failedTransformations++;
                  feature.properties._transformError = 'Coordinate transformation failed';
                }
              }
            } catch (transformError) {
              failedTransformations++;
              feature.properties._transformError = transformError instanceof Error ? 
                transformError.message : 'Unknown transformation error';
            }
          }
          
          features.push(feature);
          
          // Count feature types
          const type = feature.geometry.type;
          featureTypes[type] = (featureTypes[type] || 0) + 1;
          
          count++;
          if (count % LOAD_CHUNK_SIZE === 0) {
            this.emitProgress(count);
            // Allow UI to update
            await new Promise(resolve => setTimeout(resolve, 0));
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          const errorType = 'feature_processing';
          const existingError = errors.find(e => e.type === errorType);
          if (existingError) {
            existingError.count++;
          } else {
            errors.push({ type: errorType, count: 1, message });
          }
        }
      }
      
      this.emitProgress(count);
      
      // Transform bounds if needed
      let bounds = {
        minX: header.bounds.xMin,
        minY: header.bounds.yMin,
        maxX: header.bounds.xMax,
        maxY: header.bounds.yMax
      };

      if (transformer) {
        try {
          const transformedBounds = transformer.transformBounds(bounds);
          if (transformedBounds) {
            bounds = transformedBounds;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          errors.push({
            type: 'bounds_transformation',
            count: 1,
            message: `Failed to transform bounds: ${message}`
          });
        }
      }

      // Store parser errors in statistics
      const parserErrors = this.parser.getErrors();
      if (parserErrors.length > 0) {
        errors.push({
          type: 'parser',
          count: parserErrors.length,
          message: 'Parser errors occurred during feature processing'
        });
        
        // Add error details to features
        features.forEach((feature, index) => {
          const featureErrors = parserErrors.filter(e => e.featureIndex === index);
          if (featureErrors.length > 0) {
            feature.properties._errors = featureErrors.map(e => e.error);
          }
        });
      }

      return {
        features,
        bounds,
        layers: ['default'],
        coordinateSystem: COORDINATE_SYSTEMS.WGS84,
        statistics: {
          pointCount: features.length,
          layerCount: 1,
          featureTypes,
          failedTransformations,
          errors: errors.length > 0 ? errors : undefined
        }
      };
    } catch (err) {
      const error = err as Error;
      console.error('Shapefile loading error:', error);
      throw new Error(`Failed to load shapefile: ${error.message}`);
    }
  }

  private transformCoordinates(coordinates: any[], transformer: CoordinateTransformer): any[] | null {
    if (coordinates.length === 0) return coordinates;

    try {
      // Handle different coordinate structures
      if (typeof coordinates[0] === 'number') {
        // Single coordinate pair [x, y]
        const transformed = transformer.transform({ x: coordinates[0], y: coordinates[1] });
        if (!transformed) return null;
        return [transformed.x, transformed.y];
      } else if (Array.isArray(coordinates[0])) {
        // Array of coordinates or nested arrays
        const transformedArray = coordinates.map(coords => this.transformCoordinates(coords, transformer));
        return transformedArray.every(item => item !== null) ? transformedArray : null;
      }

      return coordinates;
    } catch (error) {
      console.warn('Coordinate transformation error:', error);
      return null;
    }
  }
}

export default new ShapefileLoader();
