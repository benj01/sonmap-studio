import { 
  COORDINATE_SYSTEMS,
  CoordinateSystem,
  CoordinatePoint,
  isValidPoint 
} from '../types/coordinates';
import { 
  CoordinateSystemError,
  CoordinateTransformationError,
  InvalidCoordinateError
} from './errors/types';
import proj4 from 'proj4';

export interface CoordinateSystemDefinition {
  code: string;
  proj4def: string;
  bounds?: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  units?: string;
  description?: string;
}

interface TransformationCacheKey {
  fromSystem: string;
  toSystem: string;
  x: number;
  y: number;
}

interface TestPoint {
  point: [number, number];
  expectedWGS84: [number, number];
  tolerance: number;
}

export class CoordinateSystemManager {
  private static instance: CoordinateSystemManager;
  private initialized = false;
  private systems = new Map<string, CoordinateSystemDefinition>();
  private transformers = new Map<string, proj4.Converter>();
  private transformationCache = new Map<string, CoordinatePoint>();
  private readonly MAX_CACHE_SIZE = 10000;

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

  private getCacheKey({ fromSystem, toSystem, x, y }: TransformationCacheKey): string {
    return `${fromSystem}:${toSystem}:${x}:${y}`;
  }

  private clearCache(): void {
    this.transformationCache.clear();
  }

  private addToCache(key: TransformationCacheKey, point: CoordinatePoint): void {
    if (this.transformationCache.size >= this.MAX_CACHE_SIZE) {
      // Clear half of the cache when limit is reached
      const keys = Array.from(this.transformationCache.keys());
      for (let i = 0; i < keys.length / 2; i++) {
        this.transformationCache.delete(keys[i]);
      }
    }
    this.transformationCache.set(this.getCacheKey(key), point);
  }

  public async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // First register all coordinate systems with proj4
      const systems = [
        {
          code: COORDINATE_SYSTEMS.WGS84,
          proj4def: '+proj=longlat +datum=WGS84 +no_defs +type=crs',
          bounds: {
            minX: -180,
            minY: -90,
            maxX: 180,
            maxY: 90
          },
          units: 'degrees',
          description: 'WGS84 Geographic Coordinate System'
        },
        {
          code: COORDINATE_SYSTEMS.SWISS_LV95,
          proj4def: '+proj=somerc +lat_0=46.9524055555556 +lon_0=7.43958333333333 +k_0=1 ' +
                   '+x_0=2600000 +y_0=1200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 ' +
                   '+units=m +no_defs +type=crs',
          bounds: {
            minX: 2485000,
            minY: 1075000,
            maxX: 2835000,
            maxY: 1295000
          },
          units: 'meters',
          description: 'Swiss LV95 / EPSG:2056'
        },
        {
          code: COORDINATE_SYSTEMS.SWISS_LV03,
          proj4def: '+proj=somerc +lat_0=46.9524055555556 +lon_0=7.43958333333333 +k_0=1 ' +
                   '+x_0=600000 +y_0=200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 ' +
                   '+units=m +no_defs +type=crs',
          bounds: {
            minX: 485000,
            minY: 75000,
            maxX: 835000,
            maxY: 295000
          },
          units: 'meters',
          description: 'Swiss LV03 / EPSG:21781'
        }
      ];

      // Register all systems first
      for (const system of systems) {
        proj4.defs(system.code, system.proj4def);
        this.systems.set(system.code, system);
      }

      // Clear any cached transformers
      this.transformers.clear();
      this.clearCache();

      // Then verify all systems
      await this.verifyAllSystems();

