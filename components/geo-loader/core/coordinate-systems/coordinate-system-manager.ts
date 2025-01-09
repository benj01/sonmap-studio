import proj4 from 'proj4';
import { CoordinateSystemError } from '../errors/types';
import { CoordinatePoint, CoordinateSystemDefinition, TestPoint } from './types';

/**
 * Manages coordinate system transformations and validation
 */
export class CoordinateSystemManager {
  private static instance: CoordinateSystemManager;
  private initialized = false;
  private systems = new Map<string, CoordinateSystemDefinition>();
  private transformers = new Map<string, proj4.Converter>();

  private constructor() {
    // Private constructor for singleton
  }

  public static getInstance(): CoordinateSystemManager {
    if (!this.instance) {
      this.instance = new CoordinateSystemManager();
    }
    return this.instance;
  }

  public isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Initialize the coordinate system manager
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Register common coordinate systems
      this.registerSystem({
        code: 'EPSG:4326',
        name: 'WGS 84',
        proj4def: '+proj=longlat +datum=WGS84 +no_defs'
      });

      this.registerSystem({
        code: 'EPSG:3857',
        name: 'Web Mercator',
        proj4def: '+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext +no_defs'
      });

      this.initialized = true;
      console.debug('[CoordinateSystemManager] Initialized with common systems');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new CoordinateSystemError(
        'Failed to initialize coordinate systems',
        'COORDINATE_SYSTEM_INIT_ERROR',
        undefined,
        { error: errorMessage }
      );
    }
  }

  /**
   * Register a new coordinate system
   */
  public registerSystem(definition: CoordinateSystemDefinition): void {
    if (this.systems.has(definition.code)) {
      console.warn(`Coordinate system ${definition.code} already registered`);
      return;
    }

    try {
      // Validate the proj4 definition
      proj4(definition.proj4def, 'EPSG:4326', [0, 0]);
      this.systems.set(definition.code, definition);
      console.debug(`[CoordinateSystemManager] Registered system: ${definition.code}`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new CoordinateSystemError(
        `Invalid coordinate system definition: ${errorMessage}`,
        'INVALID_COORDINATE_SYSTEM',
        definition.code
      );
    }
  }

  /**
   * Validate a coordinate system
   */
  public async validateSystem(system: string): Promise<boolean> {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      if (!system) {
        return false;
      }

      // Check if system is already registered
      if (this.systems.has(system)) {
        return true;
      }

      // Try to use proj4 directly
      try {
        proj4(system, 'EPSG:4326', [0, 0]);
        return true;
      } catch {
        return false;
      }
    } catch (error: unknown) {
      console.warn('[CoordinateSystemManager] Validation error:', error);
      return false;
    }
  }

  /**
   * Transform coordinates from one system to another
   */
  public async transform(
    point: CoordinatePoint,
    fromSystem: string,
    toSystem: string
  ): Promise<CoordinatePoint> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const transformer = await this.getTransformer(fromSystem, toSystem);
      const [x, y] = transformer.forward([point.x, point.y]);
      return { x, y };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new CoordinateSystemError(
        `Failed to transform coordinates: ${errorMessage}`,
        'COORDINATE_TRANSFORM_ERROR',
        `${fromSystem} -> ${toSystem}`,
        { point }
      );
    }
  }

  /**
   * Get or create a transformer between two coordinate systems
   */
  private async getTransformer(
    fromSystem: string,
    toSystem: string
  ): Promise<proj4.Converter> {
    const key = `${fromSystem}->${toSystem}`;
    
    if (this.transformers.has(key)) {
      return this.transformers.get(key)!;
    }

    try {
      const transformer = proj4(fromSystem, toSystem);
      this.transformers.set(key, transformer);
      return transformer;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new CoordinateSystemError(
        `Failed to create coordinate transformer: ${errorMessage}`,
        'TRANSFORMER_CREATE_ERROR',
        `${fromSystem} -> ${toSystem}`
      );
    }
  }
}

// Export the singleton instance
export const coordinateSystemManager = CoordinateSystemManager.getInstance();
