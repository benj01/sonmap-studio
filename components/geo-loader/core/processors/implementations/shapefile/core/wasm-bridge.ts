import type { Feature, Geometry } from 'geojson';
import init, { 
  ShapefileProcessor,
  calculate_bounds,
  is_clockwise,
  convert_point,
  convert_multi_point,
  convert_polyline,
  convert_polygon,
  validate_header_buffer,
  validate_file_code,
  validate_file_length,
  validate_version,
  validate_bounding_box,
  validate_record_content_length,
  validate_record_buffer_space,
  validate_point_coordinates,
  validate_parts_and_points,
  validate_part_index,
  validate_part_range,
  validate_shape_type
} from '../wasm/pkg/shapefile_wasm';

let wasmModule: typeof ShapefileProcessor | null = null;
let isInitialized = false;

/**
 * Initialize WebAssembly module
 */
export async function initWasm(): Promise<void> {
  if (!isInitialized) {
    try {
      await init();
      wasmModule = ShapefileProcessor;
      isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize WebAssembly module:', error);
      throw error;
    }
  }
}

/**
 * Geometry operations using WebAssembly
 */
export class WasmGeometryConverter {
  private processor: ShapefileProcessor;

  constructor() {
    if (!isInitialized) {
      throw new Error('WebAssembly module not initialized. Call initWasm() first.');
    }
    this.processor = new wasmModule!();
  }

  /**
   * Calculate bounds for coordinates
   */
  calculateBounds(coordinates: number[]): [number, number, number, number] {
    try {
      const bounds = calculate_bounds(coordinates);
      return [bounds[0], bounds[1], bounds[2], bounds[3]];
    } catch (error) {
      console.error('Failed to calculate bounds:', error);
      throw error;
    }
  }

  /**
   * Check if a ring is clockwise
   */
  isClockwise(coordinates: number[]): boolean {
    try {
      return is_clockwise(coordinates);
    } catch (error) {
      console.error('Failed to check ring orientation:', error);
      throw error;
    }
  }

  /**
   * Convert point coordinates to GeoJSON geometry
   */
  convertPoint(x: number, y: number): Geometry {
    try {
      return convert_point(x, y) as Geometry;
    } catch (error) {
      console.error('Failed to convert point:', error);
      throw error;
    }
  }

  /**
   * Convert multipoint coordinates to GeoJSON geometry
   */
  convertMultiPoint(coordinates: number[]): Geometry {
    try {
      return convert_multi_point(coordinates) as Geometry;
    } catch (error) {
      console.error('Failed to convert multipoint:', error);
      throw error;
    }
  }

  /**
   * Convert polyline coordinates to GeoJSON geometry
   */
  convertPolyline(coordinates: number[]): Geometry {
    try {
      return convert_polyline(coordinates) as Geometry;
    } catch (error) {
      console.error('Failed to convert polyline:', error);
      throw error;
    }
  }

  /**
   * Convert polygon rings to GeoJSON geometry
   */
  convertPolygon(coordinates: number[], ringSizes: number[]): Geometry {
    try {
      return convert_polygon(coordinates, ringSizes) as Geometry;
    } catch (error) {
      console.error('Failed to convert polygon:', error);
      throw error;
    }
  }
}

/**
 * Validation operations using WebAssembly
 */
export class WasmValidator {
  /**
   * Validate shapefile header buffer
   */
  validateHeaderBuffer(bufferLength: number): void {
    try {
      validate_header_buffer(bufferLength);
    } catch (error) {
      console.error('Header buffer validation failed:', error);
      throw error;
    }
  }

  /**
   * Validate file code
   */
  validateFileCode(fileCode: number): void {
    try {
      validate_file_code(fileCode);
    } catch (error) {
      console.error('File code validation failed:', error);
      throw error;
    }
  }

  /**
   * Validate file length
   */
  validateFileLength(fileLength: number, bufferLength: number): void {
    try {
      validate_file_length(fileLength, bufferLength);
    } catch (error) {
      console.error('File length validation failed:', error);
      throw error;
    }
  }

  /**
   * Validate shapefile version
   */
  validateVersion(version: number): void {
    try {
      validate_version(version);
    } catch (error) {
      console.error('Version validation failed:', error);
      throw error;
    }
  }

  /**
   * Validate bounding box coordinates
   */
  validateBoundingBox(xMin: number, yMin: number, xMax: number, yMax: number): void {
    try {
      validate_bounding_box(xMin, yMin, xMax, yMax);
    } catch (error) {
      console.error('Bounding box validation failed:', error);
      throw error;
    }
  }

  /**
   * Validate record content length
   */
  validateRecordContentLength(contentLength: number, recordNumber: number): void {
    try {
      validate_record_content_length(contentLength, recordNumber);
    } catch (error) {
      console.error('Record content length validation failed:', error);
      throw error;
    }
  }

  /**
   * Validate record buffer space
   */
  validateRecordBufferSpace(
    offset: number,
    recordSize: number,
    bufferLength: number,
    recordNumber: number
  ): void {
    try {
      validate_record_buffer_space(offset, recordSize, bufferLength, recordNumber);
    } catch (error) {
      console.error('Record buffer space validation failed:', error);
      throw error;
    }
  }

  /**
   * Validate point coordinates
   */
  validatePointCoordinates(
    x: number,
    y: number,
    partIndex: number,
    pointIndex: number
  ): void {
    try {
      validate_point_coordinates(x, y, partIndex, pointIndex);
    } catch (error) {
      console.error('Point coordinates validation failed:', error);
      throw error;
    }
  }

  /**
   * Validate number of parts and points
   */
  validatePartsAndPoints(numParts: number, numPoints: number, shapeType: string): void {
    try {
      validate_parts_and_points(numParts, numPoints, shapeType);
    } catch (error) {
      console.error('Parts and points validation failed:', error);
      throw error;
    }
  }

  /**
   * Validate part index
   */
  validatePartIndex(partIndex: number, numPoints: number): void {
    try {
      validate_part_index(partIndex, numPoints);
    } catch (error) {
      console.error('Part index validation failed:', error);
      throw error;
    }
  }

  /**
   * Validate part range
   */
  validatePartRange(start: number, end: number, partIndex: number): void {
    try {
      validate_part_range(start, end, partIndex);
    } catch (error) {
      console.error('Part range validation failed:', error);
      throw error;
    }
  }

  /**
   * Validate shape type
   */
  validateShapeType(shapeType: number): boolean {
    try {
      return validate_shape_type(shapeType);
    } catch (error) {
      console.error('Shape type validation failed:', error);
      throw error;
    }
  }
}