      this.initialized = true;
    } catch (error) {
      this.initialized = false;
      throw new CoordinateSystemError(
        `Failed to initialize coordinate systems: ${error instanceof Error ? error.message : String(error)}`,
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  public registerSystem(definition: CoordinateSystemDefinition): void {
    if (!definition.code || !definition.proj4def) {
      throw new CoordinateSystemError(
        'Invalid coordinate system definition',
        { definition }
      );
    }

    try {
      // Verify proj4 definition
      proj4.defs(definition.code, definition.proj4def);
      this.systems.set(definition.code, definition);
      
      // Clear cached transformers that might use this system
      this.transformers.clear();
      this.clearCache();
    } catch (error) {
      throw new CoordinateSystemError(
        `Failed to register coordinate system: ${error instanceof Error ? error.message : String(error)}`,
        { definition, error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  private async verifyAllSystems(): Promise<void> {
    const testPoints: Record<string, TestPoint> = {
      [COORDINATE_SYSTEMS.SWISS_LV95]: {
        point: [2645021, 1249991],
        expectedWGS84: [8.0, 47.4],
        tolerance: 0.5
      },
      [COORDINATE_SYSTEMS.SWISS_LV03]: {
        point: [645021, 249991],
        expectedWGS84: [8.0, 47.4],
        tolerance: 0.5
      }
    };

    for (const [system, test] of Object.entries(testPoints)) {
      try {
        const transformed = await this.transform(
          { x: test.point[0], y: test.point[1] },
          system as CoordinateSystem,
          COORDINATE_SYSTEMS.WGS84
        );

        const lonDiff = Math.abs(transformed.x - test.expectedWGS84[0]);
        const latDiff = Math.abs(transformed.y - test.expectedWGS84[1]);

        if (lonDiff > test.tolerance || latDiff > test.tolerance) {
          throw new CoordinateTransformationError(
            `Transformation verification failed for ${system}`,
            { x: test.point[0], y: test.point[1] },
            system as CoordinateSystem,
            COORDINATE_SYSTEMS.WGS84,
            {
              expected: { x: test.expectedWGS84[0], y: test.expectedWGS84[1] },
              actual: transformed,
              tolerance: test.tolerance,
              difference: { x: lonDiff, y: latDiff }
            }
          );
        }
      } catch (error) {
        throw new CoordinateSystemError(
          `System verification failed for ${system}: ${error instanceof Error ? error.message : String(error)}`,
          { system, error: error instanceof Error ? error.message : String(error) }
        );
      }
    }
  }

  private getTransformer(fromSystem: string, toSystem: string): proj4.Converter {
    const key = `${fromSystem}:${toSystem}`;
    let transformer = this.transformers.get(key);

    if (!transformer) {
      if (!this.systems.has(fromSystem)) {
        throw new CoordinateSystemError(
          `Source coordinate system not found: ${fromSystem}`,
          { fromSystem }
        );
      }
      if (!this.systems.has(toSystem)) {
        throw new CoordinateSystemError(
          `Target coordinate system not found: ${toSystem}`,
          { toSystem }
        );
      }

      transformer = proj4(fromSystem, toSystem);
      this.transformers.set(key, transformer);
    }

    return transformer;
  }

  public async transform(
    point: CoordinatePoint,
    fromSystem: string,
    toSystem: string
  ): Promise<CoordinatePoint> {
    if (!this.initialized) {
      throw new CoordinateSystemError('Coordinate systems not initialized');
    }

    if (!isValidPoint(point)) {
      throw new InvalidCoordinateError(
        'Invalid coordinate point',
        point,
        { reason: 'invalid_point' }
      );
    }

    // Check cache first
    const cacheKey: TransformationCacheKey = {
      fromSystem,
      toSystem,
      x: point.x,
      y: point.y
    };
    const cached = this.transformationCache.get(this.getCacheKey(cacheKey));
    if (cached) {
      return cached;
    }

    try {
      // Handle special case for same system
      if (fromSystem === toSystem) {
        return { ...point };
      }

      // Get transformer and perform transformation
      const transformer = this.getTransformer(fromSystem, toSystem);
      const [x, y] = transformer.forward([point.x, point.y]);

      const result: CoordinatePoint = { x, y };

      // Validate result
      if (!isValidPoint(result)) {
        throw new CoordinateTransformationError(
          'Invalid transformation result',
          point,
          fromSystem as CoordinateSystem,
          toSystem as CoordinateSystem,
          { result }
        );
      }

      // Cache successful transformation
      this.addToCache(cacheKey, result);

      return result;
    } catch (error) {
      if (error instanceof CoordinateSystemError || 
          error instanceof CoordinateTransformationError) {
        throw error;
      }
      throw new CoordinateTransformationError(
        `Transformation failed: ${error instanceof Error ? error.message : String(error)}`,
        point,
        fromSystem as CoordinateSystem,
        toSystem as CoordinateSystem,
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  public getSystemDefinition(code: string): CoordinateSystemDefinition | undefined {
    return this.systems.get(code);
  }

  public getSupportedSystems(): string[] {
    return Array.from(this.systems.keys());
  }

  public validateBounds(point: CoordinatePoint, system: string): boolean {
    const definition = this.systems.get(system);
    if (!definition || !definition.bounds) {
      return true; // No bounds defined
    }

    const { bounds } = definition;
    return (
      point.x >= bounds.minX &&
      point.x <= bounds.maxX &&
      point.y >= bounds.minY &&
      point.y <= bounds.maxY
    );
  }

  public getSystemUnits(system: string): string | undefined {
    return this.systems.get(system)?.units;
  }

  public reset(): void {
    this.initialized = false;
    this.systems.clear();
    this.transformers.clear();
    this.clearCache();
  }
}

// Export singleton instance
export const coordinateSystemManager = CoordinateSystemManager.getInstance();
