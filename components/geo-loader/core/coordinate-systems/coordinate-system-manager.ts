import { Feature } from 'geojson';
import { 
  COORDINATE_SYSTEMS, 
  CoordinateSystem,
  isSwissSystem,
  isWGS84System 
} from '../../types/coordinates';

export type CoordinateSystemBounds = {
  x: { min: number; max: number };
  y: { min: number; max: number };
};

export type CoordinateSystemId = 'EPSG:2056' | 'EPSG:21781' | 'EPSG:4326';

export const COORDINATE_SYSTEM_BOUNDS: Record<CoordinateSystemId, CoordinateSystemBounds> = {
  'EPSG:2056': { // Swiss LV95
    x: { min: 2000000, max: 3000000 },
    y: { min: 1000000, max: 2000000 }
  },
  'EPSG:21781': { // Swiss LV03
    x: { min: 400000, max: 900000 },
    y: { min: 50000, max: 400000 }
  },
  'EPSG:4326': { // WGS84
    x: { min: -180, max: 180 },
    y: { min: -90, max: 90 }
  }
};
import proj4 from 'proj4';

// Define projections for Swiss coordinate systems
const SWISS_PROJECTIONS: Record<string, string> = {
  [COORDINATE_SYSTEMS.SWISS_LV95]: '+proj=somerc +lat_0=46.95240555555556 +lon_0=7.439583333333333 +k_0=1 +x_0=2600000 +y_0=1200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs +type=crs',
  [COORDINATE_SYSTEMS.SWISS_LV03]: '+proj=somerc +lat_0=46.95240555555556 +lon_0=7.439583333333333 +k_0=1 +x_0=600000 +y_0=200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs +type=crs'
};

class CoordinateSystemManager {
  private static instance: CoordinateSystemManager;
  private transformCache: Map<string, Function>;
  private featureCache: Map<string, Feature>;
  private initialized: boolean = false;
  private initializationPromise: Promise<void> | null = null;
  private lastCacheClear: number = 0;
  private readonly CACHE_LIFETIME = 5 * 60 * 1000; // 5 minutes

  private constructor() {
    this.transformCache = new Map();
    this.featureCache = new Map();
  }

  static getInstance(): CoordinateSystemManager {
    if (!CoordinateSystemManager.instance) {
      CoordinateSystemManager.instance = new CoordinateSystemManager();
    }
    return CoordinateSystemManager.instance;
  }

  /**
   * Validate a coordinate system without initialization check
   */
  private validateSystemSync(system: string): boolean {
    return isSwissSystem(system as CoordinateSystem) || 
           isWGS84System(system as CoordinateSystem);
  }

  /**
   * Validate a coordinate system with initialization
   */
  async validate(system: string): Promise<boolean> {
    try {
      await this.ensureInitialized();
      return this.validateSystemSync(system);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[CoordinateSystemManager] Coordinate system validation failed:', errorMessage);
      return false;
    }
  }

  /**
   * Validate a coordinate system (public API)
   */
  async validateSystem(system: CoordinateSystem): Promise<boolean> {
    try {
      // For initialization errors, still allow validation of known systems
      if (!this.initialized) {
        return this.validateSystemSync(system);
      }
      return this.validate(system);
    } catch (error) {
      console.error('[CoordinateSystemManager] System validation failed:', error);
      // Fall back to sync validation if async fails
      return this.validateSystemSync(system);
    }
  }

  /**
   * Transform features from one coordinate system to another
   */
  async transform(
    features: Feature[],
    from: CoordinateSystem,
    to: CoordinateSystem
  ): Promise<Feature[]> {
    await this.ensureInitialized();

    if (from === to) {
      return features;
    }

    if (!await this.validateSystem(from) || !await this.validateSystem(to)) {
      throw new Error(`Invalid coordinate systems: from=${from}, to=${to}`);
    }

    const transformer = await this.getTransformer(from, to);
    return Promise.all(features.map(feature => this.transformFeature(feature, transformer, from, to)));
  }

