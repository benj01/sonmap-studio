import { Feature, Position } from 'geojson';
import { CoordinateSystem } from '../../types/coordinates';
import { LogManager } from '../logging/log-manager';
import proj4 from 'proj4';

export interface TransformationKey {
  from: CoordinateSystem;
  to: CoordinateSystem;
}

export interface TransformationCache {
  transformer: (coord: Position) => Position;
  lastUsed: number;
}

export class CoordinateTransformer {
  private static instance: CoordinateTransformer;
  private readonly logger = LogManager.getInstance();
  private readonly cache = new Map<string, TransformationCache>();
  private readonly CACHE_LIFETIME = 5 * 60 * 1000; // 5 minutes
  private lastCacheClear = Date.now();

  // Define projections for coordinate systems
  private readonly PROJECTIONS: Record<string, string> = {
    'EPSG:2056': '+proj=somerc +lat_0=46.95240555555556 +lon_0=7.439583333333333 +k_0=1 +x_0=2600000 +y_0=1200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs',
    'EPSG:21781': '+proj=somerc +lat_0=46.95240555555556 +lon_0=7.439583333333333 +k_0=1 +x_0=600000 +y_0=200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs',
    'EPSG:4326': '+proj=longlat +datum=WGS84 +no_defs',
    'EPSG:3857': '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +no_defs +over'
  };

  private constructor() {
    // Initialize proj4 with common projections
    Object.entries(this.PROJECTIONS).forEach(([name, def]) => {
      proj4.defs(name, def);
    });
  }

  public static getInstance(): CoordinateTransformer {
    if (!CoordinateTransformer.instance) {
      CoordinateTransformer.instance = new CoordinateTransformer();
    }
    return CoordinateTransformer.instance;
  }

  /**
   * Transform a single position from one coordinate system to another
   */
  public async transformPosition(
    position: Position,
    from: CoordinateSystem,
    to: CoordinateSystem
  ): Promise<Position> {
    try {
      if (from === to) return position;
      
      const transformer = await this.getTransformer(from, to);
      return transformer(position);
    } catch (error) {
      this.logger.error('Error transforming position:', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * Transform a feature from one coordinate system to another
   */
  public async transformFeature(
    feature: Feature,
    from: CoordinateSystem,
    to: CoordinateSystem
  ): Promise<Feature> {
    if (!feature.geometry) return feature;

    try {
      const transformer = await this.getTransformer(from, to);
      const transformedGeometry = await this.transformGeometry(feature.geometry, transformer);

      return {
        ...feature,
        geometry: transformedGeometry,
        properties: {
          ...feature.properties,
          _originalGeometry: feature.geometry,
          _transformedCoordinates: true,
          _fromSystem: from,
          _toSystem: to
        }
      };
    } catch (error) {
      this.logger.error('Error transforming feature:', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * Transform multiple features from one coordinate system to another
   */
  public async transformFeatures(
    features: Feature[],
    from: CoordinateSystem,
    to: CoordinateSystem
  ): Promise<Feature[]> {
    if (from === to) return features;

    try {
      const transformer = await this.getTransformer(from, to);
      return await Promise.all(
        features.map(feature => this.transformFeature(feature, from, to))
      );
    } catch (error) {
      this.logger.error('Error transforming features:', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * Get a transformer function for the given coordinate systems
   */
  private async getTransformer(
    from: CoordinateSystem,
    to: CoordinateSystem
  ): Promise<(coord: Position) => Position> {
    const key = this.getCacheKey(from, to);
    
    // Check cache
    if (this.shouldClearCache()) {
      this.clearCache();
    }

    const cached = this.cache.get(key);
    if (cached) {
      cached.lastUsed = Date.now();
      return cached.transformer;
    }

    // Create new transformer
    try {
      const transformer = (coord: Position): Position => {
        const result = proj4(from, to, coord) as Position | { x: number; y: number };
        return Array.isArray(result) ? result : [result.x, result.y];
      };

      // Cache the transformer
      this.cache.set(key, {
        transformer,
        lastUsed: Date.now()
      });

      return transformer;
    } catch (error) {
      this.logger.error('Error creating transformer:', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * Transform a geometry object using the provided transformer
   */
  private async transformGeometry(
    geometry: any,
    transformer: (coord: Position) => Position
  ): Promise<any> {
    if (!geometry || !geometry.type) return geometry;

    const transformCoordinates = (coords: any): any => {
      if (Array.isArray(coords)) {
        if (typeof coords[0] === 'number') {
          return transformer(coords as Position);
        }
        return coords.map(transformCoordinates);
      }
      return coords;
    };

    return {
      ...geometry,
      coordinates: transformCoordinates(geometry.coordinates)
    };
  }

  private getCacheKey(from: CoordinateSystem, to: CoordinateSystem): string {
    return `${from}:${to}`;
  }

  private shouldClearCache(): boolean {
    const now = Date.now();
    return now - this.lastCacheClear > this.CACHE_LIFETIME;
  }

  private clearCache(): void {
    this.cache.clear();
    this.lastCacheClear = Date.now();
  }

  public forceClearCache(): void {
    this.clearCache();
  }
} 