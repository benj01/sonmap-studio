// components/geo-loader/loaders/shapefile.ts

import { GeoFileLoader, LoaderOptions, LoaderResult, GeoFeature, GeoFeatureCollection, AnalyzeResult, Geometry } from '../../../types/geo';
import { CoordinateTransformer, createTransformer, COORDINATE_SYSTEMS } from '../utils/coordinate-systems';

const PREVIEW_CHUNK_SIZE = 100;
const LOAD_CHUNK_SIZE = 1000;

// Shapefile format specification constants
const SHAPE_TYPE = {
  NULL: 0,
  POINT: 1,
  POLYLINE: 3,
  POLYGON: 5,
  MULTIPOINT: 8,
};

interface ShapeFile extends File {
  relatedFiles: {
    [key: string]: File
  }
}

class ShapefileLoader implements GeoFileLoader {
  private transformer: CoordinateTransformer | null = null;

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

  private emitProgress(count: number) {
    const progressEvent = new CustomEvent('shapefileLoadProgress', { 
      detail: { count } 
    });
    window.dispatchEvent(progressEvent);
  }

  private async readShapefileHeader(buffer: ArrayBuffer) {
    const view = new DataView(buffer);
    
    // Verify file code (should be 9994)
    const fileCode = view.getInt32(0, false);
    if (fileCode !== 9994) {
      throw new Error('Invalid shapefile: incorrect file code');
    }
    
    // Read header information
    const fileLength = view.getInt32(24, false) * 2; // Length in 16-bit words
    const version = view.getInt32(28, true);
    const shapeType = view.getInt32(32, true);
    
    // Read bounding box
    const xMin = view.getFloat64(36, true);
    const yMin = view.getFloat64(44, true);
    const xMax = view.getFloat64(52, true);
    const yMax = view.getFloat64(60, true);
    
    return {
      fileLength,
      version,
      shapeType,
      bounds: { xMin, yMin, xMax, yMax }
    };
  }

  private detectCoordinateSystem(bounds: { xMin: number; yMin: number; xMax: number; yMax: number }): string {
    // Create sample points from bounds
    const points = [
      { x: bounds.xMin, y: bounds.yMin },
      { x: bounds.xMax, y: bounds.yMax },
      { x: (bounds.xMin + bounds.xMax) / 2, y: (bounds.yMin + bounds.yMax) / 2 }
    ];

    // Check for LV95 (7-digit coordinates)
    if (CoordinateTransformer.detectLV95Coordinates(points)) {
      console.debug('Detected Swiss LV95 coordinates');
      return COORDINATE_SYSTEMS.SWISS_LV95;
    }

    // Check for LV03 (6-digit coordinates)
    if (CoordinateTransformer.detectLV03Coordinates(points)) {
      console.debug('Detected Swiss LV03 coordinates');
      return COORDINATE_SYSTEMS.SWISS_LV03;
    }

    console.debug('Using default WGS84 coordinates');
    return COORDINATE_SYSTEMS.WGS84;
  }

  private validateAndTransformCoordinates(x: number, y: number, sourceEPSG?: string): [number, number] {
    if (!sourceEPSG || sourceEPSG === COORDINATE_SYSTEMS.WGS84) {
      // If coordinates appear to be reversed, swap them
      if (Math.abs(x) <= 90 && Math.abs(y) > 90) {
        return [y, x];
      }
      return [x, y];
    }

    // Transform coordinates if a source coordinate system is specified
    if (!this.transformer) {
      this.transformer = createTransformer(sourceEPSG, COORDINATE_SYSTEMS.WGS84);
    }

    try {
      const transformed = this.transformer.transform({ x, y });
      return [transformed.x, transformed.y];
    } catch (err) {
      const error = err as Error;
      throw new Error(`Failed to transform coordinates from ${sourceEPSG} to WGS84: ${error.message}`);
    }
  }

  private readPoint(view: DataView, offset: number, sourceEPSG?: string): [number, number] {
    const x = view.getFloat64(offset, true);
    const y = view.getFloat64(offset + 8, true);
    return this.validateAndTransformCoordinates(x, y, sourceEPSG);
  }

  private readPoints(view: DataView, offset: number, numPoints: number, sourceEPSG?: string): Array<[number, number]> {
    const points: Array<[number, number]> = [];
    for (let i = 0; i < numPoints; i++) {
      points.push(this.readPoint(view, offset + i * 16, sourceEPSG));
    }
    return points;
  }

  private readPolyline(view: DataView, offset: number, sourceEPSG?: string): Geometry {
    const numParts = view.getInt32(offset + 36, true);
    const numPoints = view.getInt32(offset + 40, true);
    
    // Read part indices
    const parts: number[] = [];
    for (let i = 0; i < numParts; i++) {
      parts.push(view.getInt32(offset + 44 + i * 4, true));
    }
    parts.push(numPoints); // Add end index
    
    // Read points
    const pointsOffset = offset + 44 + numParts * 4;
    const coordinates: Array<[number, number]>[] = [];
    
    for (let i = 0; i < numParts; i++) {
      const start = parts[i];
      const end = parts[i + 1];
      const partPoints = this.readPoints(view, pointsOffset + start * 16, end - start, sourceEPSG);
      coordinates.push(partPoints);
    }
    
    return {
      type: numParts === 1 ? 'LineString' : 'MultiLineString',
      coordinates: numParts === 1 ? coordinates[0] : coordinates
    } as Geometry;
  }

