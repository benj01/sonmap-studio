import { ValidationError } from '../../../../errors/types';
import { ShapefileHeader, ShapeType, ShapefileStructure } from '../types';

export class ShapefileValidator {
  // Shapefile format constants
  private static readonly HEADER_LENGTH = 100;
  private static readonly RECORD_HEADER_LENGTH = 8;
  private static readonly FILE_CODE = 9994;
  private static readonly VERSION = 1000;

  /**
   * Validate shapefile header buffer
   */
  validateHeaderBuffer(buffer: ArrayBuffer): void {
    if (buffer.byteLength < ShapefileValidator.HEADER_LENGTH) {
      throw new ValidationError(
        'Invalid shapefile: buffer too small for header',
        'SHAPEFILE_PARSE_ERROR',
        undefined,
        { bufferSize: buffer.byteLength, requiredSize: ShapefileValidator.HEADER_LENGTH }
      );
    }
  }

  /**
   * Validate file code
   */
  validateFileCode(fileCode: number): void {
    if (fileCode !== ShapefileValidator.FILE_CODE) {
      throw new ValidationError(
        'Invalid shapefile: incorrect file code',
        'SHAPEFILE_INVALID_CODE',
        undefined,
        { fileCode }
      );
    }
  }

  /**
   * Validate file length
   */
  validateFileLength(fileLength: number, bufferLength: number): void {
    if (fileLength < ShapefileValidator.HEADER_LENGTH || fileLength > bufferLength) {
      throw new ValidationError(
        'Invalid shapefile: incorrect file length',
        'SHAPEFILE_PARSE_ERROR',
        undefined,
        { fileLength, bufferSize: bufferLength }
      );
    }
  }

  /**
   * Validate shapefile version
   */
  validateVersion(version: number): void {
    if (version !== ShapefileValidator.VERSION) {
      throw new ValidationError(
        'Invalid shapefile: unsupported version',
        'SHAPEFILE_PARSE_ERROR',
        undefined,
        { version, supportedVersion: ShapefileValidator.VERSION }
      );
    }
  }

  /**
   * Validate bounding box coordinates
   */
  validateBoundingBox(xMin: number, yMin: number, xMax: number, yMax: number): void {
    if (!Number.isFinite(xMin) || !Number.isFinite(yMin) || 
        !Number.isFinite(xMax) || !Number.isFinite(yMax)) {
      throw new ValidationError(
        'Invalid shapefile: invalid bounding box coordinates',
        'SHAPEFILE_PARSE_ERROR',
        undefined,
        { bbox: { xMin, yMin, xMax, yMax } }
      );
    }
  }

  /**
   * Validate record content length
   */
  validateRecordContentLength(contentLength: number, recordNumber: number): void {
    if (contentLength < 0 || contentLength > 1000000) {
      throw new ValidationError(
        'Invalid shapefile: unreasonable record content length',
        'SHAPEFILE_PARSE_ERROR',
        undefined,
        { recordNumber, contentLength }
      );
    }
  }

  /**
   * Validate record buffer space
   */
  validateRecordBufferSpace(offset: number, recordSize: number, bufferLength: number, recordNumber: number): void {
    if (offset + recordSize > bufferLength) {
      throw new ValidationError(
        'Invalid shapefile: truncated record content',
        'SHAPEFILE_PARSE_ERROR',
        undefined,
        { 
          recordNumber,
          offset,
          requiredSize: recordSize,
          remainingSize: bufferLength - offset
        }
      );
    }
  }

  /**
   * Validate point coordinates
   */
  validatePointCoordinates(x: number, y: number, partIndex: number, pointIndex: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new ValidationError(
        `Invalid shapefile: non-finite coordinates at part ${partIndex}, point ${pointIndex}`,
        'SHAPEFILE_PARSE_ERROR',
        undefined,
        { coordinates: { x, y }, partIndex, pointIndex }
      );
    }
  }

  /**
   * Validate number of parts and points for complex shapes
   */
  validatePartsAndPoints(numParts: number, numPoints: number, shapeType: string): void {
    if (numParts <= 0 || numParts > 1000000 || numPoints <= 0 || numPoints > 1000000) {
      throw new ValidationError(
        `Invalid ${shapeType}: unreasonable number of parts (${numParts}) or points (${numPoints})`,
        'SHAPEFILE_PARSE_ERROR',
        undefined,
        { numParts, numPoints, shapeType }
      );
    }
  }

  /**
   * Validate part index
   */
  validatePartIndex(partIndex: number, numPoints: number): void {
    if (partIndex < 0 || partIndex >= numPoints) {
      throw new ValidationError(
        `Invalid shapefile: part index ${partIndex} out of bounds`,
        'SHAPEFILE_PARSE_ERROR',
        undefined,
        { partIndex, numPoints }
      );
    }
  }

  /**
   * Validate part range
   */
  validatePartRange(start: number, end: number, partIndex: number): void {
    if (start >= end) {
      throw new ValidationError(
        `Invalid shapefile: part ${partIndex} has invalid range (${start} >= ${end})`,
        'SHAPEFILE_PARSE_ERROR',
        undefined,
        { partIndex, start, end }
      );
    }
  }

  /**
   * Validate shapefile structure
   */
  validateStructure(
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
    if (structure.shapeHeader.fileCode !== ShapefileValidator.FILE_CODE) {
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
