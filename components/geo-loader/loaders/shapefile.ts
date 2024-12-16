// components/geo-loader/loaders/shapefile.ts

import { GeoFileLoader, LoaderOptions, LoaderResult, GeoFeature, GeoFeatureCollection, AnalyzeResult, Geometry } from '../../../types/geo';
import { createTransformer, suggestCoordinateSystem } from '../utils/coordinate-utils';
import { COORDINATE_SYSTEMS } from '../utils/coordinate-systems';
import {
  createPointGeometry,
  createMultiPointGeometry,
  createLineStringGeometry,
  createMultiLineStringGeometry,
  createPolygonGeometry,
  createMultiPolygonGeometry,
  createFeature
} from '../utils/geometry-utils';

const PREVIEW_CHUNK_SIZE = 100;
const LOAD_CHUNK_SIZE = 1000;

// Shapefile format specification constants
const SHAPE_TYPE = {
  NULL: 0,
  POINT: 1,
  POINTZ: 11,
  POINTM: 21,
  POLYLINE: 3,
  POLYLINEZ: 13,
  POLYLINEM: 23,
  POLYGON: 5,
  POLYGONZ: 15,
  POLYGONM: 25,
  MULTIPOINT: 8,
  MULTIPOINTZ: 18,
  MULTIPOINTM: 28,
};

interface ShapeFile extends File {
  relatedFiles: {
    [key: string]: File
  }
}

interface LoadError {
  featureIndex: number;
  error: string;
  severity: 'warning' | 'error';
}

interface DBFField {
  name: string;
  type: string;
  length: number;
  decimalCount: number;
}

class ShapefileLoader implements GeoFileLoader {
  private transformer: ReturnType<typeof createTransformer> | null = null;
  private errors: LoadError[] = [];
  private dbfFields: DBFField[] = [];

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

  private async readPRJFile(prjFile: File): Promise<string | null> {
    try {
      const text = await prjFile.text();
      // TODO: Add proper WKT projection parsing
      // For now, just check for common projection strings
      if (text.includes('CH1903+')) {
        return COORDINATE_SYSTEMS.SWISS_LV95;
      } else if (text.includes('CH1903')) {
        return COORDINATE_SYSTEMS.SWISS_LV03;
      }
      return null;
    } catch (err) {
      console.warn('Failed to parse PRJ file:', err);
      return null;
    }
  }

  private async readDBFHeader(buffer: ArrayBuffer): Promise<{ fields: DBFField[], recordCount: number }> {
    const view = new DataView(buffer);
    const recordCount = view.getInt32(4, true);
    const headerLength = view.getInt16(8, true);
    const recordLength = view.getInt16(10, true);
    const fields: DBFField[] = [];
    
    let offset = 32; // Start of field descriptors
    while (offset < headerLength - 1) {
      // Check for field descriptor array terminator (0x0D)
      if (view.getUint8(offset) === 0x0D) break;
      
      const fieldName = new TextDecoder().decode(new Uint8Array(buffer, offset, 11)).split('\0')[0];
      const fieldType = String.fromCharCode(view.getUint8(offset + 11));
      const fieldLength = view.getUint8(offset + 16);
      const decimalCount = view.getUint8(offset + 17);
      
      fields.push({
        name: fieldName,
        type: fieldType,
        length: fieldLength,
        decimalCount: decimalCount
      });
      
      offset += 32; // Move to next field descriptor
    }
    
    this.dbfFields = fields;
    return { fields, recordCount };
  }

  private async readDBFRecords(buffer: ArrayBuffer, header: { fields: DBFField[], recordCount: number }): Promise<Record<number, Record<string, any>>> {
    const view = new DataView(buffer);
    const records: Record<number, Record<string, any>> = {};
    const headerLength = view.getInt16(8, true);
    let offset = headerLength;
    
    for (let i = 0; i < header.recordCount; i++) {
      const record: Record<string, any> = {};
      let fieldOffset = offset + 1; // Skip delete flag
      
      for (const field of header.fields) {
        const value = new TextDecoder().decode(
          new Uint8Array(buffer, fieldOffset, field.length)
        ).trim();
        
        record[field.name] = this.convertDBFValue(value, field.type);
        fieldOffset += field.length;
      }
      
      records[i + 1] = record;
      offset += fieldOffset - offset;
    }
    
    return records;
  }

  private convertDBFValue(value: string, type: string): any {
    switch (type) {
      case 'N': // Number
      case 'F': // Float
        return value === '' ? null : Number(value);
      case 'L': // Logical
        return value.toLowerCase() === 't' || value.toLowerCase() === 'y';
      case 'D': // Date
        if (value.length === 8) {
          return new Date(
            parseInt(value.slice(0, 4)),
            parseInt(value.slice(4, 6)) - 1,
            parseInt(value.slice(6, 8))
          );
        }
        return null;
      default:
        return value;
    }
  }

