import { Feature } from 'geojson';
import { 
  COORDINATE_SYSTEMS, 
  CoordinateSystem,
  isSwissSystem,
  isWGS84System 
} from '../../types/coordinates';
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
   * Transform features from one coordinate system to another
   */
  async transform(
    features: Feature[],
    from: CoordinateSystem,
    to: CoordinateSystem
  ): Promise<Feature[]> {
    if (from === to) {
      return features;
    }

    const transformer = await this.getTransformer(from, to);
    return Promise.all(features.map(feature => this.transformFeature(feature, transformer, from, to)));
  }

  /**
   * Validate a coordinate system
   */
  async validate(system: string): Promise<boolean> {
    try {
      return isSwissSystem(system as CoordinateSystem) || 
             isWGS84System(system as CoordinateSystem);
    } catch (error) {
      console.error('Coordinate system validation failed:', error);
      return false;
    }
  }

  /**
   * Attempt to detect the coordinate system of features based on coordinate ranges
   */
  async detect(features: Feature[]): Promise<CoordinateSystem | undefined> {
    try {
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
        ranges.minY >= 1000000 && ranges.maxY <= 1400000
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

      // If coordinates are within Switzerland's general bounds, default to LV95
      if (
        ranges.minX >= 2500000 && ranges.maxX <= 2800000 &&
        ranges.minY >= 1100000 && ranges.maxY <= 1300000
      ) {
        console.debug('[CoordinateSystemManager] Coordinates within Switzerland, defaulting to LV95');
        return COORDINATE_SYSTEMS.SWISS_LV95;
      }

      console.debug('[CoordinateSystemManager] Could not definitively detect coordinate system, defaulting to LV95 for Swiss region');
      return COORDINATE_SYSTEMS.SWISS_LV95;
    } catch (error) {
      console.error('Coordinate system detection failed:', error);
      return COORDINATE_SYSTEMS.SWISS_LV95;
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
            console.warn('[CoordinateSystemManager] Invalid coordinate array:', coord);
            return coord;
          }

          const [x, y] = coord;
          if (!Number.isFinite(x) || !Number.isFinite(y)) {
            console.warn('[CoordinateSystemManager] Non-finite coordinates:', { x, y });
            return coord;
          }

          try {
            const result = proj4(projection, 'WGS84', coord);
            if (!result.every(isFinite)) {
              console.warn('[CoordinateSystemManager] Transformation produced non-finite coordinates:', result);
              return coord;
            }
            return result;
          } catch (error) {
            console.warn('[CoordinateSystemManager] Transformation failed:', error);
            return coord;
          }
        };
      } else if (isWGS84System(from) && isSwissSystem(to)) {
        const projection = SWISS_PROJECTIONS[to];
        transformer = (coord: number[]) => {
          if (!Array.isArray(coord) || coord.length < 2) {
            console.warn('[CoordinateSystemManager] Invalid coordinate array:', coord);
            return coord;
          }

          const [x, y] = coord;
          if (!Number.isFinite(x) || !Number.isFinite(y)) {
            console.warn('[CoordinateSystemManager] Non-finite coordinates:', { x, y });
            return coord;
          }

          try {
            const result = proj4('WGS84', projection, coord);
            if (!result.every(isFinite)) {
              console.warn('[CoordinateSystemManager] Transformation produced non-finite coordinates:', result);
              return coord;
            }
            return result;
          } catch (error) {
            console.warn('[CoordinateSystemManager] Transformation failed:', error);
            return coord;
          }
        };
      } else {
        // Identity transform for unsupported conversions
        transformer = (coord: number[]) => coord;
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
        console.warn('[CoordinateSystemManager] Invalid transformed geometry:', {
          type: transformed.geometry.type,
          coordinates: transformed.geometry.coordinates
        });
        return feature; // Return original feature if transformation produced invalid coordinates
      }

      // Mark as transformed and cache
      transformed.properties._transformedCoordinates = true;
      this.featureCache.set(cacheKey, transformed);

      return transformed;
    } catch (error) {
      console.warn('[CoordinateSystemManager] Error transforming feature:', error);
      return feature; // Return original feature on error
    }
  }

  /**
   * Clear the transformer cache
   */
  clearCache(): void {
    this.transformCache.clear();
    this.featureCache.clear();
  }

  /**
   * Check if the manager has been initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Initialize the coordinate system manager
   */
  async initialize(): Promise<void> {
    if (!this.initialized) {
      // Clear any existing cache
      this.clearCache();
      
      // Initialize proj4 with default WGS84 definition
      proj4.defs('WGS84', '+proj=longlat +datum=WGS84 +no_defs +type=crs');
      
      // Register Swiss projections
      Object.entries(SWISS_PROJECTIONS).forEach(([name, def]) => {
        proj4.defs(name, def);
      });
      
      this.initialized = true;
    }
  }

  /**
   * Validate a coordinate system
   */
  async validateSystem(system: CoordinateSystem): Promise<boolean> {
    return this.validate(system);
  }
}

// Export the singleton instance
export const coordinateSystemManager = CoordinateSystemManager.getInstance();
