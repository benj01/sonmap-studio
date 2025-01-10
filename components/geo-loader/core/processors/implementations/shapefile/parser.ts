import { Feature, Geometry, Position } from 'geojson';
import { 
  ShapeType,
  ShapefileRecord,
  ShapefileHeader,
  DbfHeader,
  ShapefileField,
  ShapefileParseOptions,
  ShapefileStructure,
  ShapefileAnalyzeResult,
  ShapefileProcessorOptions
} from './types';
import { ValidationError } from '../../../errors/types';
import { dbfReader } from './utils/dbf-reader';
import { shxReader } from './utils/shx-reader';
import { prjReader } from './utils/prj-reader';
import { CoordinateSystem } from '../../../../types/coordinates';

/**
 * Handles Shapefile parsing with streaming support
 */
export class ShapefileParser {
  private options: ShapefileProcessorOptions;

  // Shapefile format constants
  private static readonly HEADER_LENGTH = 100;
  private static readonly RECORD_HEADER_LENGTH = 8;
  private static readonly FILE_CODE = 9994;
  private static readonly VERSION = 1000;

  // Shape type constants
  private static readonly SHAPE_NULL = 0;
  private static readonly SHAPE_POINT = 1;
  private static readonly SHAPE_POLYLINE = 3;
  private static readonly SHAPE_POLYGON = 5;
  private static readonly SHAPE_MULTIPOINT = 8;
  private static readonly SHAPE_POINTZ = 11;
  private static readonly SHAPE_POLYLINEZ = 13;
  private static readonly SHAPE_POLYGONZ = 15;
  private static readonly SHAPE_MULTIPOINTZ = 18;
  private static readonly SHAPE_POINTM = 21;
  private static readonly SHAPE_POLYLINEM = 23;
  private static readonly SHAPE_POLYGONM = 25;
  private static readonly SHAPE_MULTIPOINTM = 28;
  private static readonly SHAPE_MULTIPATCH = 31;

  // Geometry type flags
  private static readonly HAS_Z = 0x80000000;
  private static readonly HAS_M = 0x40000000;

  constructor(options: ShapefileProcessorOptions = {}) {
    this.options = options;
  }

  /**
   * Find component files (.dbf, .shx, .prj)
   */
  private findComponentFiles(file: File): {
    dbf?: File;
    shx?: File;
    prj?: File;
  } {
    console.debug('[DEBUG] Finding component files for:', file.name);
    
    // Check if related files are provided in options
    const relatedFiles = this.options?.relatedFiles;
    if (relatedFiles) {
      console.debug('[DEBUG] Found related files in options:', {
        hasDbf: !!relatedFiles.dbf,
        hasShx: !!relatedFiles.shx,
        hasPrj: !!relatedFiles.prj
      });
      
      const components = {
        dbf: relatedFiles.dbf,
        shx: relatedFiles.shx,
        prj: relatedFiles.prj
      };
      
      if (!components.dbf) {
        console.warn('[WARN] Missing DBF file in shapefile set');
      }
      if (!components.shx) {
        console.warn('[WARN] Missing SHX file in shapefile set');
      }
      
      return components;
    }

    // Check for companion files attached to the file object
    const companionFiles = (file as any).relatedFiles;
    if (companionFiles) {
      console.debug('[DEBUG] Found companion files on file object:', 
        Object.keys(companionFiles).map(ext => ({ ext, type: companionFiles[ext]?.type }))
      );
      
      const components = {
        dbf: companionFiles['.dbf'],
        shx: companionFiles['.shx'],
        prj: companionFiles['.prj']
      };
      
      if (!components.dbf) {
        console.warn('[WARN] Missing DBF file in shapefile set');
      }
      if (!components.shx) {
        console.warn('[WARN] Missing SHX file in shapefile set');
      }
      
      return components;
    }

    console.warn('[WARN] No companion files found for shapefile:', file.name);
    return {};
  }

