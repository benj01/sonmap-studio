import { ShapefileProcessorOptions, ShapefileAnalyzeResult, ShapefileRecord, ShapeType } from './types';
import { ValidationError } from '../../../errors/types';
import { Position } from 'geojson';

interface ParseOptions {
  parseDbf?: boolean;
  validate?: boolean;
  repair?: boolean;
  simplify?: boolean;
  tolerance?: number;
  convertToPostGIS?: boolean;
  postgis?: {
    targetSrid?: number;
    force2D?: boolean;
  };
}

interface AnalyzeOptions {
  previewRecords?: number;
  parseDbf?: boolean;
}

interface BoundingBox {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
}

interface ShapeData {
  coordinates: Position | Position[] | Position[][];
  bbox: BoundingBox;
  length: number;
}

/**
 * Parser for Shapefile format
 */
export class ShapefileParser {
  private options: ShapefileProcessorOptions;
  private static readonly HEADER_LENGTH = 100;
  private static readonly INT32_LENGTH = 4;
  private static readonly DOUBLE_LENGTH = 8;

  constructor(options: ShapefileProcessorOptions = {}) {
    this.options = options;
    console.debug('[ShapefileParser] Initialized with options:', options);
  }

  /**
   * Calculate bounding box from coordinates
   */
  private calculateBoundingBox(coordinates: Position[]): BoundingBox {
    const bbox = {
      xMin: Infinity,
      yMin: Infinity,
      xMax: -Infinity,
      yMax: -Infinity
    };

    coordinates.forEach(([x, y]) => {
      bbox.xMin = Math.min(bbox.xMin, x);
      bbox.yMin = Math.min(bbox.yMin, y);
      bbox.xMax = Math.max(bbox.xMax, x);
      bbox.yMax = Math.max(bbox.yMax, y);
    });

    return bbox;
  }

  /**
   * Read shapefile header
   */
  private async readHeader(buffer: ArrayBuffer): Promise<{
    fileCode: number;
    fileLength: number;
    version: number;
    shapeType: number;
    bbox: {
      xMin: number;
      yMin: number;
      xMax: number;
      yMax: number;
      zMin?: number;
      zMax?: number;
      mMin?: number;
      mMax?: number;
    };
  }> {
    console.debug('[ShapefileParser] Reading header from buffer:', {
      bufferLength: buffer.byteLength,
      headerLength: ShapefileParser.HEADER_LENGTH
    });

    const view = new DataView(buffer);
    
    // Read header values
    const fileCode = view.getInt32(0, false); // big-endian
    const fileLength = view.getInt32(24, false) * 2; // big-endian, in 16-bit words
    const version = view.getInt32(28, true); // little-endian
    const shapeType = view.getInt32(32, true); // little-endian

    // Read bounding box
    const xMin = view.getFloat64(36, true);
    const yMin = view.getFloat64(44, true);
    const xMax = view.getFloat64(52, true);
    const yMax = view.getFloat64(60, true);
    const zMin = view.getFloat64(68, true);
    const zMax = view.getFloat64(76, true);
    const mMin = view.getFloat64(84, true);
    const mMax = view.getFloat64(92, true);

    const header = {
      fileCode,
      fileLength,
      version,
      shapeType,
      bbox: {
        xMin,
        yMin,
        xMax,
        yMax,
        zMin,
        zMax,
        mMin,
        mMax
      }
    };

    console.debug('[ShapefileParser] Header read successfully:', header);
    return header;
  }

  /**
   * Read shapefile record
   */
  private readRecord(view: DataView, offset: number): {
    record: ShapefileRecord;
    nextOffset: number;
  } {
    console.debug('[ShapefileParser] Reading record at offset:', offset);

    // Read record header
    const recordNumber = view.getInt32(offset, false); // big-endian
    const contentLength = view.getInt32(offset + 4, false) * 2; // big-endian, in 16-bit words
    offset += 8;

    // Read shape type
    const shapeType = view.getInt32(offset, true); // little-endian
    offset += 4;

    console.debug('[ShapefileParser] Record header:', {
      recordNumber,
      contentLength,
      shapeType,
      shapeTypeName: ShapeType[shapeType]
    });

    // Read shape data based on type
    let data: ShapeData;
    switch (shapeType) {
      case ShapeType.POINT:
      case ShapeType.POINTZ:
      case ShapeType.POINTM:
        data = this.readPoint(view, offset);
        offset += data.length;
        break;
      case ShapeType.POLYLINE:
      case ShapeType.POLYLINEZ:
      case ShapeType.POLYLINEM:
        data = this.readPolyline(view, offset);
        offset += data.length;
        break;
      case ShapeType.POLYGON:
      case ShapeType.POLYGONZ:
      case ShapeType.POLYGONM:
        data = this.readPolygon(view, offset);
        offset += data.length;
        break;
      case ShapeType.MULTIPOINT:
      case ShapeType.MULTIPOINTZ:
      case ShapeType.MULTIPOINTM:
        data = this.readMultiPoint(view, offset);
        offset += data.length;
        break;
      default:
        throw new Error(`Unsupported shape type: ${shapeType}`);
    }

    console.debug('[ShapefileParser] Record data:', {
      type: ShapeType[shapeType],
      coordinates: data.coordinates,
      bbox: data.bbox,
      nextOffset: offset
    });

    return {
      record: {
        header: {
          recordNumber,
          contentLength
        },
        shapeType,
        data: {
          coordinates: data.coordinates,
          bbox: data.bbox
        }
      },
      nextOffset: offset
    };
  }

