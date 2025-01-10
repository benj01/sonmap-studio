import { ShapeType, ShapefileStructure } from '../types';
import { WasmValidator } from './wasm-bridge';
import { ValidationError } from '../../../../errors/types';

export class ShapefileValidator {
  private wasmValidator: WasmValidator;

  constructor() {
    this.wasmValidator = new WasmValidator();
  }

  /**
   * Ensure WebAssembly is initialized
   */
  private ensureInitialized(): void {
    if (!this.wasmValidator) {
      throw new ValidationError(
        'Shapefile validator not properly initialized',
        'INITIALIZATION_ERROR',
        undefined,
        { detail: 'WebAssembly module not initialized. Make sure geo-loader is properly initialized before processing shapefiles.' }
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
    this.ensureInitialized();
    const issues: Array<{
      type: string;
      message: string;
      details?: Record<string, unknown>;
    }> = [];

    try {
      // Validate file code using WebAssembly
      this.wasmValidator.validateFileCode(structure.shapeHeader.fileCode);
    } catch (error) {
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

  /**
   * Validate header buffer
   */
  validateHeaderBuffer(buffer: ArrayBuffer): void {
    this.ensureInitialized();
    try {
      this.wasmValidator.validateHeaderBuffer(buffer.byteLength);
    } catch (error) {
      throw new ValidationError(
        'Invalid shapefile header buffer',
        'HEADER_VALIDATION_ERROR',
        undefined,
        { bufferLength: buffer.byteLength }
      );
    }
  }

  /**
   * Validate file code
   */
  validateFileCode(fileCode: number): void {
    this.ensureInitialized();
    try {
      this.wasmValidator.validateFileCode(fileCode);
    } catch (error) {
      throw new ValidationError(
        'Invalid shapefile file code',
        'FILE_CODE_ERROR',
        undefined,
        { fileCode }
      );
    }
  }

  /**
   * Validate file length
   */
  validateFileLength(fileLength: number, bufferLength: number): void {
    this.ensureInitialized();
    try {
      this.wasmValidator.validateFileLength(fileLength, bufferLength);
    } catch (error) {
      throw new ValidationError(
        'Invalid shapefile length',
        'FILE_LENGTH_ERROR',
        undefined,
        { fileLength, bufferLength }
      );
    }
  }

  /**
   * Validate version
   */
  validateVersion(version: number): void {
    this.ensureInitialized();
    try {
      this.wasmValidator.validateVersion(version);
    } catch (error) {
      throw new ValidationError(
        'Invalid shapefile version',
        'VERSION_ERROR',
        undefined,
        { version }
      );
    }
  }

  /**
   * Validate bounding box
   */
  validateBoundingBox(xMin: number, yMin: number, xMax: number, yMax: number): void {
    this.ensureInitialized();
    try {
      this.wasmValidator.validateBoundingBox(xMin, yMin, xMax, yMax);
    } catch (error) {
      throw new ValidationError(
        'Invalid shapefile bounding box',
        'BBOX_ERROR',
        undefined,
        { bbox: { xMin, yMin, xMax, yMax } }
      );
    }
  }

  /**
   * Validate record content length
   */
  validateRecordContentLength(contentLength: number, recordNumber: number): void {
    this.ensureInitialized();
    try {
      this.wasmValidator.validateRecordContentLength(contentLength, recordNumber);
    } catch (error) {
      throw new ValidationError(
        'Invalid record content length',
        'RECORD_LENGTH_ERROR',
        undefined,
        { contentLength, recordNumber }
      );
    }
  }
}
