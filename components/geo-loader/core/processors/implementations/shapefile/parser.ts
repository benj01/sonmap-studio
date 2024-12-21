import { Feature, Geometry, Position } from 'geojson';
import { 
  ShapeType,
  ShapefileRecord,
  ShapefileHeader,
  DbfHeader,
  ShapefileField,
  ShapefileParseOptions,
  ShapefileStructure,
  ShapefileAnalyzeResult
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

  /**
   * Find component files (.dbf, .shx, .prj)
   */
  private async findComponentFiles(file: File): Promise<{
    dbf?: File;
    shx?: File;
    prj?: File;
  }> {
    const baseName = file.name.slice(0, -4); // Remove .shp extension
    const directory = file.webkitRelativePath.split('/').slice(0, -1).join('/');
    
    // Get list of files in the same directory
    const dirHandle = await (file as any).getDirectory?.();
    if (!dirHandle) {
      return {}; // Can't access directory
    }
    
    const components: { dbf?: File; shx?: File; prj?: File } = {};
    
    for await (const entry of dirHandle.values()) {
      if (entry.name.startsWith(baseName)) {
        const ext = entry.name.slice(-4).toLowerCase();
        switch (ext) {
          case '.dbf':
            components.dbf = await entry.getFile();
            break;
          case '.shx':
            components.shx = await entry.getFile();
            break;
          case '.prj':
            components.prj = await entry.getFile();
            break;
        }
      }
    }
    
    return components;
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
    try {
      // Find component files
      const components = await this.findComponentFiles(file);
      
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
    const view = new DataView(buffer);
    
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
    
    // Read bounding box
    const xMin = view.getFloat64(36, true);
    const yMin = view.getFloat64(44, true);
    const xMax = view.getFloat64(52, true);
    const yMax = view.getFloat64(60, true);
    const zMin = view.getFloat64(68, true);
    const zMax = view.getFloat64(76, true);
    const mMin = view.getFloat64(84, true);
    const mMax = view.getFloat64(92, true);
    
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
    
    while (offset < header.fileLength) {
      // Check record limit
      if (options.maxRecords && count >= options.maxRecords) {
        break;
      }

      // Read record header
      const recordNumber = view.getInt32(offset, false);
      const contentLength = view.getInt32(offset + 4, false);
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
        console.warn(`Error parsing record at offset ${offset}:`, error);
      }
      
      offset += contentLength * 2 - 4;
      count++;
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
  private parseMultiPoint(view: DataView, offset: number): Geometry {
    const numPoints = view.getInt32(offset + 36, true);
    const points: Position[] = [];
    
    let pointOffset = offset + 40;
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
  private parsePolyline(view: DataView, offset: number): Geometry {
    type LineStringGeometry = { type: 'LineString'; coordinates: Position[] };
    type MultiLineStringGeometry = { type: 'MultiLineString'; coordinates: Position[][] };

    const numParts = view.getInt32(offset + 36, true);
    const numPoints = view.getInt32(offset + 40, true);
    
    // Read part indices
    const parts: number[] = [];
    let partOffset = offset + 44;
    for (let i = 0; i < numParts; i++) {
      parts.push(view.getInt32(partOffset, true));
      partOffset += 4;
    }
    parts.push(numPoints);
    
    // Read points for each part
    const coordinates: Position[][] = [];
    let pointOffset = partOffset;
    
    for (let i = 0; i < numParts; i++) {
      const partPoints: Position[] = [];
      const start = parts[i];
      const end = parts[i + 1];
      
      for (let j = start; j < end; j++) {
        const x = view.getFloat64(pointOffset, true);
        const y = view.getFloat64(pointOffset + 8, true);
        partPoints.push([x, y]);
        pointOffset += 16;
      }
      
      coordinates.push(partPoints);
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

    const numParts = view.getInt32(offset + 36, true);
    const numPoints = view.getInt32(offset + 40, true);
    
    // Read part indices
    const parts: number[] = [];
    let partOffset = offset + 44;
    for (let i = 0; i < numParts; i++) {
      parts.push(view.getInt32(partOffset, true));
      partOffset += 4;
    }
    parts.push(numPoints);
    
    // Read rings
    const rings: Position[][] = [];
    let pointOffset = partOffset;
    
    for (let i = 0; i < numParts; i++) {
      const ring: Position[] = [];
      const start = parts[i];
      const end = parts[i + 1];
      
      for (let j = start; j < end; j++) {
        const x = view.getFloat64(pointOffset, true);
        const y = view.getFloat64(pointOffset + 8, true);
        ring.push([x, y]);
        pointOffset += 16;
      }
      
      rings.push(ring);
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
