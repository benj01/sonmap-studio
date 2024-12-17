import { GeoFileLoader, LoaderOptions, LoaderResult, GeoFeature, AnalyzeResult } from '../../../types/geo';
import { CoordinateTransformer } from '../utils/coordinate-utils';
import { COORDINATE_SYSTEMS, CoordinateSystem } from '../types/coordinates';
import { createShapefileParser } from '../utils/shapefile-parser';
import { suggestCoordinateSystem } from '../utils/coordinate-utils';
import { Feature, Geometry, Point as GeoJSONPoint, LineString, Polygon, Position } from 'geojson';

const PREVIEW_CHUNK_SIZE = 100;
const LOAD_CHUNK_SIZE = 1000;

interface ShapeFile extends File {
  relatedFiles?: {
    [key: string]: File
  }
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

  private validateComponents(file: File): { [key: string]: File } {
    const shapeFile = file as ShapeFile;
    const relatedFiles = shapeFile.relatedFiles || {};
    const requiredComponents = ['.dbf', '.shx'];
    const missingComponents = requiredComponents.filter(ext => !relatedFiles[ext]);
    
    if (missingComponents.length > 0) {
      // Instead of throwing an error, log a warning and continue with available files
      console.warn(`Warning: Missing shapefile components: ${missingComponents.join(', ')}. Some functionality may be limited.`);
    }

    return relatedFiles;
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

  private emitProgress(count: number) {
    const progressEvent = new CustomEvent('shapefileLoadProgress', { 
      detail: { count } 
    });
    window.dispatchEvent(progressEvent);
  }

  async analyze(file: File): Promise<AnalyzeResult> {
    try {
      const relatedFiles = this.validateComponents(file);
      
      // Read projection information if available
      let coordinateSystem: CoordinateSystem | undefined;
      if (relatedFiles['.prj']) {
        coordinateSystem = await this.readPRJFile(relatedFiles['.prj']);
      }
      
      // Read the main shapefile
      const shpBuffer = await file.arrayBuffer();
      const header = await this.parser.readShapefileHeader(shpBuffer);
      
      // If no coordinate system was found in PRJ, detect it from sample features
      if (!coordinateSystem) {
        const sampleFeatures: GeoFeature[] = [];
        for await (const feature of this.parser.streamFeatures(shpBuffer, header)) {
          if (isPoint(feature.geometry)) {
            sampleFeatures.push(feature);
            if (sampleFeatures.length >= 5) break; 
          }
        }
        const samplePoints = sampleFeatures
          .map(f => {
            const coords = getPointCoordinates(f.geometry);
            return coords ? { x: coords[0], y: coords[1] } : null;
          })
          .filter((point): point is { x: number; y: number } => point !== null);

        if (samplePoints.length > 0) {
          coordinateSystem = suggestCoordinateSystem(samplePoints);
          console.debug('Detected coordinate system from sample points:', coordinateSystem);
        }
      }
      
      // Read DBF header for attribute information if available
      if (relatedFiles['.dbf']) {
        try {
          const dbfBuffer = await relatedFiles['.dbf'].arrayBuffer();
          await this.parser.readDBFHeader(dbfBuffer);
        } catch (error) {
          console.warn('Failed to read DBF header:', error);
        }
      }
      
      // Generate preview features
      const previewFeatures: GeoFeature[] = [];
      for await (const feature of this.parser.streamFeatures(shpBuffer, header)) {
        previewFeatures.push(feature);
        if (previewFeatures.length >= PREVIEW_CHUNK_SIZE) break;
      }

      // Transform bounds if needed
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
          }
        } catch (error) {
          console.warn('Failed to transform bounds:', error);
        }
      }

      return {
        layers: ['default'],
        coordinateSystem: coordinateSystem || COORDINATE_SYSTEMS.WGS84,
        bounds,
        preview: {
          type: 'FeatureCollection',
          features: previewFeatures
        }
      };
    } catch (err) {
      const error = err as Error;
      console.error('Shapefile analysis error:', error);
      throw new Error(`Failed to analyze shapefile: ${error.message}`);
    }
  }

  async load(file: File, options: LoaderOptions): Promise<LoaderResult> {
    try {
      const relatedFiles = this.validateComponents(file);
      
      // Read projection information if available
      let sourceSystem = options.coordinateSystem;
      if (!sourceSystem && relatedFiles['.prj']) {
        sourceSystem = await this.readPRJFile(relatedFiles['.prj']);
      }
      
      // Read the main shapefile
      const shpBuffer = await file.arrayBuffer();
      const header = await this.parser.readShapefileHeader(shpBuffer);
      
      // Read DBF data if attributes should be imported and DBF file is available
      let attributeData: Record<number, Record<string, any>> = {};
      if (options.importAttributes && relatedFiles['.dbf']) {
        try {
          const dbfBuffer = await relatedFiles['.dbf'].arrayBuffer();
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