  /**
   * Read point coordinates
   */
  private readPoint(view: DataView, offset: number): ShapeData {
    const x = view.getFloat64(offset, true);
    const y = view.getFloat64(offset + 8, true);
    const coordinates: Position = [x, y];
    const bbox = this.calculateBoundingBox([coordinates]);

    console.debug('[ShapefileParser] Read point:', {
      offset,
      coordinates,
      bbox
    });

    return {
      coordinates,
      bbox,
      length: 16 // 2 doubles (x,y)
    };
  }

  /**
   * Read polyline coordinates
   */
  private readPolyline(view: DataView, offset: number): ShapeData {
    // Read bounding box
    const bbox = {
      xMin: view.getFloat64(offset, true),
      yMin: view.getFloat64(offset + 8, true),
      xMax: view.getFloat64(offset + 16, true),
      yMax: view.getFloat64(offset + 24, true)
    };

    const numParts = view.getInt32(offset + 32, true);
    const numPoints = view.getInt32(offset + 36, true);
    let currentOffset = offset + 40;

    console.debug('[ShapefileParser] Reading polyline:', {
      offset,
      bbox,
      numParts,
      numPoints
    });

    // Read parts array
    const parts: number[] = [];
    for (let i = 0; i < numParts; i++) {
      parts.push(view.getInt32(currentOffset, true));
      currentOffset += 4;
    }

    // Read all points first
    const allPoints: Position[] = [];
    for (let i = 0; i < numPoints; i++) {
      const x = view.getFloat64(currentOffset, true);
      const y = view.getFloat64(currentOffset + 8, true);
      allPoints.push([x, y]);
      currentOffset += 16;
    }

    // Split points into parts
    const coordinates: Position[][] = [];
    for (let i = 0; i < numParts; i++) {
      const start = parts[i];
      const end = i + 1 < numParts ? parts[i + 1] : numPoints;
      const partPoints = allPoints.slice(start, end);
      coordinates.push(partPoints);
    }

    console.debug('[ShapefileParser] Polyline read complete:', {
      numParts,
      parts,
      totalPoints: numPoints,
      pointsPerPart: coordinates.map(part => part.length),
      bbox,
      length: currentOffset - offset
    });

    // Always return array of parts for proper MultiLineString handling
    return {
      coordinates: coordinates,
      bbox,
      length: currentOffset - offset
    };
  }

  /**
   * Read polygon coordinates
   */
  private readPolygon(view: DataView, offset: number): ShapeData {
    console.debug('[ShapefileParser] Reading polygon at offset:', offset);
    const result = this.readPolyline(view, offset);
    
    console.debug('[ShapefileParser] Polygon read complete:', {
      numRings: 1,
      pointsInRing: (result.coordinates as Position[]).length,
      bbox: result.bbox
    });

    return {
      coordinates: [result.coordinates as Position[]],
      bbox: result.bbox,
      length: result.length
    };
  }

  /**
   * Read multipoint coordinates
   */
  private readMultiPoint(view: DataView, offset: number): ShapeData {
    // Read bounding box
    const bbox = {
      xMin: view.getFloat64(offset, true),
      yMin: view.getFloat64(offset + 8, true),
      xMax: view.getFloat64(offset + 16, true),
      yMax: view.getFloat64(offset + 24, true)
    };

    const numPoints = view.getInt32(offset + 32, true);
    let currentOffset = offset + 36;

    console.debug('[ShapefileParser] Reading multipoint:', {
      offset,
      bbox,
      numPoints
    });

    const coordinates: Position[] = [];
    for (let i = 0; i < numPoints; i++) {
      const x = view.getFloat64(currentOffset, true);
      const y = view.getFloat64(currentOffset + 8, true);
      coordinates.push([x, y]);
      currentOffset += 16;
    }

    console.debug('[ShapefileParser] Multipoint read complete:', {
      numCoordinates: coordinates.length,
      bbox,
      length: currentOffset - offset
    });

    return {
      coordinates,
      bbox,
      length: currentOffset - offset
    };
  }

