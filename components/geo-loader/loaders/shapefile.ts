import { GeoFileLoader, LoaderOptions, LoaderResult, GeoFeature, AnalyzeResult } from '../../../types/geo';
import { CoordinateTransformer } from '../utils/coordinate-utils';
import { COORDINATE_SYSTEMS } from '../utils/coordinate-systems';
import { createShapefileParser } from '../utils/shapefile-parser';

const PREVIEW_CHUNK_SIZE = 100;
const LOAD_CHUNK_SIZE = 1000;

interface ShapeFile extends File {
  relatedFiles: {
    [key: string]: File
  }
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
      throw new Error(`Missing required shapefile components: ${missingComponents.join(', ')}`);
    }

    return relatedFiles;
  }

  private async readPRJFile(prjFile: File): Promise<string | undefined> {
    try {
      const text = await prjFile.text();
      // TODO: Add proper WKT projection parsing
      // For now, just check for common projection strings
      if (text.includes('CH1903+')) {
        return COORDINATE_SYSTEMS.SWISS_LV95;
      } else if (text.includes('CH1903')) {
        return COORDINATE_SYSTEMS.SWISS_LV03;
      }
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
      let coordinateSystem: string | undefined;
      if (relatedFiles['.prj']) {
        coordinateSystem = await this.readPRJFile(relatedFiles['.prj']);
      }
      
      // Read the main shapefile
      const shpBuffer = await file.arrayBuffer();
      const header = await this.parser.readShapefileHeader(shpBuffer);
      
      // If no coordinate system was found in PRJ, detect it from some sample features
      if (!coordinateSystem) {
        const sampleFeatures: GeoFeature[] = [];
        for await (const feature of this.parser.streamFeatures(shpBuffer, header)) {
          if (feature.geometry.type === 'Point') {
            sampleFeatures.push(feature);
            if (sampleFeatures.length >= 5) break; 
          }
        }
        const samplePoints = sampleFeatures
          .map(f => {
            const coords = f.geometry.coordinates as [number, number];
            return { x: coords[0], y: coords[1] };
          });
        coordinateSystem = COORDINATE_SYSTEMS.WGS84;
      }
      
      // Read DBF header for attribute information
      if (relatedFiles['.dbf']) {
        const dbfBuffer = await relatedFiles['.dbf'].arrayBuffer();
        await this.parser.readDBFHeader(dbfBuffer);
      }
      
      // Generate preview features
      const previewFeatures: GeoFeature[] = [];
      for await (const feature of this.parser.streamFeatures(shpBuffer, header)) {
        previewFeatures.push(feature);
        if (previewFeatures.length >= PREVIEW_CHUNK_SIZE) break;
      }

      return {
        layers: ['default'],
        coordinateSystem: coordinateSystem || COORDINATE_SYSTEMS.WGS84,
        bounds: {
          minX: header.bounds.xMin,
          minY: header.bounds.yMin,
          maxX: header.bounds.xMax,
          maxY: header.bounds.yMax
        },
        preview: {
          type: 'FeatureCollection',
          features: previewFeatures
        }
      };
    } catch (err) {
      const error = err as Error;
      console.error('Shapefile analysis error:', error);
      throw new Error(error.message || 'Failed to analyze shapefile');
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
      
      // Read DBF data if attributes should be imported
      let attributeData: Record<number, Record<string, any>> = {};
      if (options.importAttributes && relatedFiles['.dbf']) {
        const dbfBuffer = await relatedFiles['.dbf'].arrayBuffer();
        const dbfHeader = await this.parser.readDBFHeader(dbfBuffer);
        attributeData = await this.parser.readDBFRecords(dbfBuffer, dbfHeader);
      }
      
      // Process all features
      const features: GeoFeature[] = [];
      const featureTypes: Record<string, number> = {};
      let count = 0;
      
      for await (const feature of this.parser.streamFeatures(shpBuffer, header)) {
        // Add attributes if available
        if (attributeData[count + 1]) {
          feature.properties = { ...feature.properties, ...attributeData[count + 1] };
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
      }
      
      this.emitProgress(count);
      
      // Transform bounds if needed
      let bounds = {
        minX: header.bounds.xMin,
        minY: header.bounds.yMin,
        maxX: header.bounds.xMax,
        maxY: header.bounds.yMax
      };

      if (sourceSystem && sourceSystem !== COORDINATE_SYSTEMS.WGS84) {
        const transformer = new CoordinateTransformer(sourceSystem, COORDINATE_SYSTEMS.WGS84);
        bounds = transformer.transformBounds(bounds);
      }

      // Store errors in feature properties for debugging
      const errors = this.parser.getErrors();
      if (errors.length > 0) {
        features.forEach((feature, index) => {
          const featureErrors = errors.filter(e => e.featureIndex === index);
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
        }
      };
    } catch (err) {
      const error = err as Error;
      console.error('Shapefile loading error:', error);
      throw new Error(error.message || 'Failed to load shapefile');
    }
  }
}

export default new ShapefileLoader();
