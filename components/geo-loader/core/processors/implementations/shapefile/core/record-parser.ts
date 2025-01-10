import { ValidationError } from '../../../../errors/types';
import { ShapeType, ShapefileRecord } from '../types';
import { ShapefileValidator } from './validator';
import { GeometryConverter } from './geometry-converter';
import { HeaderParser } from './header-parser';

export class RecordParser {
  private validator: ShapefileValidator;
  private geometryConverter: GeometryConverter;
  private headerParser: HeaderParser;
  private static readonly RECORD_HEADER_LENGTH = 8;

  constructor() {
    this.validator = new ShapefileValidator();
    this.geometryConverter = new GeometryConverter();
    this.headerParser = new HeaderParser();
  }

  /**
   * Parse shapefile records with streaming support
   */
  async *parseRecords(
    buffer: ArrayBuffer,
    headerLength: number,
    options: { maxRecords?: number } = {}
  ): AsyncGenerator<ShapefileRecord, void, undefined> {
    const view = new DataView(buffer);
    let offset = headerLength;
    let count = 0;
    
    try {
      while (offset < buffer.byteLength) {
        // Check record limit
        if (options.maxRecords && count >= options.maxRecords) {
          break;
        }

        // Validate enough space for record header
        if (offset + RecordParser.RECORD_HEADER_LENGTH > view.byteLength) {
          throw new ValidationError(
            'Invalid shapefile: truncated record header',
            'SHAPEFILE_PARSE_ERROR',
            undefined,
            { offset, bufferSize: view.byteLength }
          );
        }

        // Read record header
        const { recordNumber, contentLength } = this.headerParser.readRecordHeader(view, offset);

        // Validate enough space for complete record
        const recordSize = RecordParser.RECORD_HEADER_LENGTH + contentLength * 2;
        this.validator.validateRecordBufferSpace(offset, recordSize, view.byteLength, recordNumber);

        offset += RecordParser.RECORD_HEADER_LENGTH;
        
        // Read shape type
        const shapeType = this.headerParser.readShapeType(view, offset);
        offset += 4;
        
        try {
          const geometry = await this.parseGeometry(view, offset, shapeType);
          if (geometry) {
            yield {
              header: {
                recordNumber,
                contentLength
              },
              shapeType,
              data: geometry as unknown as Record<string, unknown>,
              attributes: {
                recordNumber
              }
            };
          }
        } catch (error) {
          // Log the error but continue processing other records
          console.warn(`Error parsing record ${recordNumber} at offset ${offset}:`, error);
        }
        
        offset += contentLength * 2 - 4;
        count++;
      }
    } catch (error) {
      throw new ValidationError(
        `Error streaming records: ${error instanceof Error ? error.message : String(error)}`,
        'SHAPEFILE_PARSE_ERROR'
      );
    }
  }

  /**
   * Parse geometry from buffer based on shape type
   */
  private async parseGeometry(
    view: DataView,
    offset: number,
    shapeType: ShapeType
  ): Promise<Record<string, unknown> | null> {
    switch (shapeType) {
      case ShapeType.NULL:
        return null;
        
      case ShapeType.POINT:
      case ShapeType.POINTZ:
      case ShapeType.POINTM:
        return this.parsePoint(view, offset);
        
      case ShapeType.MULTIPOINT:
      case ShapeType.MULTIPOINTZ:
      case ShapeType.MULTIPOINTM:
        return this.parseMultiPoint(view, offset);
        
      case ShapeType.POLYLINE:
      case ShapeType.POLYLINEZ:
      case ShapeType.POLYLINEM:
        return this.parsePolyline(view, offset);
        
      case ShapeType.POLYGON:
      case ShapeType.POLYGONZ:
      case ShapeType.POLYGONM:
        return this.parsePolygon(view, offset);
        
      default:
        throw new ValidationError(
          `Unsupported shape type: ${shapeType}`,
          'SHAPEFILE_PARSE_ERROR',
          undefined,
          { shapeType }
        );
    }
  }

  /**
   * Parse point geometry
   */
  private parsePoint(view: DataView, offset: number): Record<string, unknown> {
    const x = view.getFloat64(offset, true);
    const y = view.getFloat64(offset + 8, true);
    
    return {
      type: 'Point',
      coordinates: [x, y]
    };
  }

