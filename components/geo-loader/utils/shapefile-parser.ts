import { GeoFeature } from '../../../types/geo';
import { Geometry } from 'geojson';
import {
  createPointGeometry,
  createMultiPointGeometry,
  createLineStringGeometry,
  createMultiLineStringGeometry,
  createPolygonGeometry,
  createMultiPolygonGeometry,
  createFeature
} from './geometry-utils';
import { ErrorReporter, ParseError } from './errors';

// Shapefile format specification constants
export const SHAPE_TYPE = {
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
} as const;

type ShapeType = typeof SHAPE_TYPE[keyof typeof SHAPE_TYPE];
type ZShapeType = typeof SHAPE_TYPE.POINTZ | typeof SHAPE_TYPE.POLYLINEZ | typeof SHAPE_TYPE.POLYGONZ | typeof SHAPE_TYPE.MULTIPOINTZ;
type MShapeType = typeof SHAPE_TYPE.POINTM | typeof SHAPE_TYPE.POLYLINEM | typeof SHAPE_TYPE.POLYGONM | typeof SHAPE_TYPE.MULTIPOINTM;

const isZShape = (type: ShapeType): type is ZShapeType => {
  return [SHAPE_TYPE.POINTZ, SHAPE_TYPE.POLYLINEZ, SHAPE_TYPE.POLYGONZ, SHAPE_TYPE.MULTIPOINTZ].includes(type as ZShapeType);
};

const isMShape = (type: ShapeType): type is MShapeType => {
  return [SHAPE_TYPE.POINTM, SHAPE_TYPE.POLYLINEM, SHAPE_TYPE.POLYGONM, SHAPE_TYPE.MULTIPOINTM].includes(type as MShapeType);
};

export interface DBFField {
  name: string;
  type: string;
  length: number;
  decimalCount: number;
}

export interface ShapefileHeader {
  fileLength: number;
  version: number;
  shapeType: ShapeType;
  bounds: {
    xMin: number;
    yMin: number;
    xMax: number;
    yMax: number;
    zMin: number;
    zMax: number;
    mMin: number;
    mMax: number;
  };
}


type Coordinates2D = [number, number];
type Coordinates3D = [number, number, number];

export class ShapefileParser {
  private dbfFields: DBFField[] = [];

  constructor(private errorReporter: ErrorReporter) {}

