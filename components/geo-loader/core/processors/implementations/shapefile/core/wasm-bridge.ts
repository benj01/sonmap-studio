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
let initializationPromise: Promise<void> | null = null;

/**
 * Initialize WebAssembly module with proper synchronization
 */
export async function initWasm(): Promise<void> {
  if (initializationPromise) {
    await initializationPromise;
    return;
  }

  if (isInitialized) {
    return;
  }

  initializationPromise = (async () => {
    try {
      console.debug('[WASM] Initializing WebAssembly module...');
      
      // Initialize with explicit memory settings
      await init({
        memory: new WebAssembly.Memory({ initial: 16, maximum: 100 })
      });
      
      wasmModule = new ShapefileProcessor();
      isInitialized = true;
      console.debug('[WASM] WebAssembly module initialized successfully');
    } catch (error) {
      console.error('[WASM] Failed to initialize WebAssembly module:', error);
      isInitialized = false;
      wasmModule = null;
      throw error;
    } finally {
      initializationPromise = null;
    }
  })();

  await initializationPromise;
}

/**
 * Ensure WebAssembly module is initialized
 */
async function ensureInitialized(): Promise<void> {
  if (!isInitialized || !wasmModule) {
    await initWasm();
  }
}

/**
 * Geometry operations using WebAssembly
 */
export class WasmGeometryConverter {
  /**
   * Calculate bounds for coordinates with validation
   */
  calculateBounds(coordinates: number[]): [number, number, number, number] {
    try {
      if (!coordinates || coordinates.length < 2) {
        throw new Error('Invalid coordinates array');
      }

      if (!coordinates.every(isFinite)) {
        throw new Error('Coordinates contain non-finite values');
      }

      if (!isInitialized || !wasmModule) {
        throw new Error('WebAssembly module not initialized. Call initWasm() first.');
      }

      const coordArray = toFloat64Array(coordinates);
      const bounds = wasmModule.process_geometry(0, coordArray) as number[];

      // Validate bounds
      if (!bounds || bounds.length !== 4 || !bounds.every(isFinite)) {
        throw new Error('Invalid bounds calculated');
      }

      console.debug('[WASM] Bounds calculated:', {
        coordinates: coordinates.slice(0, 4) + '...',
        bounds
      });

      return [bounds[0], bounds[1], bounds[2], bounds[3]];
    } catch (error) {
      console.error('[WASM] Failed to calculate bounds:', error);
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

      // Log input coordinates for debugging
      console.debug('[WASM] Processing geometry:', {
        shapeType,
        coordinateSample: coordinates.slice(0, 4),
        ringSizes
      });

      const coordArray = toFloat64Array(coordinates);
      
      switch (shapeType) {
        case 1: // Point
          if (coordinates.length !== 2) {
            throw new Error('Point must have exactly 2 coordinates');
          }
          return convert_point(coordinates[0], coordinates[1]) as Geometry;
        
        case 3: // PolyLine
          // Handle Swiss coordinates - they should be in pairs
          if (coordinates.length % 2 !== 0) {
            throw new Error('Invalid coordinate array length for PolyLine');
          }

          // Convert flat array to pairs
          const pairs: number[][] = [];
          for (let i = 0; i < coordinates.length; i += 2) {
            pairs.push([coordinates[i], coordinates[i + 1]]);
          }

          // Create MultiLineString geometry
          return {
            type: 'MultiLineString',
            coordinates: [pairs]
          };
        
        case 5: // Polygon
          if (!ringSizes) {
            throw new Error('Ring sizes are required for polygon geometry');
          }

          // Handle Swiss coordinates for polygons
          let offset = 0;
          const rings: number[][][] = [];
          
          for (const size of ringSizes) {
            if (offset + size * 2 > coordinates.length) {
              throw new Error('Invalid ring size');
            }

            const ring: number[][] = [];
            for (let i = 0; i < size * 2; i += 2) {
              ring.push([
                coordinates[offset + i],
                coordinates[offset + i + 1]
              ]);
            }
            rings.push(ring);
            offset += size * 2;
          }

          return {
            type: 'Polygon',
            coordinates: rings
          };
        
        case 8: // MultiPoint
          // Handle Swiss coordinates for MultiPoint
          if (coordinates.length % 2 !== 0) {
            throw new Error('Invalid coordinate array length for MultiPoint');
          }

          const points: number[][] = [];
          for (let i = 0; i < coordinates.length; i += 2) {
            points.push([coordinates[i], coordinates[i + 1]]);
          }

          return {
            type: 'MultiPoint',
            coordinates: points
          };
        
        default:
          throw new Error(`Unsupported shape type: ${shapeType}`);
      }
    } catch (error) {
      console.error('[WASM] Failed to process geometry:', error);
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