  /**
   * Analyze shapefile structure including all component files
   */
  async analyzeStructure(
    file: File,
    options: {
      previewRecords?: number;
      parseDbf?: boolean;
    } = {}
  ): Promise<ShapefileAnalyzeResult> {
    console.debug('[DEBUG] Starting shapefile analysis:', {
      fileName: file.name,
      fileSize: file.size,
      options
    });
    try {
      // Validate file type
      if (!file.name.toLowerCase().endsWith('.shp')) {
        throw new ValidationError(
          'Invalid file: Must be a .shp file',
          'INVALID_FILE_TYPE',
          undefined,
          { fileName: file.name }
        );
      }

      // Find component files
      const components = await this.findComponentFiles(file);

      // Validate required companion files
      if (!components.dbf || !components.shx) {
        const missing = [];
        if (!components.dbf) missing.push('.dbf');
        if (!components.shx) missing.push('.shx');
        
        throw new ValidationError(
          `Missing required companion files: ${missing.join(', ')}`,
          'MISSING_COMPANION_FILES',
          undefined,
          { missing }
        );
      }
      
      // Read main shapefile header
      const shpBuffer = await file.arrayBuffer();
      const shapeHeader = await this.readShapeHeader(shpBuffer);
      
      // Read DBF header if available and requested
      let dbfHeader: DbfHeader | undefined;
      if (components.dbf && options.parseDbf) {
        const dbfBuffer = await components.dbf.arrayBuffer();
        dbfHeader = await dbfReader.readHeader(dbfBuffer);
      }

      // Create structure info
      const structure: ShapefileStructure = {
        shapeHeader,
        dbfHeader,
        fields: dbfHeader?.fields || [],
        shapeType: shapeHeader.shapeType,
        recordCount: dbfHeader?.recordCount || 0
      };

      // Get preview records
      const preview: ShapefileRecord[] = [];
      for await (const record of this.streamRecords(shpBuffer, shapeHeader, {
        ...options,
        maxRecords: options.previewRecords || 100
      })) {
        preview.push(record);
      }

      // Check for issues
      const issues = this.validateStructure(structure, components);

      return {
        structure,
        preview,
        issues
      };
    } catch (error) {
      throw new ValidationError(
        `Failed to analyze shapefile: ${error instanceof Error ? error.message : String(error)}`,
        'SHAPEFILE_ANALYSIS_ERROR',
        undefined,
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Parse shapefile records into features
   */
  async parseFeatures(
    file: File,
    options: ShapefileParseOptions
  ): Promise<Feature[]> {
    try {
      const shpBuffer = await file.arrayBuffer();
      const header = await this.readShapeHeader(shpBuffer);
      
      const features: Feature[] = [];
      for await (const record of this.streamRecords(shpBuffer, header, options)) {
        features.push(this.recordToFeature(record));
      }
      
      return features;
    } catch (error) {
      throw new ValidationError(
        `Failed to parse shapefile: ${error instanceof Error ? error.message : String(error)}`,
        'SHAPEFILE_PARSE_ERROR',
        undefined,
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Read shapefile header from buffer
   */
  private async readShapeHeader(buffer: ArrayBuffer): Promise<ShapefileHeader> {
    // Validate buffer size for complete header (100 bytes)
    if (buffer.byteLength < ShapefileParser.HEADER_LENGTH) {
      throw new ValidationError(
        'Invalid shapefile: buffer too small for header',
        'SHAPEFILE_PARSE_ERROR',
        undefined,
        { bufferSize: buffer.byteLength, requiredSize: ShapefileParser.HEADER_LENGTH }
      );
    }

    const view = new DataView(buffer);
    
    try {
      // Validate file code
      const fileCode = view.getInt32(0, false);
      if (fileCode !== ShapefileParser.FILE_CODE) {
        throw new ValidationError(
          'Invalid shapefile: incorrect file code',
          'SHAPEFILE_INVALID_CODE',
          undefined,
          { fileCode }
        );
      }
      
      // Read header values
      const fileLength = view.getInt32(24, false) * 2;
      const version = view.getInt32(28, true);
      const shapeType = view.getInt32(32, true) as ShapeType;
      
      // Validate file length
      if (fileLength < ShapefileParser.HEADER_LENGTH || fileLength > buffer.byteLength) {
        throw new ValidationError(
          'Invalid shapefile: incorrect file length',
          'SHAPEFILE_PARSE_ERROR',
          undefined,
          { fileLength, bufferSize: buffer.byteLength }
        );
      }

      // Validate version
      if (version !== ShapefileParser.VERSION) {
        throw new ValidationError(
          'Invalid shapefile: unsupported version',
          'SHAPEFILE_PARSE_ERROR',
          undefined,
          { version, supportedVersion: ShapefileParser.VERSION }
        );
      }
      
      // Read bounding box
      const xMin = view.getFloat64(36, true);
      const yMin = view.getFloat64(44, true);
      const xMax = view.getFloat64(52, true);
      const yMax = view.getFloat64(60, true);
      const zMin = view.getFloat64(68, true);
      const zMax = view.getFloat64(76, true);
      const mMin = view.getFloat64(84, true);
      const mMax = view.getFloat64(92, true);
    
      // Validate bounding box
      if (!Number.isFinite(xMin) || !Number.isFinite(yMin) || 
          !Number.isFinite(xMax) || !Number.isFinite(yMax)) {
        throw new ValidationError(
          'Invalid shapefile: invalid bounding box coordinates',
          'SHAPEFILE_PARSE_ERROR',
          undefined,
          { bbox: { xMin, yMin, xMax, yMax } }
        );
      }

      return {
        fileCode,
        fileLength,
        version,
        shapeType,
        bbox: {
          xMin, yMin, xMax, yMax,
          zMin, zMax, mMin, mMax
        }
      };
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      throw new ValidationError(
        `Error reading shapefile header: ${error instanceof Error ? error.message : String(error)}`,
        'SHAPEFILE_PARSE_ERROR'
      );
    }
  }

  /**
   * Parse shapefile records with streaming support
   */
  async *streamRecords(
    buffer: ArrayBuffer,
    header: ShapefileHeader,
    options: ShapefileParseOptions = {}
  ): AsyncGenerator<ShapefileRecord, void, undefined> {
    const view = new DataView(buffer);
    let offset = ShapefileParser.HEADER_LENGTH;
    let count = 0;
    
    try {
      while (offset < header.fileLength) {
        // Check record limit
        if (options.maxRecords && count >= options.maxRecords) {
          break;
        }

        // Validate enough space for record header
        if (offset + ShapefileParser.RECORD_HEADER_LENGTH > view.byteLength) {
          throw new ValidationError(
            'Invalid shapefile: truncated record header',
            'SHAPEFILE_PARSE_ERROR',
            undefined,
            { offset, bufferSize: view.byteLength }
          );
        }

        // Read record header
        const recordNumber = view.getInt32(offset, false);
        const contentLength = view.getInt32(offset + 4, false);

        // Validate content length
        if (contentLength < 0 || contentLength > 1000000) {
          throw new ValidationError(
            'Invalid shapefile: unreasonable record content length',
            'SHAPEFILE_PARSE_ERROR',
            undefined,
            { recordNumber, contentLength }
          );
        }

        // Validate enough space for complete record
        const recordSize = ShapefileParser.RECORD_HEADER_LENGTH + contentLength * 2;
        if (offset + recordSize > view.byteLength) {
          throw new ValidationError(
            'Invalid shapefile: truncated record content',
            'SHAPEFILE_PARSE_ERROR',
            undefined,
            { 
              recordNumber,
              offset,
              contentLength,
              requiredSize: recordSize,
              remainingSize: view.byteLength - offset
            }
          );
        }

        offset += ShapefileParser.RECORD_HEADER_LENGTH;
        
        // Read shape type
        const shapeType = view.getInt32(offset, true) as ShapeType;
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
   * Convert shapefile record to GeoJSON feature
   */
  private recordToFeature(record: ShapefileRecord): Feature {
    const geometry = record.data as unknown as Geometry;
    return {
      type: 'Feature',
      geometry,
      properties: record.attributes || { recordNumber: record.header.recordNumber }
    };
  }

  /**
   * Parse geometry from buffer based on shape type
   */
  private async parseGeometry(
    view: DataView,
    offset: number,
    shapeType: ShapeType
  ): Promise<Geometry | null> {
    switch (shapeType) {
      case ShapefileParser.SHAPE_NULL:
        return null;
        
      case ShapefileParser.SHAPE_POINT:
      case ShapefileParser.SHAPE_POINTZ:
      case ShapefileParser.SHAPE_POINTM:
        return this.parsePoint(view, offset);
        
      case ShapefileParser.SHAPE_MULTIPOINT:
      case ShapefileParser.SHAPE_MULTIPOINTZ:
      case ShapefileParser.SHAPE_MULTIPOINTM:
        return this.parseMultiPoint(view, offset);
        
      case ShapefileParser.SHAPE_POLYLINE:
      case ShapefileParser.SHAPE_POLYLINEZ:
      case ShapefileParser.SHAPE_POLYLINEM:
        return this.parsePolyline(view, offset);
        
      case ShapefileParser.SHAPE_POLYGON:
      case ShapefileParser.SHAPE_POLYGONZ:
      case ShapefileParser.SHAPE_POLYGONM:
        return this.parsePolygon(view, offset);
        
      default:
        throw new Error(`Unsupported shape type: ${shapeType}`);
    }
  }

  /**
   * Parse point geometry
   */
  private parsePoint(view: DataView, offset: number): Geometry {
    // Validate buffer has enough space for point coordinates (2 * 8 bytes)
    if (offset + 16 > view.byteLength) {
      throw new ValidationError(
        'Invalid point: buffer too small for coordinates',
        'SHAPEFILE_PARSE_ERROR'
      );
    }

    try {
      const x = view.getFloat64(offset, true);
      const y = view.getFloat64(offset + 8, true);
      
      return {
        type: 'Point',
        coordinates: [x, y]
      };
    } catch (error) {
      throw new ValidationError(
        `Error reading point coordinates: ${error instanceof Error ? error.message : String(error)}`,
        'SHAPEFILE_PARSE_ERROR'
      );
    }
  }

  /**
   * Parse multipoint geometry
   */
  private parseMultiPoint(view: DataView, offset: number): Geometry {
    // Validate buffer has enough space for header
    if (offset + 40 >= view.byteLength) {
      throw new ValidationError(
        'Invalid multipoint: buffer too small for header',
        'SHAPEFILE_PARSE_ERROR'
      );
    }

    const numPoints = view.getInt32(offset + 36, true);

    // Validate reasonable value for numPoints
    if (numPoints < 0 || numPoints > 1000000) {
      throw new ValidationError(
        `Invalid multipoint: unreasonable number of points (${numPoints})`,
        'SHAPEFILE_PARSE_ERROR'
      );
    }

    // Calculate required buffer size and validate
    const pointsSize = numPoints * 16;
    const requiredSize = offset + 40 + pointsSize;
    
    if (requiredSize > view.byteLength) {
      throw new ValidationError(
        'Invalid multipoint: buffer too small for specified points',
        'SHAPEFILE_PARSE_ERROR'
      );
    }

    const points: Position[] = [];
    let pointOffset = offset + 40;
    
    try {
      for (let i = 0; i < numPoints; i++) {
        const x = view.getFloat64(pointOffset, true);
        const y = view.getFloat64(pointOffset + 8, true);
        points.push([x, y]);
        pointOffset += 16;
      }
    } catch (error) {
      throw new ValidationError(
        `Error reading multipoint points: ${error instanceof Error ? error.message : String(error)}`,
        'SHAPEFILE_PARSE_ERROR'
      );
    }
    
    return {
      type: 'MultiPoint',
      coordinates: points
    };
  }

  /**
   * Parse polyline geometry
   */
  private parsePolyline(view: DataView, offset: number): Geometry {
    type LineStringGeometry = { type: 'LineString'; coordinates: Position[] };
    type MultiLineStringGeometry = { type: 'MultiLineString'; coordinates: Position[][] };

    // Skip bounding box (4 * 8 = 32 bytes) and read number of parts and points
    const numParts = view.getInt32(offset + 36, true);
    const numPoints = view.getInt32(offset + 40, true);

    // Basic validation
    if (numParts <= 0 || numPoints <= 0) {
      console.warn(`Skipping invalid polyline: numParts=${numParts}, numPoints=${numPoints}`);
      return {
        type: 'LineString',
        coordinates: []
      };
    }

    // Read part indices
    const parts: number[] = [];
    let partOffset = offset + 44;
    for (let i = 0; i < numParts; i++) {
      parts.push(view.getInt32(partOffset + i * 4, true));
    }
    parts.push(numPoints);
    
    // Read points for each part
    const coordinates: Position[][] = [];
    let pointOffset = partOffset + (numParts * 4);
    
    try {
      for (let i = 0; i < numParts; i++) {
        const partPoints: Position[] = [];
        const start = parts[i];
        const end = i === numParts - 1 ? numPoints : parts[i + 1];
        
        // Skip invalid parts but continue processing
        if (start >= end || start < 0 || end > numPoints) {
          console.warn(`Skipping invalid polyline part ${i}: start=${start}, end=${end}`);
          continue;
        }
        
        for (let j = start; j < end; j++) {
          const x = view.getFloat64(pointOffset, true);
          const y = view.getFloat64(pointOffset + 8, true);
          partPoints.push([x, y]);
          pointOffset += 16;
        }
        
        coordinates.push(partPoints);
      }
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      throw new ValidationError(
        `Error reading polyline points: ${error instanceof Error ? error.message : String(error)}`,
        'SHAPEFILE_PARSE_ERROR'
      );
    }
    
    if (coordinates.length === 1) {
      return {
        type: 'LineString',
        coordinates: coordinates[0]
      } as LineStringGeometry;
    } else {
      return {
        type: 'MultiLineString',
        coordinates: coordinates
      } as MultiLineStringGeometry;
    }
  }

  /**
   * Parse polygon geometry
   */
  private parsePolygon(view: DataView, offset: number): Geometry {
    type PolygonGeometry = { type: 'Polygon'; coordinates: Position[][] };
    type MultiPolygonGeometry = { type: 'MultiPolygon'; coordinates: Position[][][] };

    // Validate buffer has enough space for header
    if (offset + 40 >= view.byteLength) {
      throw new ValidationError(
        'Invalid polygon: buffer too small for header',
        'SHAPEFILE_PARSE_ERROR'
      );
    }

    const numParts = view.getInt32(offset + 36, true);
    const numPoints = view.getInt32(offset + 40, true);

    // Validate reasonable values for numParts and numPoints
    if (numParts < 0 || numParts > 1000000 || numPoints < 0 || numPoints > 1000000) {
      throw new ValidationError(
        `Invalid polygon: unreasonable number of parts (${numParts}) or points (${numPoints})`,
        'SHAPEFILE_PARSE_ERROR'
      );
    }

    // Calculate required buffer size and validate
    const partsSize = numParts * 4;
    const pointsSize = numPoints * 16;
    const requiredSize = offset + 44 + partsSize + pointsSize;
    
    if (requiredSize > view.byteLength) {
      throw new ValidationError(
        'Invalid polygon: buffer too small for specified parts and points',
        'SHAPEFILE_PARSE_ERROR'
      );
    }
    
    // Read part indices
    const parts: number[] = [];
    let partOffset = offset + 44;
    for (let i = 0; i < numParts; i++) {
      const partIndex = view.getInt32(partOffset, true);
      if (partIndex < 0 || partIndex >= numPoints) {
        throw new ValidationError(
          `Invalid polygon: part index ${partIndex} out of bounds`,
          'SHAPEFILE_PARSE_ERROR'
        );
      }
      parts.push(partIndex);
      partOffset += 4;
    }
    parts.push(numPoints);
    
    // Read rings
    const rings: Position[][] = [];
    let pointOffset = partOffset;
    
    try {
      for (let i = 0; i < numParts; i++) {
        const ring: Position[] = [];
        const start = parts[i];
        const end = parts[i + 1];
        
        if (start > end) {
          throw new ValidationError(
            `Invalid polygon: part ${i} has invalid range (${start} > ${end})`,
            'SHAPEFILE_PARSE_ERROR'
          );
        }
        
        for (let j = start; j < end; j++) {
          const x = view.getFloat64(pointOffset, true);
          const y = view.getFloat64(pointOffset + 8, true);
          ring.push([x, y]);
          pointOffset += 16;
        }
        
        rings.push(ring);
      }
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      throw new ValidationError(
        `Error reading polygon points: ${error instanceof Error ? error.message : String(error)}`,
        'SHAPEFILE_PARSE_ERROR'
      );
    }
    
    // Organize rings into polygons
    const polygons: Position[][][] = [];
    let currentPolygon: Position[][] = [];
    
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
      return {
        type: 'Polygon',
        coordinates: polygons[0]
      } as PolygonGeometry;
    } else {
      return {
        type: 'MultiPolygon',
        coordinates: polygons
      } as MultiPolygonGeometry;
    }
  }

  /**
   * Check if a ring is clockwise
   */
  private isClockwise(ring: Position[]): boolean {
    let sum = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const [x1, y1] = ring[i];
      const [x2, y2] = ring[i + 1];
      sum += (x2 - x1) * (y2 + y1);
    }
    return sum > 0;
  }

  /**
   * Validate shapefile structure
   */
  private validateStructure(
    structure: ShapefileStructure,
    components: { dbf?: File; shx?: File; prj?: File }
  ): Array<{
    type: string;
    message: string;
    details?: Record<string, unknown>;
  }> {
    const issues: Array<{
      type: string;
      message: string;
      details?: Record<string, unknown>;
    }> = [];

    // Check file code
    if (structure.shapeHeader.fileCode !== ShapefileParser.FILE_CODE) {
      issues.push({
        type: 'INVALID_FILE_CODE',
        message: 'Invalid shapefile format: incorrect file code',
        details: { fileCode: structure.shapeHeader.fileCode }
      });
    }

    // Check shape type
    if (structure.shapeHeader.shapeType === ShapeType.NULL) {
      issues.push({
        type: 'NULL_SHAPE_TYPE',
        message: 'Shapefile contains null shapes'
      });
    }

    // Check for missing DBF
    if (!structure.dbfHeader) {
      issues.push({
        type: 'MISSING_DBF',
        message: 'DBF file not found or could not be parsed'
      });
    }

    return issues;
  }
}