  async readShapefileHeader(buffer: ArrayBuffer): Promise<ShapefileHeader> {
    const view = new DataView(buffer);
    
    const fileCode = view.getInt32(0, false);
    if (fileCode !== 9994) {
      throw new ParseError(
        'Invalid shapefile: incorrect file code',
        'shapefile',
        'unknown',
        { fileCode }
      );
    }
    
    const fileLength = view.getInt32(24, false) * 2;
    const version = view.getInt32(28, true);
    const shapeType = view.getInt32(32, true) as ShapeType;
    
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

  async readDBFHeader(buffer: ArrayBuffer): Promise<{ fields: DBFField[], recordCount: number }> {
    const view = new DataView(buffer);
    const recordCount = view.getInt32(4, true);
    const headerLength = view.getInt16(8, true);
    const fields: DBFField[] = [];
    
    let offset = 32; // Start of field descriptors
    while (offset < headerLength - 1) {
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
      
      offset += 32;
    }
    
    this.dbfFields = fields;
    return { fields, recordCount };
  }

  async readDBFRecords(buffer: ArrayBuffer, header: { fields: DBFField[], recordCount: number }): Promise<Record<number, Record<string, any>>> {
    const view = new DataView(buffer);
    const records: Record<number, Record<string, any>> = {};
    const headerLength = view.getInt16(8, true);
    let offset = headerLength;
    
    for (let i = 0; i < header.recordCount; i++) {
      const record: Record<string, any> = {};
      let fieldOffset = offset + 1;
      
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
      case 'N':
      case 'F':
        return value === '' ? null : Number(value);
      case 'L':
        return value.toLowerCase() === 't' || value.toLowerCase() === 'y';
      case 'D':
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

  private readPoint(view: DataView, offset: number, hasZ: boolean): Coordinates2D | Coordinates3D {
    const x = view.getFloat64(offset, true);
    const y = view.getFloat64(offset + 8, true);
    const z = hasZ ? view.getFloat64(offset + 16, true) : undefined;
    
    return z !== undefined ? [x, y, z] : [x, y];
  }

  private readPoints(view: DataView, offset: number, numPoints: number, hasZ: boolean): Array<Coordinates2D | Coordinates3D> {
    const points = [];
    const pointSize = 16 + (hasZ ? 8 : 0);
    
    for (let i = 0; i < numPoints; i++) {
      points.push(this.readPoint(view, offset + i * pointSize, hasZ));
    }
    return points;
  }

  private readMultiPoint(view: DataView, offset: number, hasZ: boolean): Geometry {
    const numPoints = view.getInt32(offset + 36, true);
    const points = this.readPoints(view, offset + 40, numPoints, hasZ);
    return createMultiPointGeometry(points);
  }

  private readPolyline(view: DataView, offset: number, hasZ: boolean): Geometry {
    const numParts = view.getInt32(offset + 36, true);
    const numPoints = view.getInt32(offset + 40, true);
    
    const parts: number[] = [];
    for (let i = 0; i < numParts; i++) {
      parts.push(view.getInt32(offset + 44 + i * 4, true));
    }
    parts.push(numPoints);
    
    const pointsOffset = offset + 44 + numParts * 4;
    const lineParts: Array<Array<Coordinates2D | Coordinates3D>> = [];
    
    for (let i = 0; i < numParts; i++) {
      const start = parts[i];
      const end = parts[i + 1];
      const partPoints = this.readPoints(view, pointsOffset + start * 16, end - start, hasZ);
      lineParts.push(partPoints);
    }
    
    if (numParts === 1) {
      return createLineStringGeometry(lineParts[0]);
    } else {
      return createMultiLineStringGeometry(lineParts);
    }
  }

  private readPolygon(view: DataView, offset: number, hasZ: boolean): Geometry {
    const numParts = view.getInt32(offset + 36, true);
    const numPoints = view.getInt32(offset + 40, true);
    
    const parts: number[] = [];
    for (let i = 0; i < numParts; i++) {
      parts.push(view.getInt32(offset + 44 + i * 4, true));
    }
    parts.push(numPoints);
    
    const pointsOffset = offset + 44 + numParts * 4;
    const rings: Array<Array<Coordinates2D | Coordinates3D>> = [];
    
    for (let i = 0; i < numParts; i++) {
      const start = parts[i];
      const end = parts[i + 1];
      const ring = this.readPoints(view, pointsOffset + start * 16, end - start, hasZ);
      rings.push(ring);
    }
    
    const polygons: Array<Array<Array<Coordinates2D | Coordinates3D>>> = [];
    let currentPolygon: Array<Array<Coordinates2D | Coordinates3D>> = [];
    
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
      return createPolygonGeometry(polygons[0]);
    } else {
      return createMultiPolygonGeometry(polygons);
    }
  }

  private isClockwise(ring: Array<Coordinates2D | Coordinates3D>): boolean {
    let sum = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const [x1, y1] = ring[i];
      const [x2, y2] = ring[i + 1];
      sum += (x2 - x1) * (y2 + y1);
    }
    return sum > 0;
  }

  async *streamFeatures(buffer: ArrayBuffer, header: ShapefileHeader): AsyncGenerator<GeoFeature, void, undefined> {
    const view = new DataView(buffer);
    let offset = 100;
    let count = 0;
    
    while (offset < header.fileLength) {
      const recordNumber = view.getInt32(offset, false);
      const contentLength = view.getInt32(offset + 4, false);
      offset += 8;
      
      const shapeType = view.getInt32(offset, true) as ShapeType;
      offset += 4;
      
      let geometry: Geometry | null = null;
      const hasZ = isZShape(shapeType);
      
      try {
        switch (shapeType) {
          case SHAPE_TYPE.POINT:
          case SHAPE_TYPE.POINTZ:
          case SHAPE_TYPE.POINTM: {
            const coords = this.readPoint(view, offset, hasZ);
            geometry = createPointGeometry(coords[0], coords[1], coords[2]);
            break;
          }
          case SHAPE_TYPE.MULTIPOINT:
          case SHAPE_TYPE.MULTIPOINTZ:
          case SHAPE_TYPE.MULTIPOINTM:
            geometry = this.readMultiPoint(view, offset - 4, hasZ);
            break;
            
          case SHAPE_TYPE.POLYLINE:
          case SHAPE_TYPE.POLYLINEZ:
          case SHAPE_TYPE.POLYLINEM:
            geometry = this.readPolyline(view, offset - 4, hasZ);
            break;
            
          case SHAPE_TYPE.POLYGON:
          case SHAPE_TYPE.POLYGONZ:
          case SHAPE_TYPE.POLYGONM:
            geometry = this.readPolygon(view, offset - 4, hasZ);
            break;
        }
        
        if (geometry) {
          yield createFeature(geometry, {});
        }
      } catch (error) {
        if (error instanceof ParseError) {
          this.errorReporter.addError(error.message, error.code, error.details);
        } else {
          this.errorReporter.addWarning(
            `Error reading feature at offset ${offset}`,
            'SHAPEFILE_FEATURE_READ_ERROR',
            {
              featureIndex: count,
              offset,
              shapeType,
              error: error instanceof Error ? error.message : String(error)
            }
          );
        }
      }
      
      offset += contentLength * 2 - 4;
      count++;
    }
  }

  getErrors(): string[] {
    return this.errorReporter.getMessages().map(m => m.message);
  }

  getDBFFields(): DBFField[] {
    return this.dbfFields;
  }
}

export const createShapefileParser = (errorReporter: ErrorReporter) => new ShapefileParser(errorReporter);
