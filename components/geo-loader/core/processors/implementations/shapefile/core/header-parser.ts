import { ValidationError } from '../../../../errors/types';
import { ShapefileHeader, ShapeType } from '../types';
import { ShapefileValidator } from './validator';

export class HeaderParser {
  private validator: ShapefileValidator;

  constructor() {
    this.validator = new ShapefileValidator();
  }

  /**
   * Read shapefile header from buffer
   */
  async parseHeader(buffer: ArrayBuffer): Promise<ShapefileHeader> {
    try {
      // Validate buffer size
      this.validator.validateHeaderBuffer(buffer);

      const view = new DataView(buffer);
      
      // Read and validate file code
      const fileCode = view.getInt32(0, false);
      this.validator.validateFileCode(fileCode);
      
      // Read header values
      const fileLength = view.getInt32(24, false) * 2;
      const version = view.getInt32(28, true);
      const shapeType = view.getInt32(32, true) as ShapeType;
      
      // Validate file length
      this.validator.validateFileLength(fileLength, buffer.byteLength);

      // Validate version
      this.validator.validateVersion(version);
      
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
      this.validator.validateBoundingBox(xMin, yMin, xMax, yMax);

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
   * Read record header from view at offset
   */
  readRecordHeader(
    view: DataView, 
    offset: number
  ): { recordNumber: number; contentLength: number } {
    try {
      // Read record header values
      const recordNumber = view.getInt32(offset, false);
      const contentLength = view.getInt32(offset + 4, false);

      // Validate content length
      this.validator.validateRecordContentLength(contentLength, recordNumber);

      return {
        recordNumber,
        contentLength
      };
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      throw new ValidationError(
        `Error reading record header: ${error instanceof Error ? error.message : String(error)}`,
        'SHAPEFILE_PARSE_ERROR'
      );
    }
  }

  /**
   * Get shape type from view at offset
   */
  readShapeType(view: DataView, offset: number): ShapeType {
    return view.getInt32(offset, true) as ShapeType;
  }

  /**
   * Check if shape type has Z values
   */
  hasZValues(shapeType: ShapeType): boolean {
    return [
      ShapeType.POINTZ,
      ShapeType.POLYLINEZ,
      ShapeType.POLYGONZ,
      ShapeType.MULTIPOINTZ
    ].includes(shapeType);
  }

  /**
   * Check if shape type has M values
   */
  hasMValues(shapeType: ShapeType): boolean {
    return [
      ShapeType.POINTM,
      ShapeType.POLYLINEM,
      ShapeType.POLYGONM,
      ShapeType.MULTIPOINTM
    ].includes(shapeType);
  }

  /**
   * Get base shape type (without Z/M modifiers)
   */
  getBaseShapeType(shapeType: ShapeType): ShapeType {
    switch (shapeType) {
      case ShapeType.POINTZ:
      case ShapeType.POINTM:
        return ShapeType.POINT;
      case ShapeType.POLYLINEZ:
      case ShapeType.POLYLINEM:
        return ShapeType.POLYLINE;
      case ShapeType.POLYGONZ:
      case ShapeType.POLYGONM:
        return ShapeType.POLYGON;
      case ShapeType.MULTIPOINTZ:
      case ShapeType.MULTIPOINTM:
        return ShapeType.MULTIPOINT;
      default:
        return shapeType;
    }
  }

  /**
   * Get shape type name
   */
  getShapeTypeName(shapeType: ShapeType): string {
    const baseType = this.getBaseShapeType(shapeType);
    const hasZ = this.hasZValues(shapeType);
    const hasM = this.hasMValues(shapeType);

    let name = ShapeType[baseType];
    if (hasZ) name += ' with Z values';
    if (hasM) name += ' with M values';
    
    return name;
  }
}
