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
    x: { min: 2450000, max: 2850000 },
    y: { min: 1050000, max: 1350000 }
  },
  'EPSG:21781': { // Swiss LV03
    x: { min: 450000, max: 850000 },
    y: { min: 50000, max: 350000 }
  },
  'EPSG:4326': { // WGS84
    x: { min: -180, max: 180 },
    y: { min: -90, max: 90 }
  }
};
import proj4 from 'proj4';

// Define projections for Swiss coordinate systems
const SWISS_PROJECTIONS: Record<string, string> = {
  [COORDINATE_SYSTEMS.SWISS_LV95]: '+proj=somerc +lat_0=46.95240555555556 +lon_0=7.439583333333333 +k_0=1 +x_0=2600000 +y_0=1200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs',
  [COORDINATE_SYSTEMS.SWISS_LV03]: '+proj=somerc +lat_0=46.95240555555556 +lon_0=7.439583333333333 +k_0=1 +x_0=600000 +y_0=200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs'
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

    console.debug('[CoordinateSystemManager] Starting transformation:', {
      from,
      to,
      featureCount: features.length,
      sample: features[0] ? {
        type: features[0].geometry?.type,
        coordinates: features[0].geometry?.coordinates
      } : null
    });

    if (from === to) {
      console.debug('[CoordinateSystemManager] Source and target systems are the same, skipping transform');
      return features;
    }

    if (!await this.validateSystem(from) || !await this.validateSystem(to)) {
      console.error('[CoordinateSystemManager] Invalid coordinate systems:', { from, to });
      throw new Error(`Invalid coordinate systems: from=${from}, to=${to}`);
    }

    try {
      const transformedFeatures = await Promise.all(
        features.map(async feature => {
          try {
            const transformed = await this.transformFeatureCoordinates(feature, from, to);
            console.debug('[CoordinateSystemManager] Transformed feature:', {
              type: transformed.geometry?.type,
              sample: transformed.geometry?.coordinates ? 
                (Array.isArray(transformed.geometry.coordinates[0]) ? 
                  transformed.geometry.coordinates[0] : 
                  transformed.geometry.coordinates) : null
            });
            return transformed;
          } catch (error) {
            console.error('[CoordinateSystemManager] Error transforming feature:', {
              error: error instanceof Error ? error.message : String(error),
              feature: {
                type: feature.geometry?.type,
                coordinates: feature.geometry?.coordinates
              }
            });
            return feature; // Return original feature on error
          }
        })
      );

      console.debug('[CoordinateSystemManager] Transformation complete:', {
        inputCount: features.length,
        outputCount: transformedFeatures.length,
        sample: transformedFeatures[0] ? {
          type: transformedFeatures[0].geometry?.type,
          coordinates: transformedFeatures[0].geometry?.coordinates
        } : null
      });

      return transformedFeatures;
    } catch (error) {
      console.error('[CoordinateSystemManager] Transformation failed:', {
        error: error instanceof Error ? error.message : String(error),
        from,
        to
      });
      throw error;
    }
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
        ranges.minX >= 2450000 && ranges.maxX <= 2850000 &&
        ranges.minY >= 1050000 && ranges.maxY <= 1350000
      ) {
        console.debug('[CoordinateSystemManager] Detected Swiss LV95 coordinates');
        return COORDINATE_SYSTEMS.SWISS_LV95;
      } 
      // Swiss LV03 ranges (adjusted for better coverage)
      else if (
        ranges.minX >= 450000 && ranges.maxX <= 850000 &&
        ranges.minY >= 50000 && ranges.maxY <= 350000
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
            // Transform from Swiss to WGS84 (output will be [lon, lat])
            const [lon, lat] = proj4(projection, 'EPSG:4326', [x, y]);
            
            // Return [lon, lat] for WGS84
            if (!isFinite(lon) || !isFinite(lat)) {
              throw new Error(`Transformation produced non-finite coordinates: lon=${lon}, lat=${lat}`);
            }
            
            console.debug('[CoordinateSystemManager] Transformed Swiss->WGS84:', {
              input: [x, y],
              output: [lon, lat]
            });
            
            return [lon, lat];
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

          const [lon, lat] = coord;
          if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
            throw new Error(`Non-finite coordinates: lon=${lon}, lat=${lat}`);
          }

          try {
            // Transform from WGS84 to Swiss (input must be [lon, lat])
            const [x, y] = proj4('EPSG:4326', projection, [lon, lat]);
            
            if (!isFinite(x) || !isFinite(y)) {
              throw new Error(`Transformation produced non-finite coordinates: x=${x}, y=${y}`);
            }
            
            console.debug('[CoordinateSystemManager] Transformed WGS84->Swiss:', {
              input: [lon, lat],
              output: [x, y]
            });
            
            return [x, y];
          } catch (error: unknown) {
            throw new Error(`Transformation failed: ${error instanceof Error ? error.message : String(error)}`);
          }
        };
      } else {
        throw new Error(`Unsupported transformation: ${from} -> ${to}`);
      }

      this.transformCache.set(key, transformer);
    }

    return this.transformCache.get(key)!;
  }

  private async transformFeature(
    feature: Feature,
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

      // Transform the geometry coordinates
      const transformedGeometry = await this.transformCoords(transformed.geometry);

      // Create new feature with transformed geometry
      const transformedFeature: Feature = {
        ...feature,
        geometry: transformedGeometry,
        properties: {
          ...feature.properties,
          transformedCoordinates: true
        }
      };

      // Transform bbox if present
      if (feature.bbox) {
        console.debug('[CoordinateSystemManager] Transforming bbox:', {
          original: feature.bbox
        });

        const [minX, minY] = await this.transformCoordinates([feature.bbox[0], feature.bbox[1]], from, to);
        const [maxX, maxY] = await this.transformCoordinates([feature.bbox[2], feature.bbox[3]], from, to);

        transformedFeature.bbox = [minX, minY, maxX, maxY];

        console.debug('[CoordinateSystemManager] Transformed bbox:', {
          transformed: transformedFeature.bbox
        });
      }

      console.debug('[CoordinateSystemManager] Feature transformation complete:', {
        output: {
          type: transformedFeature.geometry?.type,
          coordinates: transformedFeature.geometry?.coordinates,
          bbox: transformedFeature.bbox
        }
      });

      return transformedFeature;
    } catch (error) {
      console.error('[CoordinateSystemManager] Feature transformation failed:', {
        error: error instanceof Error ? error.message : String(error),
        feature: {
          type: feature.geometry?.type,
          coordinates: feature.geometry?.coordinates
        }
      });
      throw error;
    }
  }

  /**
   * Transform coordinates from one system to another
   */
  async transformCoordinates(
    coordinates: number[],
    fromSystem: CoordinateSystem,
    toSystem: CoordinateSystem
  ): Promise<number[]> {
    await this.ensureInitialized();

    if (fromSystem === toSystem) {
      return coordinates;
    }

    try {
      const transformer = await this.getTransformer(fromSystem, toSystem);
      const transformed = transformer(coordinates);

      console.debug('[CoordinateSystemManager] Transformed coordinates:', {
        from: fromSystem,
        to: toSystem,
        original: coordinates,
        transformed
      });

      return transformed;
    } catch (error) {
      console.error('[CoordinateSystemManager] Coordinate transformation failed:', {
        error: error instanceof Error ? error.message : String(error),
        coordinates,
        fromSystem,
        toSystem
      });
      throw error;
    }
  }

  /**
   * Transform feature coordinates from one system to another
   */
  async transformFeatureCoordinates(
    feature: Feature,
    fromSystem: CoordinateSystem,
    toSystem: CoordinateSystem
  ): Promise<Feature> {
    try {
      if (!feature.geometry) {
        console.warn('[CoordinateSystemManager] Feature has no geometry:', feature);
        return feature;
      }

      // Deep clone to avoid mutations
      const transformedFeature = JSON.parse(JSON.stringify(feature));

      // Store original system
      transformedFeature.properties = {
        ...transformedFeature.properties,
        _originalSystem: fromSystem,
        _transformedCoordinates: true
      };

      const transformCoordArray = async (coords: any[]): Promise<any[]> => {
        if (!Array.isArray(coords)) return coords;

        // Handle nested coordinate arrays
        if (Array.isArray(coords[0])) {
          return Promise.all(coords.map(c => transformCoordArray(c)));
        }

        // Transform coordinate pair
        if (coords.length >= 2) {
          return this.transformCoordinates(coords, fromSystem, toSystem);
        }

        return coords;
      };

      // Transform geometry coordinates
      transformedFeature.geometry.coordinates = await transformCoordArray(
        transformedFeature.geometry.coordinates
      );

      // Transform bbox if present
      if (feature.bbox) {
        const [minX, minY] = await this.transformCoordinates(
          [feature.bbox[0], feature.bbox[1]], 
          fromSystem, 
          toSystem
        );
        const [maxX, maxY] = await this.transformCoordinates(
          [feature.bbox[2], feature.bbox[3]], 
          fromSystem, 
          toSystem
        );
        transformedFeature.bbox = [minX, minY, maxX, maxY];
      }

      return transformedFeature;
    } catch (error) {
      console.error('[CoordinateSystemManager] Feature transformation failed:', {
        error: error instanceof Error ? error.message : String(error),
        feature: {
          type: feature.geometry?.type,
          coordinates: feature.geometry?.coordinates
        },
        fromSystem,
        toSystem
      });
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
    if (this.initialized) return;

    try {
      // Register the Swiss projections
      proj4.defs(COORDINATE_SYSTEMS.SWISS_LV95, SWISS_PROJECTIONS[COORDINATE_SYSTEMS.SWISS_LV95]);
      proj4.defs(COORDINATE_SYSTEMS.SWISS_LV03, SWISS_PROJECTIONS[COORDINATE_SYSTEMS.SWISS_LV03]);
      proj4.defs(COORDINATE_SYSTEMS.WGS84, '+proj=longlat +datum=WGS84 +no_defs');

      console.debug('[CoordinateSystemManager] Initialized with projections:', {
        [COORDINATE_SYSTEMS.SWISS_LV95]: SWISS_PROJECTIONS[COORDINATE_SYSTEMS.SWISS_LV95],
        [COORDINATE_SYSTEMS.SWISS_LV03]: SWISS_PROJECTIONS[COORDINATE_SYSTEMS.SWISS_LV03],
        [COORDINATE_SYSTEMS.WGS84]: '+proj=longlat +datum=WGS84 +no_defs'
      });

      this.initialized = true;
    } catch (error) {
      console.error('[CoordinateSystemManager] Initialization failed:', error);
      throw error;
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
