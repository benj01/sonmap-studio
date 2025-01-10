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
  [COORDINATE_SYSTEMS.SWISS_LV95]: '+proj=somerc +lat_0=46.95240555555556 +lon_0=7.439583333333333 +k_0=1 +x_0=2600000 +y_0=1200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs',
  [COORDINATE_SYSTEMS.SWISS_LV03]: '+proj=somerc +lat_0=46.95240555555556 +lon_0=7.439583333333333 +k_0=1 +x_0=600000 +y_0=200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs'
};

export class coordinateSystemManager {
  private static instance: coordinateSystemManager;
  private transformCache: Map<string, Function>;
  private initialized: boolean = false;

  private constructor() {
    this.transformCache = new Map();
  }

  static getInstance(): coordinateSystemManager {
    if (!coordinateSystemManager.instance) {
      coordinateSystemManager.instance = new coordinateSystemManager();
    }
    return coordinateSystemManager.instance;
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
    return features.map(feature => this.transformFeature(feature, transformer));
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

      // Check coordinate ranges against known systems
      if (
        ranges.minX >= 2485000 && ranges.maxX <= 2834000 &&
        ranges.minY >= 1075000 && ranges.maxY <= 1299000
      ) {
        return COORDINATE_SYSTEMS.SWISS_LV95;
      } else if (
        ranges.minX >= 485000 && ranges.maxX <= 834000 &&
        ranges.minY >= 75000 && ranges.maxY <= 299000
      ) {
        return COORDINATE_SYSTEMS.SWISS_LV03;
      } else if (
        ranges.minX >= -180 && ranges.maxX <= 180 &&
        ranges.minY >= -90 && ranges.maxY <= 90
      ) {
        return COORDINATE_SYSTEMS.WGS84;
      }

      return COORDINATE_SYSTEMS.WGS84; // Default to WGS84 if no match
    } catch (error) {
      console.error('Coordinate system detection failed:', error);
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
        transformer = (coord: number[]) => proj4(projection, 'WGS84', coord);
      } else if (isWGS84System(from) && isSwissSystem(to)) {
        const projection = SWISS_PROJECTIONS[to];
        transformer = (coord: number[]) => proj4('WGS84', projection, coord);
      } else {
        // Identity transform for unsupported conversions
        transformer = (coord: number[]) => coord;
      }

      this.transformCache.set(key, transformer);
    }

    return this.transformCache.get(key)!;
  }

  private transformFeature(
    feature: Feature,
    transformer: Function
  ): Feature {
    // Deep clone the feature to avoid mutations
    const transformed = JSON.parse(JSON.stringify(feature));
    
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

    return transformed;
  }

  /**
   * Clear the transformer cache
   */
  clearCache(): void {
    this.transformCache.clear();
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
      // Load any necessary configurations or setup
      // For now, just mark as initialized since we don't need special setup
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