  private emitProgress(count: number) {
    const progressEvent = new CustomEvent('shapefileLoadProgress', { 
      detail: { count } 
    });
    window.dispatchEvent(progressEvent);
  }

  private async readShapefileHeader(buffer: ArrayBuffer) {
    const view = new DataView(buffer);
    
    const fileCode = view.getInt32(0, false);
    if (fileCode !== 9994) {
      throw new Error('Invalid shapefile: incorrect file code');
    }
    
    const fileLength = view.getInt32(24, false) * 2;
    const version = view.getInt32(28, true);
    const shapeType = view.getInt32(32, true);
    
    const xMin = view.getFloat64(36, true);
    const yMin = view.getFloat64(44, true);
    const xMax = view.getFloat64(52, true);
    const yMax = view.getFloat64(60, true);
    const zMin = view.getFloat64(68, true);
    const zMax = view.getFloat64(76, true);
    const mMin = view.getFloat64(84, true);
    const mMax = view.getFloat64(92, true);
    
    return {
      fileLength,
      version,
      shapeType,
      bounds: { 
        xMin, yMin, xMax, yMax,
        zMin, zMax, mMin, mMax 
      }
    };
  }

  private validateAndTransformCoordinates(x: number, y: number, z?: number, m?: number, sourceEPSG?: string): [number, number] | [number, number, number] | [number, number, number, number] {
    let coordinates: [number, number] | [number, number, number] | [number, number, number, number];
    
    if (!sourceEPSG || sourceEPSG === COORDINATE_SYSTEMS.WGS84) {
      if (Math.abs(x) <= 90 && Math.abs(y) > 90) {
        [x, y] = [y, x];
      }
    } else {
      if (!this.transformer) {
        this.transformer = createTransformer(sourceEPSG, COORDINATE_SYSTEMS.WGS84);
      }

      try {
        const transformed = this.transformer.transform({ x, y });
        x = transformed.x;
        y = transformed.y;
      } catch (err) {
        const error = err as Error;
        throw new Error(`Failed to transform coordinates from ${sourceEPSG} to WGS84: ${error.message}`);
      }
    }

    coordinates = [x, y];
    if (typeof z === 'number') coordinates.push(z);
    if (typeof m === 'number') coordinates.push(m);
    
    return coordinates;
  }

  private readPoint(view: DataView, offset: number, hasZ: boolean, hasM: boolean, sourceEPSG?: string):
    [number, number] | [number, number, number] | [number, number, number, number] {
    const x = view.getFloat64(offset, true);
    const y = view.getFloat64(offset + 8, true);
    const z = hasZ ? view.getFloat64(offset + 16, true) : undefined;
    const m = hasM ? view.getFloat64(offset + (hasZ ? 24 : 16), true) : undefined;
    
    return this.validateAndTransformCoordinates(x, y, z, m, sourceEPSG);
  }

  private readPoints(view: DataView, offset: number, numPoints: number, hasZ: boolean, hasM: boolean, sourceEPSG?: string):
    Array<[number, number] | [number, number, number] | [number, number, number, number]> {
    const points = [];
    const pointSize = 16 + (hasZ ? 8 : 0) + (hasM ? 8 : 0);
    
    for (let i = 0; i < numPoints; i++) {
      points.push(this.readPoint(view, offset + i * pointSize, hasZ, hasM, sourceEPSG));
    }
    return points;
  }

  private readMultiPoint(view: DataView, offset: number, hasZ: boolean, hasM: boolean, sourceEPSG?: string): Geometry {
    const numPoints = view.getInt32(offset + 36, true);
    const points = this.readPoints(view, offset + 40, numPoints, hasZ, hasM, sourceEPSG);
    return createMultiPointGeometry(points);
  }

  private readPolyline(view: DataView, offset: number, hasZ: boolean, hasM: boolean, sourceEPSG?: string): Geometry {
    const numParts = view.getInt32(offset + 36, true);
    const numPoints = view.getInt32(offset + 40, true);
    
    const parts: number[] = [];
    for (let i = 0; i < numParts; i++) {
      parts.push(view.getInt32(offset + 44 + i * 4, true));
    }
    parts.push(numPoints);
    
    const pointsOffset = offset + 44 + numParts * 4;
    const lineParts: Array<Array<[number, number] | [number, number, number] | [number, number, number, number]>> = [];
    
    for (let i = 0; i < numParts; i++) {
      const start = parts[i];
      const end = parts[i + 1];
      const partPoints = this.readPoints(view, pointsOffset + start * 16, end - start, hasZ, hasM, sourceEPSG);
      lineParts.push(partPoints);
    }
    
    if (numParts === 1) {
      // single line
      return createLineStringGeometry(lineParts[0]);
    } else {
      // multiple lines
      return createMultiLineStringGeometry(lineParts);
    }
  }