  /**
   * Parse multipoint geometry
   */
  private parseMultiPoint(view: DataView, offset: number): Record<string, unknown> {
    // Skip bounding box (4 * 8 = 32 bytes)
    const numPoints = view.getInt32(offset + 32, true);
    
    // Validate reasonable value for numPoints
    if (numPoints < 0 || numPoints > 1000000) {
      throw new ValidationError(
        `Invalid multipoint: unreasonable number of points (${numPoints})`,
        'SHAPEFILE_PARSE_ERROR'
      );
    }

    const points: [number, number][] = [];
    let pointOffset = offset + 36;
    
    for (let i = 0; i < numPoints; i++) {
      const x = view.getFloat64(pointOffset, true);
      const y = view.getFloat64(pointOffset + 8, true);
      points.push([x, y]);
      pointOffset += 16;
    }
    
    return {
      type: 'MultiPoint',
      coordinates: points
    };
  }

  /**
   * Parse polyline geometry
   */
  private parsePolyline(view: DataView, offset: number): Record<string, unknown> {
    // Skip bounding box (4 * 8 = 32 bytes)
    const numParts = view.getInt32(offset + 32, true);
    const numPoints = view.getInt32(offset + 36, true);

    // Validate parts and points
    this.validator.validatePartsAndPoints(numParts, numPoints, 'polyline');

    // Read part indices
    const parts: number[] = [];
    let partOffset = offset + 40;
    
    for (let i = 0; i < numParts; i++) {
      const partIndex = view.getInt32(partOffset + i * 4, true);
      this.validator.validatePartIndex(partIndex, numPoints);
      parts.push(partIndex);
    }
    parts.push(numPoints);

    // Read points for each part
    const coordinates: [number, number][][] = [];
    let pointOffset = partOffset + (numParts * 4);
    
    for (let i = 0; i < numParts; i++) {
      const partPoints: [number, number][] = [];
      const start = parts[i];
      const end = parts[i + 1];
      
      this.validator.validatePartRange(start, end, i);

      for (let j = start; j < end; j++) {
        const x = view.getFloat64(pointOffset + (j * 16), true);
        const y = view.getFloat64(pointOffset + (j * 16) + 8, true);
        this.validator.validatePointCoordinates(x, y, i, j);
        partPoints.push([x, y]);
      }
      
      if (partPoints.length >= 2) {
        coordinates.push(partPoints);
      }
    }

    return coordinates.length === 1
      ? { type: 'LineString', coordinates: coordinates[0] }
      : { type: 'MultiLineString', coordinates };
  }

  /**
   * Parse polygon geometry
   */
  private parsePolygon(view: DataView, offset: number): Record<string, unknown> {
    // Skip bounding box (4 * 8 = 32 bytes)
    const numParts = view.getInt32(offset + 32, true);
    const numPoints = view.getInt32(offset + 36, true);

    // Validate parts and points
    this.validator.validatePartsAndPoints(numParts, numPoints, 'polygon');

    // Read part indices
    const parts: number[] = [];
    let partOffset = offset + 40;
    
    for (let i = 0; i < numParts; i++) {
      const partIndex = view.getInt32(partOffset + i * 4, true);
      this.validator.validatePartIndex(partIndex, numPoints);
      parts.push(partIndex);
    }
    parts.push(numPoints);

    // Read rings
    const rings: [number, number][][] = [];
    let pointOffset = partOffset + (numParts * 4);
    
    for (let i = 0; i < numParts; i++) {
      const ring: [number, number][] = [];
      const start = parts[i];
      const end = parts[i + 1];
      
      this.validator.validatePartRange(start, end, i);

      for (let j = start; j < end; j++) {
        const x = view.getFloat64(pointOffset + (j * 16), true);
        const y = view.getFloat64(pointOffset + (j * 16) + 8, true);
        this.validator.validatePointCoordinates(x, y, i, j);
        ring.push([x, y]);
      }
      
      rings.push(ring);
    }

    // Organize rings into polygons
    const polygons: [number, number][][][] = [];
    let currentPolygon: [number, number][][] = [];
    
    for (const ring of rings) {
      if (this.geometryConverter.isClockwise(ring)) {
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

    return polygons.length === 1
      ? { type: 'Polygon', coordinates: polygons[0] }
      : { type: 'MultiPolygon', coordinates: polygons };
  }
}
