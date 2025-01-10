import type { Feature, Geometry } from 'geojson';
import init, { 
  ShapefileProcessor,
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

// Convert JavaScript array to Float64Array for WebAssembly
function toFloat64Array(arr: number[]): Float64Array {
  return Float64Array.from(arr);
}

// Convert JavaScript array to Uint32Array for ring sizes
function toUint32Array(arr: number[]): Uint32Array {
  return Uint32Array.from(arr);
}

let wasmModule: ShapefileProcessor | null = null;
let isInitialized = false;

/**
 * Initialize WebAssembly module
 */
export async function initWasm(): Promise<void> {
  if (!isInitialized) {
    try {
      await init();
      wasmModule = new ShapefileProcessor();
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
  /**
   * Calculate bounds for coordinates
   */
  calculateBounds(coordinates: number[]): [number, number, number, number] {
    try {
      if (!isInitialized) {
        throw new Error('WebAssembly module not initialized. Call initWasm() first.');
      }
      // calculate_bounds is not exported by the Wasm module, we'll use the processor instead
      if (!wasmModule) {
        throw new Error('WebAssembly module not initialized. Call initWasm() first.');
      }
      const bounds = wasmModule.process_geometry(0, toFloat64Array(coordinates)) as number[];
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
      if (!isInitialized) {
        throw new Error('WebAssembly module not initialized. Call initWasm() first.');
      }
      return is_clockwise(toFloat64Array(coordinates));
    } catch (error) {
      console.error('Failed to check ring orientation:', error);
      throw error;
    }
  }

  /**
   * Process geometry based on shape type
   */
  processGeometry(shapeType: number, coordinates: number[], ringSizes?: number[]): Geometry {
    try {
      if (!isInitialized || !wasmModule) {
        throw new Error('WebAssembly module not initialized. Call initWasm() first.');
      }
      const coordArray = toFloat64Array(coordinates);
      
      switch (shapeType) {
        case 1: // Point
          if (coordinates.length !== 2) {
            throw new Error('Point must have exactly 2 coordinates');
          }
          return convert_point(coordinates[0], coordinates[1]) as Geometry;
        
        case 3: // PolyLine
          return convert_polyline(coordArray) as Geometry;
        
        case 5: // Polygon
          if (!ringSizes) {
            throw new Error('Ring sizes are required for polygon geometry');
          }
          return convert_polygon(coordArray, toUint32Array(ringSizes)) as Geometry;
        
        case 8: // MultiPoint
          return convert_multi_point(coordArray) as Geometry;
        
        default:
          throw new Error(`Unsupported shape type: ${shapeType}`);
      }
    } catch (error) {
      console.error('Failed to process geometry:', error);
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
      if (!isInitialized) {
        throw new Error('WebAssembly module not initialized. Call initWasm() first.');
      }
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
      if (!isInitialized) {
        throw new Error('WebAssembly module not initialized. Call initWasm() first.');
      }
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
      if (!isInitialized) {
        throw new Error('WebAssembly module not initialized. Call initWasm() first.');
      }
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
      if (!isInitialized) {
        throw new Error('WebAssembly module not initialized. Call initWasm() first.');
      }
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
      if (!isInitialized) {
        throw new Error('WebAssembly module not initialized. Call initWasm() first.');
      }
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
      if (!isInitialized) {
        throw new Error('WebAssembly module not initialized. Call initWasm() first.');
      }
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
      if (!isInitialized) {
        throw new Error('WebAssembly module not initialized. Call initWasm() first.');
      }
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
      if (!isInitialized) {
        throw new Error('WebAssembly module not initialized. Call initWasm() first.');
      }
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
      if (!isInitialized) {
        throw new Error('WebAssembly module not initialized. Call initWasm() first.');
      }
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
      if (!isInitialized) {
        throw new Error('WebAssembly module not initialized. Call initWasm() first.');
      }
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
      if (!isInitialized) {
        throw new Error('WebAssembly module not initialized. Call initWasm() first.');
      }
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
      if (!isInitialized) {
        throw new Error('WebAssembly module not initialized. Call initWasm() first.');
      }
      return validate_shape_type(shapeType);
    } catch (error) {
      console.error('Shape type validation failed:', error);
      throw error;
    }
  }
}