  private readPolygon(view: DataView, offset: number, hasZ: boolean, hasM: boolean, sourceEPSG?: string): Geometry {
    const numParts = view.getInt32(offset + 36, true);
    const numPoints = view.getInt32(offset + 40, true);
    
    const parts: number[] = [];
    for (let i = 0; i < numParts; i++) {
      parts.push(view.getInt32(offset + 44 + i * 4, true));
    }
    parts.push(numPoints);
    
    const pointsOffset = offset + 44 + numParts * 4;
    const rings: Array<Array<[number, number] | [number, number, number] | [number, number, number, number]>> = [];
    
    for (let i = 0; i < numParts; i++) {
      const start = parts[i];
      const end = parts[i + 1];
      const ring = this.readPoints(view, pointsOffset + start * 16, end - start, hasZ, hasM, sourceEPSG);
      rings.push(ring);
    }
    
    // Organize rings into exterior and interior (holes)
    const polygons: Array<Array<Array<[number, number] | [number, number, number] | [number, number, number, number]>>> = [];
    let currentPolygon: Array<Array<[number, number] | [number, number, number] | [number, number, number, number]>> = [];
    
    for (const ring of rings) {
      if (this.isClockwise(ring)) {
        if (currentPolygon.length > 0) {
          polygons.push(currentPolygon);
        }
        currentPolygon = [ring];
      } else {
        currentPolygon.push(ring);
      }
    }
    
    if (currentPolygon.length > 0) {
      polygons.push(currentPolygon);
    }
    
    if (polygons.length === 1) {
      // Single polygon
      return createPolygonGeometry(polygons[0]);
    } else {
      // MultiPolygon
      return createMultiPolygonGeometry(polygons);
    }
  }