  /**
   * Attempt to detect the coordinate system of features based on coordinate ranges
   */
  async detect(features: Feature[]): Promise<CoordinateSystem | undefined> {
    try {
      await this.ensureInitialized();
      
      if (!features.length) return undefined;

      // Extract all coordinates
      const coords: number[][] = [];
      const processGeometry = (geometry: any) => {
        if (!geometry) return;
        
        switch (geometry.type) {
          case 'Point':
            coords.push(geometry.coordinates);
            break;
          case 'LineString':
          case 'MultiPoint':
            coords.push(...geometry.coordinates);
            break;
          case 'Polygon':
          case 'MultiLineString':
            geometry.coordinates.forEach((ring: number[][]) => coords.push(...ring));
            break;
          case 'MultiPolygon':
            geometry.coordinates.forEach((polygon: number[][][]) => 
              polygon.forEach(ring => coords.push(...ring))
            );
            break;
        }
      };

      features.forEach(feature => processGeometry(feature.geometry));

      if (!coords.length) return undefined;

      // Calculate coordinate ranges
      const ranges = coords.reduce(
        (acc, [x, y]) => ({
          minX: Math.min(acc.minX, x),
          maxX: Math.max(acc.maxX, x),
          minY: Math.min(acc.minY, y),
          maxY: Math.max(acc.maxY, y)
        }),
        { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
      );

      console.debug('[CoordinateSystemManager] Detected coordinate ranges:', ranges);

      // Swiss LV95 ranges (adjusted for better coverage of Swiss locations)
      if (
        ranges.minX >= 2000000 && ranges.maxX <= 3000000 &&
        ranges.minY >= 1000000 && ranges.maxY <= 2000000
      ) {
        console.debug('[CoordinateSystemManager] Detected Swiss LV95 coordinates');
        return COORDINATE_SYSTEMS.SWISS_LV95;
      } 
      // Swiss LV03 ranges (adjusted for better coverage)
      else if (
        ranges.minX >= 400000 && ranges.maxX <= 900000 &&
        ranges.minY >= 50000 && ranges.maxY <= 400000
      ) {
        console.debug('[CoordinateSystemManager] Detected Swiss LV03 coordinates');
        return COORDINATE_SYSTEMS.SWISS_LV03;
      }
      // WGS84 ranges
      else if (
        ranges.minX >= -180 && ranges.maxX <= 180 &&
        ranges.minY >= -90 && ranges.maxY <= 90
      ) {
        console.debug('[CoordinateSystemManager] Detected WGS84 coordinates');
        return COORDINATE_SYSTEMS.WGS84;
      }

      // Default to WGS84 if no specific system is detected
      console.debug('[CoordinateSystemManager] Could not definitively detect coordinate system, defaulting to WGS84');
      return COORDINATE_SYSTEMS.WGS84;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[CoordinateSystemManager] Coordinate system detection failed:', errorMessage);
      return COORDINATE_SYSTEMS.WGS84;
    }
  }

  private async getTransformer(
    from: CoordinateSystem,
    to: CoordinateSystem
  ): Promise<Function> {
    const key = `${from}->${to}`;
    
    if (!this.transformCache.has(key)) {
      let transformer: Function;

      if (isSwissSystem(from) && isWGS84System(to)) {
        const projection = SWISS_PROJECTIONS[from];
        transformer = (coord: number[]) => {
          if (!Array.isArray(coord) || coord.length < 2) {
            throw new Error(`Invalid coordinate array: ${JSON.stringify(coord)}`);
          }

          const [x, y] = coord;
          if (!Number.isFinite(x) || !Number.isFinite(y)) {
            throw new Error(`Non-finite coordinates: x=${x}, y=${y}`);
          }

          try {
            const result = proj4(projection, 'WGS84', coord);
            if (!result.every(isFinite)) {
              throw new Error(`Transformation produced non-finite coordinates: ${result}`);
            }
            return result;
          } catch (error: unknown) {
            throw new Error(`Transformation failed: ${error instanceof Error ? error.message : String(error)}`);
          }
        };
      } else if (isWGS84System(from) && isSwissSystem(to)) {
        const projection = SWISS_PROJECTIONS[to];
        transformer = (coord: number[]) => {
          if (!Array.isArray(coord) || coord.length < 2) {
            throw new Error(`Invalid coordinate array: ${JSON.stringify(coord)}`);
          }

          const [x, y] = coord;
          if (!Number.isFinite(x) || !Number.isFinite(y)) {
            throw new Error(`Non-finite coordinates: x=${x}, y=${y}`);
          }

          try {
            const result = proj4('WGS84', projection, coord);
            if (!result.every(isFinite)) {
              throw new Error(`Transformation produced non-finite coordinates: ${result}`);
            }
            return result;
          } catch (error: unknown) {
            throw new Error(`Transformation failed: ${error instanceof Error ? error.message : String(error)}`);
          }
        };
      } else {
        throw new Error(`Unsupported coordinate system conversion: ${from} -> ${to}`);
      }

      this.transformCache.set(key, transformer);
    }

    return this.transformCache.get(key)!;
  }

  private async transformFeature(
    feature: Feature,
    transformer: Function,
    from: CoordinateSystem,
    to: CoordinateSystem
  ): Promise<Feature> {
    // Check if feature is already transformed
    if (feature.properties?._transformedCoordinates) {
      return feature;
    }

    // Check feature cache
    const cacheKey = `${feature.id || JSON.stringify(feature)}-${from}-${to}`;
    if (this.featureCache.has(cacheKey)) {
      return this.featureCache.get(cacheKey)!;
    }

    // Deep clone the feature to avoid mutations
    const transformed = JSON.parse(JSON.stringify(feature));
    
    try {
      // Store original geometry before transformation
      transformed.properties = {
        ...transformed.properties,
        originalGeometry: transformed.geometry,
        originalSystem: from
      };

      // Transform coordinates based on geometry type
      switch (transformed.geometry.type) {
        case 'Point':
          transformed.geometry.coordinates = transformer(
            transformed.geometry.coordinates
          );
          break;
        case 'LineString':
        case 'MultiPoint':
          transformed.geometry.coordinates = transformed.geometry.coordinates.map(
            (coord: number[]) => transformer(coord)
          );
          break;
        case 'Polygon':
        case 'MultiLineString':
          transformed.geometry.coordinates = transformed.geometry.coordinates.map(
            (ring: number[][]) => ring.map((coord: number[]) => transformer(coord))
          );
          break;
        case 'MultiPolygon':
          transformed.geometry.coordinates = transformed.geometry.coordinates.map(
            (polygon: number[][][]) =>
              polygon.map((ring: number[][]) =>
                ring.map((coord: number[]) => transformer(coord))
              )
          );
          break;
        default:
          throw new Error(`Unsupported geometry type: ${transformed.geometry.type}`);
      }

      // Validate transformed coordinates
      const validateCoord = (coord: number[]): boolean =>
        Array.isArray(coord) && 
        coord.length >= 2 && 
        coord.every(n => Number.isFinite(n));

      const validateGeometry = (geom: any): boolean => {
        if (!geom || !geom.coordinates) return false;
        
        switch (geom.type) {
          case 'Point':
            return validateCoord(geom.coordinates);
          case 'LineString':
          case 'MultiPoint':
            return geom.coordinates.every(validateCoord);
          case 'Polygon':
          case 'MultiLineString':
            return geom.coordinates.every((ring: number[][]) => 
              ring.every(validateCoord));
          case 'MultiPolygon':
            return geom.coordinates.every((polygon: number[][][]) =>
              polygon.every((ring: number[][]) => 
                ring.every(validateCoord)));
          default:
            return false;
        }
      };

      if (!validateGeometry(transformed.geometry)) {
        throw new Error('Invalid transformed geometry');
      }

      // Mark as transformed and cache
      transformed.properties._transformedCoordinates = true;
      this.featureCache.set(cacheKey, transformed);

      return transformed;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[CoordinateSystemManager] Feature transformation failed:', errorMessage);
      throw error;
    }
  }

  private shouldClearCache(): boolean {
    const now = Date.now();
    return now - this.lastCacheClear > this.CACHE_LIFETIME;
  }

  /**
   * Force clear the cache regardless of timing
   */
  forceClearCache(): void {
    this.clearCache();
  }

  /**
   * Check if the manager has been initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initializationPromise) {
      await this.initializationPromise;
      return;
    }

    this.initializationPromise = this.initialize();
    await this.initializationPromise;
  }

  /**
   * Initialize the coordinate system manager
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Initialize proj4 with default WGS84 definition
      proj4.defs('WGS84', '+proj=longlat +datum=WGS84 +no_defs +type=crs');
      
      // Register Swiss projections
      Object.entries(SWISS_PROJECTIONS).forEach(([name, def]) => {
        proj4.defs(name, def);
      });

      // Only clear cache if needed
      if (this.shouldClearCache()) {
        this.clearCache();
      }
      
      this.initialized = true;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[CoordinateSystemManager] Initialization failed:', errorMessage);
      this.initialized = false;
      this.initializationPromise = null;
      throw new Error('Failed to initialize coordinate system manager');
    }
  }

  /**
   * Clear the transformer cache if needed
   */
  private clearCache(): void {
    this.transformCache.clear();
    this.featureCache.clear();
    this.lastCacheClear = Date.now();
  }
}

// Export the singleton instance
export const coordinateSystemManager = CoordinateSystemManager.getInstance();