  /**
   * Analyze shapefile structure and get preview records
   */
  async analyzeStructure(file: File, options: AnalyzeOptions = {}): Promise<ShapefileAnalyzeResult> {
    console.debug('[ShapefileParser] Starting structure analysis:', {
      fileName: file.name,
      fileSize: file.size,
      options
    });

    try {
      const buffer = await file.arrayBuffer();
      console.debug('[ShapefileParser] File loaded into buffer:', {
        bufferSize: buffer.byteLength
      });

      const header = await this.readHeader(buffer);

      // Validate file code
      if (header.fileCode !== 9994) {
        console.error('[ShapefileParser] Invalid file code:', header.fileCode);
        throw new ValidationError(
          'Invalid shapefile: incorrect file code',
          'INVALID_FILE_CODE'
        );
      }

      // Read preview records
      const previewCount = options.previewRecords || 10;
      const view = new DataView(buffer);
      let offset = ShapefileParser.HEADER_LENGTH;
      const preview: ShapefileRecord[] = [];

      console.debug('[ShapefileParser] Reading preview records:', {
        requestedCount: previewCount,
        startOffset: offset
      });

      while (preview.length < previewCount && offset < buffer.byteLength) {
        const { record, nextOffset } = this.readRecord(view, offset);
        preview.push(record);
        offset = nextOffset;
      }

      console.debug('[ShapefileParser] Preview records read:', {
        recordsRead: preview.length,
        finalOffset: offset,
        firstRecord: preview[0]
      });

      const result: ShapefileAnalyzeResult = {
        structure: {
          shapeHeader: header,
          fields: [], // DBF fields would be added here if parseDbf is true
          shapeType: header.shapeType,
          recordCount: Math.floor((buffer.byteLength - ShapefileParser.HEADER_LENGTH) / 8)
        },
        preview,
        issues: []
      };

      console.debug('[ShapefileParser] Analysis complete:', {
        shapeType: ShapeType[header.shapeType],
        recordCount: result.structure.recordCount,
        previewCount: preview.length,
        firstRecordBounds: preview[0]?.data.bbox
      });

      return result;

    } catch (error) {
      console.error('[ShapefileParser] Analysis failed:', error);
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new ValidationError(
        `Failed to analyze shapefile: ${error instanceof Error ? error.message : String(error)}`,
        'SHAPEFILE_ANALYSIS_ERROR'
      );
    }
  }

  /**
   * Parse shapefile features
   */
  async parseFeatures(file: File, options: ParseOptions = {}): Promise<ShapefileRecord[]> {
    console.debug('[ShapefileParser] Starting feature parsing:', {
      fileName: file.name,
      fileSize: file.size,
      options
    });

    try {
      const buffer = await file.arrayBuffer();
      const header = await this.readHeader(buffer);
      const view = new DataView(buffer);
      let offset = ShapefileParser.HEADER_LENGTH;
      const records: ShapefileRecord[] = [];

      console.debug('[ShapefileParser] Parsing all features:', {
        startOffset: offset,
        bufferSize: buffer.byteLength
      });

      while (offset < buffer.byteLength) {
        const { record, nextOffset } = this.readRecord(view, offset);
        records.push(record);
        offset = nextOffset;

        if (records.length % 1000 === 0) {
          console.debug('[ShapefileParser] Parsing progress:', {
            recordsParsed: records.length,
            currentOffset: offset,
            percentComplete: ((offset / buffer.byteLength) * 100).toFixed(1) + '%'
          });
        }
      }

      console.debug('[ShapefileParser] Feature parsing complete:', {
        totalRecords: records.length,
        finalOffset: offset,
        firstRecordBounds: records[0]?.data.bbox,
        lastRecordBounds: records[records.length - 1]?.data.bbox
      });

      return records;

    } catch (error) {
      console.error('[ShapefileParser] Feature parsing failed:', error);
      throw new ValidationError(
        `Failed to parse shapefile: ${error instanceof Error ? error.message : String(error)}`,
        'SHAPEFILE_PARSE_ERROR'
      );
    }
  }
}
