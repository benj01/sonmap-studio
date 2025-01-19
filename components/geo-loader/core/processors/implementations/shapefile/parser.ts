import { ShapefileProcessorOptions, ShapefileAnalyzeResult, ShapefileRecord, ShapeType } from './types';
import { ValidationError } from '../../../errors/types';
import { Position } from 'geojson';
import { COORDINATE_SYSTEM_BOUNDS, CoordinateSystemId } from '../../../../core/coordinate-systems/coordinate-system-manager';

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
  coordinateSystem?: CoordinateSystemId;
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
  private coordinateSystem: CoordinateSystemId;

  constructor(options: ShapefileProcessorOptions = {}) {
    this.options = options;
    this.coordinateSystem = (options.coordinateSystem as CoordinateSystemId) || 'EPSG:4326'; // Default to WGS84
    console.debug('[ShapefileParser] Initialized with options:', options);
  }

  private isReasonableCoordinate(x: number, y: number): boolean {
    const bounds = COORDINATE_SYSTEM_BOUNDS[this.coordinateSystem];
    if (!bounds) {
      console.warn(`[ShapefileParser] No bounds defined for coordinate system: ${this.coordinateSystem}`);
      return true; // Allow coordinates if bounds aren't defined
    }

    const isValid = x >= bounds.x.min && x <= bounds.x.max &&
                   y >= bounds.y.min && y <= bounds.y.max;
    
    if (!isValid) {
      console.warn(`[ShapefileParser] Coordinates out of bounds for ${this.coordinateSystem}:`, 
        { x, y, bounds });
    }
    
    return isValid;
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
    // Validate buffer size
    if (!buffer || buffer.byteLength < ShapefileParser.HEADER_LENGTH) {
      throw new ValidationError(
        'Invalid shapefile: header buffer too small',
        'INVALID_HEADER_SIZE',
        undefined,
        { bufferLength: buffer?.byteLength, requiredLength: ShapefileParser.HEADER_LENGTH }
      );
    }

    console.debug('[ShapefileParser] Reading header from buffer:', {
      bufferLength: buffer.byteLength,
      headerLength: ShapefileParser.HEADER_LENGTH
    });

    const view = new DataView(buffer);
    
    // Read and validate header values
    const fileCode = view.getInt32(0, false); // big-endian
    if (fileCode !== 9994) {
      throw new ValidationError(
        'Invalid shapefile: incorrect file code',
        'INVALID_FILE_CODE',
        undefined,
        { fileCode }
      );
    }

    const fileLength = view.getInt32(24, false) * 2; // big-endian, in 16-bit words
    if (fileLength <= 0 || fileLength > buffer.byteLength) {
      throw new ValidationError(
        'Invalid shapefile: incorrect file length',
        'INVALID_FILE_LENGTH',
        undefined,
        { fileLength, bufferLength: buffer.byteLength }
      );
    }

    const version = view.getInt32(28, true); // little-endian
    if (version !== 1000) {
      throw new ValidationError(
        'Invalid shapefile: unsupported version',
        'INVALID_VERSION',
        undefined,
        { version }
      );
    }

    const shapeType = view.getInt32(32, true); // little-endian
    if (shapeType < 0 || !Object.values(ShapeType).includes(shapeType)) {
      throw new ValidationError(
        'Invalid shapefile: unsupported shape type',
        'INVALID_SHAPE_TYPE',
        undefined,
        { shapeType }
      );
    }

    // Read and validate bounding box
    const xMin = view.getFloat64(36, true);
    const yMin = view.getFloat64(44, true);
    const xMax = view.getFloat64(52, true);
    const yMax = view.getFloat64(60, true);
    const zMin = view.getFloat64(68, true);
    const zMax = view.getFloat64(76, true);
    const mMin = view.getFloat64(84, true);
    const mMax = view.getFloat64(92, true);

    // Validate coordinate values
    if (!isFinite(xMin) || !isFinite(yMin) || !isFinite(xMax) || !isFinite(yMax)) {
      throw new ValidationError(
        'Invalid shapefile: non-finite bounding box coordinates',
        'INVALID_BBOX',
        undefined,
        { bbox: { xMin, yMin, xMax, yMax } }
      );
    }

    // Validate bounding box logic
    if (xMin > xMax || yMin > yMax) {
      throw new ValidationError(
        'Invalid shapefile: invalid bounding box ranges',
        'INVALID_BBOX_RANGE',
        undefined,
        { bbox: { xMin, yMin, xMax, yMax } }
      );
    }

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
        zMin: isFinite(zMin) ? zMin : undefined,
        zMax: isFinite(zMax) ? zMax : undefined,
        mMin: isFinite(mMin) ? mMin : undefined,
        mMax: isFinite(mMax) ? mMax : undefined
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

    try {
      // Validate offset is within buffer
      if (offset < 0 || offset >= view.byteLength) {
        throw new ValidationError(
          'Invalid record offset',
          'INVALID_RECORD_OFFSET',
          undefined,
          { offset, bufferLength: view.byteLength }
        );
      }

      // Read and validate record header
      const recordNumber = view.getInt32(offset, false); // big-endian
      if (recordNumber <= 0) {
        throw new ValidationError(
          'Invalid record number',
          'INVALID_RECORD_NUMBER',
          undefined,
          { recordNumber }
        );
      }

      const contentLength = view.getInt32(offset + 4, false) * 2; // big-endian, in 16-bit words
      if (contentLength <= 0 || offset + 8 + contentLength > view.byteLength) {
        throw new ValidationError(
          'Invalid content length',
          'INVALID_CONTENT_LENGTH',
          undefined,
          { contentLength, remainingBytes: view.byteLength - offset - 8 }
        );
      }

      offset += 8;

      // Read and validate shape type
      const shapeType = view.getInt32(offset, true); // little-endian
      if (shapeType < 0 || !Object.values(ShapeType).includes(shapeType)) {
        throw new ValidationError(
          'Invalid shape type',
          'INVALID_SHAPE_TYPE',
          undefined,
          { shapeType }
        );
      }
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

      // Validate data was read correctly
      if (!data || !data.coordinates) {
        throw new ValidationError(
          'Invalid shape data',
          'INVALID_SHAPE_DATA',
          undefined,
          { shapeType, offset }
        );
      }

      // Validate bounding box if present
      if (data.bbox) {
        const { xMin, yMin, xMax, yMax } = data.bbox;
        if (!isFinite(xMin) || !isFinite(yMin) || !isFinite(xMax) || !isFinite(yMax)) {
          console.warn('[ShapefileParser] Invalid bounding box in record:', {
            recordNumber,
            bbox: data.bbox
          });
        }
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
    } catch (error) {
      // Log the error but continue with next record
      console.error('[ShapefileParser] Error reading record:', {
        offset,
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Create safe default values
      let safeOffset = offset;
      let safeRecordNumber = 0;
      let safeContentLength = 0;
      let safeShapeType = 0;

      // Try to read header values even if later parsing failed
      try {
        if (offset + 8 <= view.byteLength) {
          safeRecordNumber = view.getInt32(offset, false);
          safeContentLength = view.getInt32(offset + 4, false) * 2;
          if (offset + 12 <= view.byteLength) {
            safeShapeType = view.getInt32(offset + 8, true);
          }
        }
      } catch (headerError) {
        console.warn('[ShapefileParser] Failed to read record header:', headerError);
      }

      // Calculate safe skip offset
      const skipOffset = offset + Math.max(12, safeContentLength); // At least skip header
      console.debug('[ShapefileParser] Skipping to next record at offset:', skipOffset);
      
      // Return empty record with safe values
      return {
        record: {
          header: {
            recordNumber: safeRecordNumber,
            contentLength: safeContentLength
          },
          shapeType: safeShapeType,
          data: {
            coordinates: [],
            bbox: { xMin: 0, yMin: 0, xMax: 0, yMax: 0 }
          }
        },
        nextOffset: skipOffset
      };
    }
  }

  /**
   * Read point coordinates
   */
  private readPoint(view: DataView, offset: number): ShapeData {
    const x = view.getFloat64(offset, true);
    const y = view.getFloat64(offset + 8, true);

    // Validate coordinates
    if (!isFinite(x) || !isFinite(y)) {
      console.warn('[ShapefileParser] Invalid point coordinates:', { x, y });
      return {
        coordinates: [0, 0], // Return origin point for invalid coordinates
        bbox: { xMin: 0, yMin: 0, xMax: 0, yMax: 0 },
        length: 16
      };
    }

      // Validate coordinate ranges
      if (!this.isReasonableCoordinate(x, y)) {
        console.warn(`[ShapefileParser] Coordinates out of bounds for ${this.coordinateSystem}:`, { x, y });
        return {
          coordinates: [0, 0],
          bbox: { xMin: 0, yMin: 0, xMax: 0, yMax: 0 },
          length: 16
        };
      }

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

    console.debug('[ShapefileParser] Reading polyline structure:', {
      offset,
      bbox,
      numParts,
      numPoints
    });

    // Validate basic structure
    if (numParts <= 0 || numPoints <= 0) {
      console.warn('[ShapefileParser] Invalid polyline structure:', { numParts, numPoints });
      return {
        coordinates: [],
        bbox,
        length: 40 // Return minimal length to skip invalid record
      };
    }

    // Read parts array
    const parts: number[] = [];
    for (let i = 0; i < numParts; i++) {
      const partIndex = view.getInt32(currentOffset, true);
      if (partIndex < 0) {
        console.warn('[ShapefileParser] Invalid part index:', { partIndex, partNumber: i });
        continue;
      }
      parts.push(partIndex);
      currentOffset += 4;
    }

    // Validate parts array
    if (parts.length === 0) {
      console.warn('[ShapefileParser] No valid parts found');
      return {
        coordinates: [],
        bbox,
        length: currentOffset - offset
      };
    }

    // Read all points with validation
    const allPoints: Position[] = [];
    for (let i = 0; i < numPoints; i++) {
      const x = view.getFloat64(currentOffset, true);
      const y = view.getFloat64(currentOffset + 8, true);
      
      // Validate coordinates
      if (!isFinite(x) || !isFinite(y)) {
        console.warn('[ShapefileParser] Invalid polyline coordinates:', { x, y, pointIndex: i });
        continue;
      }
      
      allPoints.push([x, y]);
      currentOffset += 16;
    }

    // Split points into parts with validation
    const lines: Position[][] = [];
    for (let i = 0; i < parts.length; i++) {
      const start = parts[i];
      const end = i + 1 < parts.length ? parts[i + 1] : numPoints;
      
      // Validate part indices
      if (start < 0 || end > allPoints.length || start >= end) {
        console.warn('[ShapefileParser] Invalid line part indices:', { start, end, partIndex: i });
        continue;
      }

      const line = allPoints.slice(start, end);
      
      // Validate line has at least 2 points
      if (line.length < 2) {
        console.warn('[ShapefileParser] Line too short:', { lineLength: line.length, partIndex: i });
        continue;
      }

      // Validate line coordinates are reasonable
      const isReasonable = line.every(([x, y]) => {
        const reasonable = this.isReasonableCoordinate(x, y);
        if (!reasonable) {
          console.warn(`[ShapefileParser] Line coordinates out of bounds for ${this.coordinateSystem}:`, { x, y });
        }
        return reasonable;
      });

      if (isReasonable) {
        lines.push(line);
      }
    }

    console.debug('[ShapefileParser] Polyline read complete:', {
      numParts: lines.length,
      lineSizes: lines.map(l => l.length),
      bbox,
      length: currentOffset - offset
    });

    return {
      coordinates: lines,
      bbox,
      length: currentOffset - offset
    };
  }

  /**
   * Read polygon coordinates
   */
  private readPolygon(view: DataView, offset: number): ShapeData {
    console.debug('[ShapefileParser] Reading polygon at offset:', offset);
    
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

    console.debug('[ShapefileParser] Reading polygon structure:', {
      offset,
      bbox,
      numParts,
      numPoints
    });

    // Read parts array (ring start indices)
    const parts: number[] = [];
    for (let i = 0; i < numParts; i++) {
      parts.push(view.getInt32(currentOffset, true));
      currentOffset += 4;
    }

    // Read all points
    const allPoints: Position[] = [];
    for (let i = 0; i < numPoints; i++) {
      const x = view.getFloat64(currentOffset, true);
      const y = view.getFloat64(currentOffset + 8, true);
      
      // Validate coordinates
      if (!isFinite(x) || !isFinite(y)) {
        console.warn('[ShapefileParser] Invalid polygon coordinates:', { x, y, pointIndex: i });
        continue;
      }
      
      allPoints.push([x, y]);
      currentOffset += 16;
    }

    // Split points into rings and validate each ring
    const rings: Position[][] = [];
    for (let i = 0; i < numParts; i++) {
      const start = parts[i];
      const end = i + 1 < numParts ? parts[i + 1] : numPoints;
      
      if (start < 0 || end > allPoints.length || start >= end) {
        console.warn('[ShapefileParser] Invalid ring indices:', { start, end, ringIndex: i });
        continue;
      }

      const ring = allPoints.slice(start, end);
      
      // Validate ring has at least 4 points (3 points + closing point)
      if (ring.length < 4) {
        console.warn('[ShapefileParser] Ring too short:', { ringLength: ring.length, ringIndex: i });
        continue;
      }

      // Validate ring is closed (first point equals last point)
      const firstPoint = ring[0];
      const lastPoint = ring[ring.length - 1];
      if (firstPoint[0] !== lastPoint[0] || firstPoint[1] !== lastPoint[1]) {
        console.warn('[ShapefileParser] Ring not closed:', { 
          firstPoint, 
          lastPoint, 
          ringIndex: i 
        });
        // Auto-close the ring
        ring.push([...firstPoint]);
      }

      rings.push(ring);
    }

    console.debug('[ShapefileParser] Polygon read complete:', {
      numRings: rings.length,
      ringSizes: rings.map(r => r.length),
      bbox,
      length: currentOffset - offset
    });

    return {
      coordinates: rings,
      bbox,
      length: currentOffset - offset
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

    // Validate number of points
    if (numPoints <= 0) {
      console.warn('[ShapefileParser] Invalid multipoint structure:', { numPoints });
      return {
        coordinates: [],
        bbox,
        length: 36 // Return minimal length to skip invalid record
      };
    }

    console.debug('[ShapefileParser] Reading multipoint:', {
      offset,
      bbox,
      numPoints
    });

    const coordinates: Position[] = [];
    for (let i = 0; i < numPoints; i++) {
      const x = view.getFloat64(currentOffset, true);
      const y = view.getFloat64(currentOffset + 8, true);

      // Validate coordinates
      if (!isFinite(x) || !isFinite(y)) {
        console.warn('[ShapefileParser] Invalid multipoint coordinates:', { x, y, pointIndex: i });
        currentOffset += 16;
        continue;
      }

      // Validate coordinate ranges
      if (!this.isReasonableCoordinate(x, y)) {
        console.warn(`[ShapefileParser] Multipoint coordinates out of bounds for ${this.coordinateSystem}:`, { x, y, pointIndex: i });
        currentOffset += 16;
        continue;
      }

      coordinates.push([x, y]);
      currentOffset += 16;
    }

    // Validate we have at least one valid point
    if (coordinates.length === 0) {
      console.warn('[ShapefileParser] No valid points found in multipoint');
      return {
        coordinates: [],
        bbox,
        length: currentOffset - offset
      };
    }

    console.debug('[ShapefileParser] Multipoint read complete:', {
      totalPoints: numPoints,
      validPoints: coordinates.length,
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
