// components/geo-loader/loaders/shapefile.ts

import { GeoFileLoader, LoaderOptions, LoaderResult, GeoFeature, GeoFeatureCollection, AnalyzeResult, Geometry } from '../../../types/geo';

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

  private validateAndTransformCoordinates(x: number, y: number, sourceEPSG?: string): [number, number] {
    // If coordinates are in a different system, they need to be transformed to WGS84
    if (sourceEPSG && sourceEPSG !== 'EPSG:4326') {
      // TODO: Implement coordinate system transformation
      // For now, we'll just swap coordinates if they appear to be reversed
      if (Math.abs(x) <= 90 && Math.abs(y) > 90) {
        return [y, x];
      }
    }

    // Handle reversed coordinates (common issue)
    if (Math.abs(x) <= 90 && Math.abs(y) > 90) {
      return [y, x];
    }

    // If coordinates are still invalid after attempted fixes, throw error
    if (Math.abs(y) > 90) {
      throw new Error(`Invalid latitude value: ${y}. Must be between -90 and 90 degrees. This might indicate the data is in a different coordinate system.`);
    }

    return [x, y];
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
      } catch (error) {
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
      
      // Read a preview chunk of features
      const features = await this.parseShapefileRecords(shpBuffer, header);
      const previewFeatures = features.slice(0, PREVIEW_CHUNK_SIZE);

      // Generate preview
      const preview: GeoFeatureCollection = {
        type: 'FeatureCollection',
        features: previewFeatures,
      };

      return {
        layers: ['default'],
        coordinateSystem: 'EPSG:4326',
        bounds: {
          minX: header.bounds.xMin,
          minY: header.bounds.yMin,
          maxX: header.bounds.xMax,
          maxY: header.bounds.yMax
        },
        preview,
      };
    } catch (error) {
      console.error('Shapefile analysis error:', error);
      throw new Error(error instanceof Error ? error.message : 'Failed to analyze shapefile');
    }
  }

  async load(file: File, options: LoaderOptions): Promise<LoaderResult> {
    try {
      // Validate required components
      this.validateComponents(file);

      // Read the main shapefile
      const shpBuffer = await file.arrayBuffer();
      const header = await this.readShapefileHeader(shpBuffer);
      
      // Parse all features with progress tracking
      const features = await this.parseShapefileRecords(
        shpBuffer, 
        header, 
        options.coordinateSystem,
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

      return {
        features,
        bounds: {
          minX: header.bounds.xMin,
          minY: header.bounds.yMin,
          maxX: header.bounds.xMax,
          maxY: header.bounds.yMax
        },
        layers: ['default'],
        coordinateSystem: options.coordinateSystem || 'EPSG:4326',
        statistics: {
          pointCount: features.length,
          layerCount: 1,
          featureTypes,
        },
      };
    } catch (error) {
      console.error('Shapefile loading error:', error);
      throw new Error(error instanceof Error ? error.message : 'Failed to load shapefile');
    }
  }
}

export default new ShapefileLoader();
