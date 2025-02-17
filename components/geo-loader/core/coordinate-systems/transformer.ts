import { Feature, Position } from 'geojson';
import { CoordinateSystem } from '../../types/coordinates';
import { LogManager } from '../logging/log-manager';
import proj4 from 'proj4';

interface Proj4Result {
  x: number;
  y: number;
  z?: number;
}

export interface TransformationKey {
  from: CoordinateSystem;
  to: CoordinateSystem;
}

export interface TransformationCache {
  transformer: {
    forward: (coords: Position) => Position | Proj4Result;
  };
  lastUsed: number;
}

export class CoordinateTransformer {
  private static instance: CoordinateTransformer;
  private readonly logger = LogManager.getInstance();
  private readonly cache = new Map<string, TransformationCache>();
  private readonly CACHE_LIFETIME = 30 * 60 * 1000; // 30 minutes
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
   * Validate coordinate system and detect if coordinates are already in target system
   */
  private validateCoordinateSystem(
    coordinates: Position | Position[],
    from: CoordinateSystem,
    to: CoordinateSystem
  ): { requiresTransform: boolean; actualFrom: CoordinateSystem } {
    // If systems are the same, no transform needed
    if (from === to) {
      return { requiresTransform: false, actualFrom: from };
    }

    // For Swiss coordinates (EPSG:2056), check if coordinates are already in that system
    if (to === 'EPSG:2056') {
      const coords = Array.isArray(coordinates) ? coordinates[0] : coordinates;
      // Ensure coords is a Position array
      if (Array.isArray(coords) && coords.length >= 2) {
        const [x, y] = coords;
        // Swiss coordinates are typically between 2000000-3000000 for x and 1000000-2000000 for y
        if (typeof x === 'number' && typeof y === 'number' &&
            x >= 2000000 && x <= 3000000 && y >= 1000000 && y <= 2000000) {
          this.logger.debug('CoordinateTransformer', 'Detected coordinates already in Swiss LV95', {
            coordinates: coords,
            assumedSystem: 'EPSG:2056'
          });
          return { requiresTransform: false, actualFrom: 'EPSG:2056' };
        }
      }
    }

    return { requiresTransform: true, actualFrom: from };
  }

  /**
   * Transform multiple positions in batch
   */
  public async transformPositions(
    positions: Position[],
    from: CoordinateSystem,
    to: CoordinateSystem
  ): Promise<Position[]> {
    try {
      const { requiresTransform, actualFrom } = this.validateCoordinateSystem(positions[0], from, to);
      if (!requiresTransform) return positions;
      
      const transformer = await this.getTransformer(actualFrom, to);
      return positions.map(pos => {
        const result = transformer.forward(pos);
        return Array.isArray(result) ? result : [result.x, result.y];
      });
    } catch (error) {
      this.logger.error('Error in batch position transformation:', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * Transform a single position
   */
  public async transformPosition(
    position: Position,
    from: CoordinateSystem,
    to: CoordinateSystem
  ): Promise<Position> {
    try {
      const { requiresTransform, actualFrom } = this.validateCoordinateSystem(position, from, to);
      if (!requiresTransform) return position;
      
      const transformer = await this.getTransformer(actualFrom, to);
      const result = transformer.forward(position);
      return Array.isArray(result) ? result : [result.x, result.y];
    } catch (error) {
      this.logger.error('Error transforming position:', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * Transform multiple features in batch
   */
  public async transformFeatures(
    features: Feature[],
    from: CoordinateSystem,
    to: CoordinateSystem
  ): Promise<Feature[]> {
    if (features.length === 0) return features;

    try {
      // Get first feature with coordinates for validation
      const firstFeatureWithCoords = features.find(f => 
        f.geometry && 'coordinates' in f.geometry && f.geometry.coordinates
      );

      if (!firstFeatureWithCoords) return features;

      const { requiresTransform, actualFrom } = this.validateCoordinateSystem(
        this.getFirstCoordinate(firstFeatureWithCoords),
        from,
        to
      );

      if (!requiresTransform) {
        this.logger.debug('CoordinateTransformer', 'No transformation needed', {
          from: actualFrom,
          to,
          sample: this.getFirstCoordinate(firstFeatureWithCoords)
        });
        return features;
      }

      const transformer = await this.getTransformer(actualFrom, to);
      return features.map(feature => this.transformFeatureSync(feature, transformer));
    } catch (error) {
      this.logger.error('Error transforming features:', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  private getFirstCoordinate(feature: Feature): Position {
    const geometry = feature.geometry as any;
    if (!geometry || !geometry.coordinates) return [0, 0];

    if (Array.isArray(geometry.coordinates[0])) {
      return geometry.coordinates[0];
    }
    return geometry.coordinates;
  }

  /**
   * Get a cached transformer for the given coordinate systems
   */
  private async getTransformer(
    from: CoordinateSystem,
    to: CoordinateSystem
  ): Promise<TransformationCache['transformer']> {
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
      // Create direct transformation pipeline
      const transformer = {
        forward: (coords: Position): Position | Proj4Result => {
          return proj4(from, to, coords);
        }
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
   * Transform a feature synchronously using a cached transformer
   */
  public transformFeatureSync(
    feature: Feature,
    transformer: TransformationCache['transformer']
  ): Feature {
    if (!feature.geometry) return feature;

    return {
      ...feature,
      geometry: this.transformGeometrySync(feature.geometry, transformer),
      properties: {
        ...feature.properties,
        _originalGeometry: feature.geometry,
        _transformedCoordinates: true
      }
    };
  }

  /**
   * Transform geometry synchronously using a cached transformer
   */
  private transformGeometrySync(
    geometry: any,
    transformer: TransformationCache['transformer']
  ): any {
    if (!geometry || !geometry.type) return geometry;

    const transformCoordinates = (coords: any): any => {
      if (Array.isArray(coords)) {
        if (typeof coords[0] === 'number') {
          const result = transformer.forward(coords);
          return Array.isArray(result) ? result : [result.x, result.y];
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