  private readPolygon(view: DataView, offset: number, sourceEPSG?: string): Geometry {
    const numParts = view.getInt32(offset + 36, true);
    const numPoints = view.getInt32(offset + 40, true);
    
    // Read part indices
    const parts: number[] = [];
    for (let i = 0; i < numParts; i++) {
      parts.push(view.getInt32(offset + 44 + i * 4, true));
    }
    parts.push(numPoints); // Add end index
    
    // Read points
    const pointsOffset = offset + 44 + numParts * 4;
    const coordinates: Array<Array<[number, number]>> = [];
    
    for (let i = 0; i < numParts; i++) {
      const start = parts[i];
      const end = parts[i + 1];
      const ring = this.readPoints(view, pointsOffset + start * 16, end - start, sourceEPSG);
      coordinates.push(ring);
    }
    
    return {
      type: 'Polygon',
      coordinates
    };
  }

  private async parseShapefileRecords(buffer: ArrayBuffer, header: any, sourceEPSG?: string, onProgress?: (count: number) => void): Promise<GeoFeature[]> {
    const features: GeoFeature[] = [];
    const view = new DataView(buffer);
    let offset = 100; // Start after header
    let count = 0;
    
    while (offset < header.fileLength) {
      // Read record header
      const recordNumber = view.getInt32(offset, false);
      const contentLength = view.getInt32(offset + 4, false);
      offset += 8;
      
      // Read shape type
      const shapeType = view.getInt32(offset, true);
      offset += 4;
      
      let geometry: Geometry;
      
      try {
        switch (shapeType) {
          case SHAPE_TYPE.POINT:
            geometry = {
              type: 'Point',
              coordinates: this.readPoint(view, offset, sourceEPSG)
            };
            offset += 16;
            break;
            
          case SHAPE_TYPE.POLYLINE:
            geometry = this.readPolyline(view, offset - 4, sourceEPSG);
            offset += contentLength * 2 - 4;
            break;
            
          case SHAPE_TYPE.POLYGON:
            geometry = this.readPolygon(view, offset - 4, sourceEPSG);
            offset += contentLength * 2 - 4;
            break;
            
          default:
            offset += contentLength * 2 - 4;
            continue; // Skip unsupported types
        }
        
        features.push({
          type: 'Feature',
          geometry,
          properties: {}
        });
      } catch (err) {
        const error = err as Error;
        console.warn(`Error reading feature at offset ${offset}:`, error);
        // Skip this feature and continue with the next one
        offset += contentLength * 2 - 4;
      }
      
      count++;
      if (count % LOAD_CHUNK_SIZE === 0) {
        onProgress?.(count);
        // Allow UI to update
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    
    onProgress?.(count);
    return features;
  }

  async analyze(file: File): Promise<AnalyzeResult> {
    try {
      // Validate required components
      this.validateComponents(file);

      // Read the main shapefile
      const shpBuffer = await file.arrayBuffer();
      const header = await this.readShapefileHeader(shpBuffer);
      
      // Detect coordinate system from bounds
      const detectedSystem = this.detectCoordinateSystem(header.bounds);
      console.debug('Detected coordinate system:', detectedSystem);
      
      // Read a preview chunk of features using the detected coordinate system
      const features = await this.parseShapefileRecords(shpBuffer, header, detectedSystem);
      const previewFeatures = features.slice(0, PREVIEW_CHUNK_SIZE);

      // Generate preview
      const preview: GeoFeatureCollection = {
        type: 'FeatureCollection',
        features: previewFeatures,
      };

      return {
        layers: ['default'],
        coordinateSystem: detectedSystem,
        bounds: {
          minX: header.bounds.xMin,
          minY: header.bounds.yMin,
          maxX: header.bounds.xMax,
          maxY: header.bounds.yMax
        },
        preview,
      };
    } catch (err) {
      const error = err as Error;
      console.error('Shapefile analysis error:', error);
      throw new Error(error.message || 'Failed to analyze shapefile');
    }
  }

  async load(file: File, options: LoaderOptions): Promise<LoaderResult> {
    try {
      // Reset transformer instance
      this.transformer = null;

      // Validate required components
      this.validateComponents(file);

      // Read the main shapefile
      const shpBuffer = await file.arrayBuffer();
      const header = await this.readShapefileHeader(shpBuffer);
      
      // If no coordinate system is specified in options, detect it
      const sourceSystem = options.coordinateSystem || this.detectCoordinateSystem(header.bounds);
      console.debug('Using coordinate system:', sourceSystem);
      
      // Parse all features with progress tracking
      const features = await this.parseShapefileRecords(
        shpBuffer, 
        header, 
        sourceSystem,
        count => this.emitProgress(count)
      );

      // Process features
      const featureTypes: Record<string, number> = {};
      features.forEach(feature => {
        // Optionally remove attributes based on `importAttributes`
        if (!options.importAttributes) {
          feature.properties = {};
        }

        // Count feature types
        const type = feature.geometry.type;
        featureTypes[type] = (featureTypes[type] || 0) + 1;
      });

      // Transform bounds if needed
      let bounds = {
        minX: header.bounds.xMin,
        minY: header.bounds.yMin,
        maxX: header.bounds.xMax,
        maxY: header.bounds.yMax
      };

      if (sourceSystem !== COORDINATE_SYSTEMS.WGS84) {
        const transformer = createTransformer(sourceSystem, COORDINATE_SYSTEMS.WGS84);
        bounds = transformer.transformBounds(bounds);
      }

      return {
        features,
        bounds,
        layers: ['default'],
        coordinateSystem: COORDINATE_SYSTEMS.WGS84, // Output is always in WGS84
        statistics: {
          pointCount: features.length,
          layerCount: 1,
          featureTypes,
        },
      };
    } catch (err) {
      const error = err as Error;
      console.error('Shapefile loading error:', error);
      throw new Error(error.message || 'Failed to load shapefile');
    }
  }
}

export default new ShapefileLoader();