  private isClockwise(ring: Array<[number, number] | [number, number, number] | [number, number, number, number]>): boolean {
    // Calculate the signed area to determine ring direction
    let sum = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const [x1, y1] = ring[i];
      const [x2, y2] = ring[i + 1];
      sum += (x2 - x1) * (y2 + y1);
    }
    return sum > 0;
  }

  private async *streamFeatures(buffer: ArrayBuffer, header: any, sourceEPSG?: string): AsyncGenerator<GeoFeature, void, undefined> {
    const view = new DataView(buffer);
    let offset = 100; // Start after header
    let count = 0;
    
    while (offset < header.fileLength) {
      const recordNumber = view.getInt32(offset, false);
      const contentLength = view.getInt32(offset + 4, false);
      offset += 8;
      
      const shapeType = view.getInt32(offset, true);
      offset += 4;
      
      let geometry: Geometry | null = null;
      const hasZ = [SHAPE_TYPE.POINTZ, SHAPE_TYPE.POLYLINEZ, SHAPE_TYPE.POLYGONZ, SHAPE_TYPE.MULTIPOINTZ].includes(shapeType);
      const hasM = [SHAPE_TYPE.POINTM, SHAPE_TYPE.POLYLINEM, SHAPE_TYPE.POLYGONM, SHAPE_TYPE.MULTIPOINTM].includes(shapeType);
      
      try {
        switch (shapeType) {
          case SHAPE_TYPE.POINT:
          case SHAPE_TYPE.POINTZ:
          case SHAPE_TYPE.POINTM:
            const pointCoords = this.readPoint(view, offset, hasZ, hasM, sourceEPSG);
            geometry = createPointGeometry(...pointCoords);
            break;
            
          case SHAPE_TYPE.MULTIPOINT:
          case SHAPE_TYPE.MULTIPOINTZ:
          case SHAPE_TYPE.MULTIPOINTM:
            geometry = this.readMultiPoint(view, offset - 4, hasZ, hasM, sourceEPSG);
            break;
            
          case SHAPE_TYPE.POLYLINE:
          case SHAPE_TYPE.POLYLINEZ:
          case SHAPE_TYPE.POLYLINEM:
            geometry = this.readPolyline(view, offset - 4, hasZ, hasM, sourceEPSG);
            break;
            
          case SHAPE_TYPE.POLYGON:
          case SHAPE_TYPE.POLYGONZ:
          case SHAPE_TYPE.POLYGONM:
            geometry = this.readPolygon(view, offset - 4, hasZ, hasM, sourceEPSG);
            break;
        }
        
        if (geometry) {
          yield createFeature(geometry, {});
        }
      } catch (err) {
        const error = err as Error;
        this.errors.push({
          featureIndex: count,
          error: error.message,
          severity: 'warning'
        });
        console.warn(`Error reading feature at offset ${offset}:`, error);
      }
      
      offset += contentLength * 2 - 4;
      count++;
    }
  }

  async analyze(file: File): Promise<AnalyzeResult> {
    try {
      const relatedFiles = this.validateComponents(file);
      
      // Read projection information if available
      let coordinateSystem = null;
      if (relatedFiles['.prj']) {
        coordinateSystem = await this.readPRJFile(relatedFiles['.prj']);
      }
      
      // Read the main shapefile
      const shpBuffer = await file.arrayBuffer();
      const header = await this.readShapefileHeader(shpBuffer);
      
      // If no coordinate system was found in PRJ, detect it from some sample features
      if (!coordinateSystem) {
        // We need sample points to detect CRS:
        const sampleFeatures: GeoFeature[] = [];
        for await (const feature of this.streamFeatures(shpBuffer, header)) {
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
        coordinateSystem = suggestCoordinateSystem(samplePoints);
      }
      
      // Read DBF header for attribute information
      if (relatedFiles['.dbf']) {
        const dbfBuffer = await relatedFiles['.dbf'].arrayBuffer();
        await this.readDBFHeader(dbfBuffer);
      }
      
      // Generate preview features
      const previewFeatures: GeoFeature[] = [];
      for await (const feature of this.streamFeatures(shpBuffer, header, coordinateSystem)) {
        previewFeatures.push(feature);
        if (previewFeatures.length >= PREVIEW_CHUNK_SIZE) break;
      }

      return {
        layers: ['default'],
        coordinateSystem,
        bounds: {
          minX: header.bounds.xMin,
          minY: header.bounds.yMin,
          maxX: header.bounds.xMax,
          maxY: header.bounds.yMax,
          minZ: header.bounds.zMin,
          maxZ: header.bounds.zMax,
          minM: header.bounds.mMin,
          maxM: header.bounds.mMax
        },
        preview: {
          type: 'FeatureCollection',
          features: previewFeatures
        },
        fieldInfo: this.dbfFields
      };
    } catch (err) {
      const error = err as Error;
      console.error('Shapefile analysis error:', error);
      throw new Error(error.message || 'Failed to analyze shapefile');
    }
  }

  async load(file: File, options: LoaderOptions): Promise<LoaderResult> {
    try {
      this.transformer = null;
      this.errors = [];
      
      const relatedFiles = this.validateComponents(file);
      
      // Read projection information if available
      let sourceSystem = options.coordinateSystem;
      if (!sourceSystem && relatedFiles['.prj']) {
        sourceSystem = await this.readPRJFile(relatedFiles['.prj']);
      }
      
      // Read the main shapefile
      const shpBuffer = await file.arrayBuffer();
      const header = await this.readShapefileHeader(shpBuffer);
      
      // If no coordinate system is specified, detect it from sample points
      if (!sourceSystem) {
        const sampleFeatures: GeoFeature[] = [];
        for await (const feature of this.streamFeatures(shpBuffer, header)) {
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
        sourceSystem = suggestCoordinateSystem(samplePoints);
      }
      
      // Read DBF data if attributes should be imported
      let attributeData: Record<number, Record<string, any>> = {};
      if (options.importAttributes && relatedFiles['.dbf']) {
        const dbfBuffer = await relatedFiles['.dbf'].arrayBuffer();
        const dbfHeader = await this.readDBFHeader(dbfBuffer);
        attributeData = await this.readDBFRecords(dbfBuffer, dbfHeader);
      }
      
      // Process all features
      const features: GeoFeature[] = [];
      const featureTypes: Record<string, number> = {};
      let count = 0;
      
      for await (const feature of this.streamFeatures(shpBuffer, header, sourceSystem)) {
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
        maxY: header.bounds.yMax,
        minZ: header.bounds.zMin,
        maxZ: header.bounds.zMax,
        minM: header.bounds.mMin,
        maxM: header.bounds.mMax
      };

      if (sourceSystem !== COORDINATE_SYSTEMS.WGS84) {
        const transformer = createTransformer(sourceSystem, COORDINATE_SYSTEMS.WGS84);
        bounds = transformer.transformBounds(bounds);
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
        },
        errors: this.errors,
      };
    } catch (err) {
      const error = err as Error;
      console.error('Shapefile loading error:', error);
      throw new Error(error.message || 'Failed to load shapefile');
    }
  }
}

export default new ShapefileLoader();
