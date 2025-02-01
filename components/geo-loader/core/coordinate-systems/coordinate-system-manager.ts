import { Feature, Geometry, GeometryCollection, Point, LineString, Polygon, MultiPoint, MultiLineString, MultiPolygon, Position, GeoJsonProperties } from 'geojson';
import { 
  COORDINATE_SYSTEMS, 
  CoordinateSystem,
  isSwissSystem,
  isWGS84System,
  Coordinate,
  Ring
} from '../../types/coordinates';
import {
  GeoJSONGeometry,
  GeoJSONFeature,
  GeoJSONFeatureCollection,
  isPoint,
  isLineString,
  isPolygon,
  isMultiPoint,
  isMultiLineString,
  isMultiPolygon,
  isGeometryCollection,
  isGeometryWithCoordinates
} from '../../types/geojson';
import proj4 from 'proj4';
import { LogManager } from '../logging/log-manager';

export type CoordinateSystemBounds = {
  x: { min: number; max: number };
  y: { min: number; max: number };
};

export type CoordinateSystemId = 'EPSG:2056' | 'EPSG:21781' | 'EPSG:4326' | 'EPSG:3857';

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
  },
  'EPSG:3857': { // Web Mercator
    x: { min: -20026376.39, max: 20026376.39 },
    y: { min: -20048966.10, max: 20048966.10 }
  }
};

// Define projections for coordinate systems
const PROJECTIONS: Record<string, string> = {
  [COORDINATE_SYSTEMS.SWISS_LV95]: '+proj=somerc +lat_0=46.95240555555556 +lon_0=7.439583333333333 +k_0=1 +x_0=2600000 +y_0=1200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs',
  [COORDINATE_SYSTEMS.SWISS_LV03]: '+proj=somerc +lat_0=46.95240555555556 +lon_0=7.439583333333333 +k_0=1 +x_0=600000 +y_0=200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs',
  [COORDINATE_SYSTEMS.WGS84]: '+proj=longlat +datum=WGS84 +no_defs',
  [COORDINATE_SYSTEMS.WEB_MERCATOR]: '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +no_defs +over'
};

type CoordinateArray = Position | Position[] | Position[][] | Position[][][];

function getGeometryCoordinates(geometry: GeoJSONGeometry | undefined): CoordinateArray | undefined {
  if (!geometry) return undefined;
  
  if (isGeometryWithCoordinates(geometry)) {
    return geometry.coordinates;
  }
  
  return undefined;
}

/**
 * Validates if a coordinate array contains only finite numbers
 */
function validateCoordinates(coord: Position): boolean {
  if (!Array.isArray(coord) || coord.length < 2) {
    return false;
  }
  return coord.every(value => Number.isFinite(value));
}

interface BoundsObject {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface LegacyBoundsObject {
  min_x?: number;
  max_x?: number;
  min_y?: number;
  max_y?: number;
  x_min?: number;
  x_max?: number;
  y_min?: number;
  y_max?: number;
}

type AnyBoundsObject = BoundsObject | LegacyBoundsObject;

/**
 * Converts bounds from object format to array format
 */
function convertBoundsToArray(bounds: BoundsObject | [number, number, number, number]): [number, number, number, number] {
  if (Array.isArray(bounds)) {
    return bounds;
  }
  
  // Handle object format
  if ('minX' in bounds && 'minY' in bounds && 'maxX' in bounds && 'maxY' in bounds) {
    return [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY];
  }

  throw new Error('Invalid bounds format: must be either an array [minX, minY, maxX, maxY] or an object {minX, minY, maxX, maxY}');
}

/**
 * Validates if bounds are in the correct format and contain valid values
 */
function validateBoundsFormat(bounds: any): bounds is [number, number, number, number] | BoundsObject {
  console.debug('[CoordinateSystemManager] Validating bounds format:', {
    boundsType: typeof bounds,
    isArray: Array.isArray(bounds),
    value: bounds,
    keys: bounds && typeof bounds === 'object' ? Object.keys(bounds) : undefined,
    prototype: bounds ? Object.getPrototypeOf(bounds) : undefined
  });

  // Check array format
  if (Array.isArray(bounds)) {
    if (bounds.length !== 4) {
      console.warn('[CoordinateSystemManager] Bounds array must have exactly 4 values:', {
        receivedLength: bounds.length,
        value: bounds
      });
      return false;
    }

    if (!bounds.every(value => typeof value === 'number')) {
      console.warn('[CoordinateSystemManager] All bounds values must be numbers:', {
        values: bounds,
        types: bounds.map(v => typeof v)
      });
      return false;
    }

    return true;
  }

  // Check object format
  if (typeof bounds === 'object' && bounds !== null) {
    // Log all possible property names we might find
    console.debug('[CoordinateSystemManager] Checking object bounds properties:', {
      hasMinX: 'minX' in bounds,
      hasMinY: 'minY' in bounds,
      hasMaxX: 'maxX' in bounds,
      hasMaxY: 'maxY' in bounds,
      hasMin_x: 'min_x' in bounds,
      hasMin_y: 'min_y' in bounds,
      hasMax_x: 'max_x' in bounds,
      hasMax_y: 'max_y' in bounds,
      hasX_min: 'x_min' in bounds,
      hasX_max: 'x_max' in bounds,
      hasY_min: 'y_min' in bounds,
      hasY_max: 'y_max' in bounds,
      allKeys: Object.keys(bounds)
    });

    const hasRequiredProps = 'minX' in bounds && 'minY' in bounds && 'maxX' in bounds && 'maxY' in bounds;
    if (!hasRequiredProps) {
      console.warn('[CoordinateSystemManager] Bounds object must have minX, minY, maxX, maxY properties:', {
        receivedProps: Object.keys(bounds),
        value: bounds,
        propertyDescriptors: Object.getOwnPropertyDescriptors(bounds)
      });
      return false;
    }

    const allNumbers = ['minX', 'minY', 'maxX', 'maxY'].every(prop => {
      const value = bounds[prop];
      const isNumber = typeof value === 'number';
      if (!isNumber) {
        console.warn(`[CoordinateSystemManager] Property ${prop} is not a number:`, {
          value,
          type: typeof value
        });
      }
      return isNumber;
    });

    if (!allNumbers) {
      console.warn('[CoordinateSystemManager] All bounds values must be numbers:', {
        values: bounds,
        types: {
          minX: typeof bounds.minX,
          minY: typeof bounds.minY,
          maxX: typeof bounds.maxX,
          maxY: typeof bounds.maxY
        }
      });
      return false;
    }

    return true;
  }

  console.warn('[CoordinateSystemManager] Invalid bounds format:', {
    receivedType: typeof bounds,
    value: bounds,
    stack: new Error().stack
  });
  return false;
}

/**
 * Validates if bounds are within valid ranges for a coordinate system
 */
function validateBounds(bounds: [number, number, number, number], system: CoordinateSystem): boolean {
  // First log the incoming bounds for debugging
  console.debug('[CoordinateSystemManager] Validating bounds:', {
    bounds,
    system,
    systemBounds: COORDINATE_SYSTEM_BOUNDS[system as CoordinateSystemId]
  });

  const systemBounds = COORDINATE_SYSTEM_BOUNDS[system as CoordinateSystemId];
  if (!systemBounds) {
    console.warn('[CoordinateSystemManager] No bounds defined for system:', system);
    return true; // Allow bounds if system bounds are not defined
  }

  const [minX, minY, maxX, maxY] = bounds;
  
  // Check for finite numbers
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || 
      !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    console.warn('[CoordinateSystemManager] Bounds contain non-finite numbers:', {
      minX, minY, maxX, maxY
    });
    return false;
  }

  // For Swiss coordinate systems, be more lenient with bounds validation
  if (system === COORDINATE_SYSTEMS.SWISS_LV95) {
    // Check if bounds are roughly within Switzerland
    const isRoughlyValid = (
      minX >= 2000000 && maxX <= 3000000 &&
      minY >= 1000000 && maxY <= 1400000
    );

    if (!isRoughlyValid) {
      console.warn('[CoordinateSystemManager] Swiss LV95 bounds significantly out of range:', {
        bounds: { minX, minY, maxX, maxY },
        allowedRanges: {
          x: { min: 2000000, max: 3000000 },
          y: { min: 1000000, max: 1400000 }
        }
      });
    }

    return isRoughlyValid;
  }

  // For other systems, use strict bounds checking
  const isValid = (
    minX >= systemBounds.x.min && maxX <= systemBounds.x.max &&
    minY >= systemBounds.y.min && maxY <= systemBounds.y.max
  );

  if (!isValid) {
    console.warn('[CoordinateSystemManager] Bounds out of range for system:', {
      bounds: { minX, minY, maxX, maxY },
      allowedRanges: {
        x: systemBounds.x,
        y: systemBounds.y
      },
      system
    });
  }

  return isValid;
}

export class CoordinateSystemManager {
  private static instance: CoordinateSystemManager;
  private initialized = false;
  private initializationPromise: Promise<void> | null = null;
  private readonly CACHE_LIFETIME = 5 * 60 * 1000; // 5 minutes
  private lastCacheClear = Date.now();
  private transformCache = new Map<string, (coord: Position) => Position>();
  private featureCache = new Map<string, GeoJSONFeature>();
  private readonly logger = LogManager.getInstance();

  private constructor() {
    // Private constructor to enforce singleton
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
           isWGS84System(system as CoordinateSystem) ||
           system === COORDINATE_SYSTEMS.WEB_MERCATOR;
  }

  /**
   * Validate a coordinate system with initialization
   */
  async validate(system: string): Promise<boolean> {
    try {
      await this.ensureInitialized();
      const isValid = this.validateSystemSync(system);
      console.debug('[CoordinateSystemManager] System validation:', {
        system,
        isValid,
        projectionDefined: system in PROJECTIONS
      });
      return isValid;
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
    features: GeoJSONFeature[],
    from: CoordinateSystem,
    to: CoordinateSystem
  ): Promise<GeoJSONFeature[]> {
    await this.ensureInitialized();

    console.debug('[CoordinateSystemManager] Starting transformation:', {
      from,
      to,
      featureCount: features.length,
      sample: features[0] ? {
        type: features[0].geometry?.type,
        coordinates: isGeometryWithCoordinates(features[0].geometry) ? features[0].geometry.coordinates : undefined
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
            const transformed = await this.transformFeature(feature, from, to);
            console.debug('[CoordinateSystemManager] Transformed feature:', {
              type: transformed.geometry?.type,
              sample: isGeometryWithCoordinates(transformed.geometry) ? 
                (Array.isArray(transformed.geometry.coordinates[0]) ? 
                  transformed.geometry.coordinates[0] : 
                  transformed.geometry.coordinates) : undefined
            });
            return transformed;
          } catch (error) {
            console.error('[CoordinateSystemManager] Error transforming feature:', {
              error: error instanceof Error ? error.message : String(error),
              feature: {
                type: feature.geometry?.type,
                coordinates: isGeometryWithCoordinates(feature.geometry) ? feature.geometry.coordinates : undefined
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
          coordinates: isGeometryWithCoordinates(transformedFeatures[0].geometry) ? 
            transformedFeatures[0].geometry.coordinates : undefined
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
      // Web Mercator ranges
      else if (
        ranges.minX >= -20026376.39 && ranges.maxX <= 20026376.39 &&
        ranges.minY >= -20048966.10 && ranges.maxY <= 20048966.10
      ) {
        console.debug('[CoordinateSystemManager] Detected Web Mercator coordinates');
        return COORDINATE_SYSTEMS.WEB_MERCATOR;
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
  ): Promise<(coord: Position) => Position> {
    await this.ensureInitialized();

    const cacheKey = `${from}-${to}`;

    // Clear cache if it contains invalid entries
    if (this.transformCache.has(cacheKey)) {
      const cachedTransformer = this.transformCache.get(cacheKey)!;
      try {
        // Test the transformer with a known good coordinate
        const testCoord: Position = from === COORDINATE_SYSTEMS.SWISS_LV95 ? 
          [2600000, 1200000] : // Center of Switzerland in LV95
          [7.4395, 46.9479];   // Center of Switzerland in WGS84
        
        const result = cachedTransformer(testCoord);
        if (!validateCoordinates(result)) {
          console.warn('[CoordinateSystemManager] Cached transformer produced invalid coordinates, clearing cache');
          this.transformCache.delete(cacheKey);
        }
      } catch (error) {
        console.warn('[CoordinateSystemManager] Cached transformer failed validation, clearing cache:', {
          error: error instanceof Error ? error.message : String(error)
        });
        this.transformCache.delete(cacheKey);
      }
    }

    if (this.transformCache.has(cacheKey)) {
      return this.transformCache.get(cacheKey)!;
    }

    try {
      let transformer: (coord: Position) => Position;

      if (from === to) {
        transformer = coord => {
          if (!validateCoordinates(coord)) {
            throw new Error(`Invalid coordinates: ${JSON.stringify(coord)}`);
          }
          return coord;
        };
      } else if ((to === COORDINATE_SYSTEMS.SWISS_LV95 || to === COORDINATE_SYSTEMS.SWISS_LV03)) {
        transformer = (coord: Position) => {
          if (!validateCoordinates(coord)) {
            throw new Error(`Invalid coordinates: ${JSON.stringify(coord)}`);
          }

          try {
            // Step 1: Source -> WGS84 (if not already WGS84)
            let wgs84 = coord;
            if (from !== COORDINATE_SYSTEMS.WGS84) {
              wgs84 = proj4(PROJECTIONS[from], PROJECTIONS[COORDINATE_SYSTEMS.WGS84], coord);
              // Normalize longitude to [-180, 180]
              wgs84[0] = ((wgs84[0] + 180) % 360) - 180;
            }
            
            // Validate intermediate WGS84 coordinates
            if (!validateCoordinates(wgs84) || 
                wgs84[0] < -180 || wgs84[0] > 180 || 
                wgs84[1] < -90 || wgs84[1] > 90) {
              throw new Error(`Invalid WGS84 coordinates: ${JSON.stringify(wgs84)}`);
            }
            
            // Step 2: WGS84 -> Swiss
            const swiss = proj4(PROJECTIONS[COORDINATE_SYSTEMS.WGS84], PROJECTIONS[to], wgs84);

            if (!validateCoordinates(swiss)) {
              throw new Error('Transformation produced invalid coordinates');
            }

            // Validate Swiss coordinates are in reasonable range
            if (to === COORDINATE_SYSTEMS.SWISS_LV95) {
              if (swiss[0] < 2000000 || swiss[0] > 3000000 ||
                  swiss[1] < 1000000 || swiss[1] > 1400000) {
                throw new Error(`Swiss LV95 coordinates out of range: ${JSON.stringify(swiss)}`);
              }
            }

            console.debug('[CoordinateSystemManager] Multi-step transformation:', {
              from: coord,
              wgs84,
              to: swiss,
              isValid: validateCoordinates(swiss)
            });

            return swiss;
          } catch (error) {
            console.error('[CoordinateSystemManager] Transformation failed:', error);
            throw error;
          }
        };
      } else {
        // For direct transformations between other systems
        transformer = (coord: Position) => {
          if (!validateCoordinates(coord)) {
            throw new Error(`Invalid coordinates: ${JSON.stringify(coord)}`);
          }

          try {
            const result = proj4(PROJECTIONS[from], PROJECTIONS[to], coord);
            
            if (!validateCoordinates(result)) {
              throw new Error('Transformation produced invalid coordinates');
            }

            console.debug('[CoordinateSystemManager] Direct transformation:', {
              from: coord,
              to: result,
              isValid: validateCoordinates(result)
            });

            return result;
          } catch (error) {
            console.error('[CoordinateSystemManager] Transformation failed:', error);
            throw error;
          }
        };
      }

      // Validate transformer with test coordinates before caching
      try {
        const testCoord: Position = from === COORDINATE_SYSTEMS.SWISS_LV95 ? 
          [2600000, 1200000] : // Center of Switzerland in LV95
          [7.4395, 46.9479];   // Center of Switzerland in WGS84
        
        const result = transformer(testCoord);
        if (!validateCoordinates(result)) {
          throw new Error('Transformer validation failed: produced invalid coordinates');
        }
      } catch (error) {
        console.error('[CoordinateSystemManager] Transformer validation failed:', error);
        throw error;
      }

      this.transformCache.set(cacheKey, transformer);
      return transformer;
    } catch (error) {
      console.error('[CoordinateSystemManager] Failed to create transformer:', error);
      throw error;
    }
  }

  private async transformGeometry(
    geometry: GeoJSONGeometry,
    from: CoordinateSystem,
    to: CoordinateSystem
  ): Promise<GeoJSONGeometry> {
    const transformer = await this.getTransformer(from, to);
    const transformPosition = (pos: Position): Position => {
      if (!validateCoordinates(pos)) {
        console.warn('[CoordinateSystemManager] Invalid coordinates detected:', {
          coordinates: pos,
          from,
          to
        });
        throw new Error(`Invalid coordinates: ${JSON.stringify(pos)}`);
      }

      const transformed = transformer(pos) as Position;
      
      if (!validateCoordinates(transformed)) {
        console.error('[CoordinateSystemManager] Transformation produced invalid coordinates:', {
          input: pos,
          output: transformed,
          from,
          to
        });
        throw new Error('Transformation produced invalid coordinates');
      }

      return transformed;
    };

    try {
      if (isPoint(geometry)) {
        return {
          type: 'Point',
          coordinates: transformPosition(geometry.coordinates)
        };
      }
      
      if (isLineString(geometry) || isMultiPoint(geometry)) {
        return {
          type: geometry.type,
          coordinates: geometry.coordinates.map((coord, index) => {
            try {
              return transformPosition(coord);
            } catch (error) {
              console.warn(`[CoordinateSystemManager] Failed to transform coordinate at index ${index}:`, {
                error: error instanceof Error ? error.message : String(error),
                coordinate: coord
              });
              throw error;
            }
          })
        };
      }
      
      if (isPolygon(geometry) || isMultiLineString(geometry)) {
        return {
          type: geometry.type,
          coordinates: geometry.coordinates.map((line, lineIndex) => 
            line.map((coord, coordIndex) => {
              try {
                return transformPosition(coord);
              } catch (error) {
                console.warn(`[CoordinateSystemManager] Failed to transform coordinate at line ${lineIndex}, position ${coordIndex}:`, {
                  error: error instanceof Error ? error.message : String(error),
                  coordinate: coord
                });
                throw error;
              }
            })
          )
        };
      }
      
      if (isMultiPolygon(geometry)) {
        return {
          type: 'MultiPolygon',
          coordinates: geometry.coordinates.map((polygon, polygonIndex) =>
            polygon.map((line, lineIndex) => 
              line.map((coord, coordIndex) => {
                try {
                  return transformPosition(coord);
                } catch (error) {
                  console.warn(`[CoordinateSystemManager] Failed to transform coordinate at polygon ${polygonIndex}, line ${lineIndex}, position ${coordIndex}:`, {
                    error: error instanceof Error ? error.message : String(error),
                    coordinate: coord
                  });
                  throw error;
                }
              })
            )
          )
        };
      }
      
      if (isGeometryCollection(geometry)) {
        return {
          type: 'GeometryCollection',
          geometries: await Promise.all(
            geometry.geometries.map(async (geom, index) => {
              try {
                return await this.transformGeometry(geom, from, to);
              } catch (error) {
                console.warn(`[CoordinateSystemManager] Failed to transform geometry at index ${index}:`, {
                  error: error instanceof Error ? error.message : String(error),
                  geometryType: geom.type
                });
                throw error;
              }
            })
          )
        };
      }

      const _exhaustiveCheck: never = geometry;
      throw new Error(`Unsupported geometry type: ${(geometry as any).type}`);
    } catch (error) {
      console.error('[CoordinateSystemManager] Geometry transformation failed:', {
        error: error instanceof Error ? error.message : String(error),
        geometryType: geometry.type,
        from,
        to
      });
      throw error;
    }
  }

  public async transformFeature(
    feature: GeoJSONFeature,
    from: CoordinateSystem,
    to: CoordinateSystem
  ): Promise<GeoJSONFeature> {
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
    const transformed = JSON.parse(JSON.stringify(feature)) as GeoJSONFeature;
    
    try {
      // Store original geometry before transformation
      transformed.properties = {
        ...transformed.properties,
        _originalGeometry: transformed.geometry,
        _transformedCoordinates: true,
        _fromSystem: from,
        _toSystem: to
      };

      // Transform the geometry
      transformed.geometry = await this.transformGeometry(transformed.geometry, from, to);

      // Cache the transformed feature
      this.featureCache.set(cacheKey, transformed);
      return transformed;
    } catch (error) {
      console.error('[CoordinateSystemManager] Feature transformation failed:', error);
      throw error;
    }
  }

  /**
   * Transform coordinates from one system to another
   */
  async transformCoordinates(
    coordinates: Position,
    fromSystem: CoordinateSystem,
    toSystem: CoordinateSystem
  ): Promise<Position> {
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
  private async transformFeatureCoordinates(
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
      const transformedFeature = JSON.parse(JSON.stringify(feature)) as Feature;

      // Store original system
      transformedFeature.properties = {
        ...transformedFeature.properties,
        _originalSystem: fromSystem,
        _transformedCoordinates: true
      };

      const transformCoordArray = async (coords: CoordinateArray): Promise<CoordinateArray> => {
        if (!Array.isArray(coords)) return coords;

        // Handle nested coordinate arrays
        if (Array.isArray(coords[0])) {
          const transformed = await Promise.all(coords.map(c => transformCoordArray(c as CoordinateArray)));
          return transformed as CoordinateArray;
        }

        // Transform coordinate pair if it looks like a Position
        if (coords.length >= 2 && coords.every(c => typeof c === 'number')) {
          const transformer = await this.getTransformer(fromSystem, toSystem);
          return transformer(coords as Position);
        }

        return coords;
      };

      // Transform geometry coordinates based on type
      if (isGeometryWithCoordinates(transformedFeature.geometry)) {
        const coords = getGeometryCoordinates(transformedFeature.geometry);
        if (coords) {
          const transformed = await transformCoordArray(coords);
          const geometry = transformedFeature.geometry;
          
          if (isPoint(geometry)) {
            geometry.coordinates = transformed as Position;
          } else if (isLineString(geometry) || isMultiPoint(geometry)) {
            geometry.coordinates = transformed as Position[];
          } else if (isPolygon(geometry) || isMultiLineString(geometry)) {
            geometry.coordinates = transformed as Position[][];
          } else if (isMultiPolygon(geometry)) {
            geometry.coordinates = transformed as Position[][][];
          }
        }
      } else {
        // Handle GeometryCollection
        const collection = transformedFeature.geometry as GeometryCollection;
        const transformedGeometries = await Promise.all(
          collection.geometries.map(async (geom) => {
            if (isGeometryWithCoordinates(geom)) {
              const coords = getGeometryCoordinates(geom);
              if (coords) {
                const transformed = await transformCoordArray(coords);
                if (isPoint(geom)) {
                  return { ...geom, coordinates: transformed as Position };
                } else if (isLineString(geom) || isMultiPoint(geom)) {
                  return { ...geom, coordinates: transformed as Position[] };
                } else if (isPolygon(geom) || isMultiLineString(geom)) {
                  return { ...geom, coordinates: transformed as Position[][] };
                } else if (isMultiPolygon(geom)) {
                  return { ...geom, coordinates: transformed as Position[][][] };
                }
              }
            }
            return geom;
          })
        );
        collection.geometries = transformedGeometries;
      }

      // Transform bbox if present
      if (feature.bbox) {
        const [minX, minY] = await this.transformCoordinates(
          [feature.bbox[0], feature.bbox[1]] as Position, 
          fromSystem, 
          toSystem
        );
        const [maxX, maxY] = await this.transformCoordinates(
          [feature.bbox[2], feature.bbox[3]] as Position, 
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
          coordinates: getGeometryCoordinates(feature.geometry)
        },
        fromSystem,
        toSystem
      });
      throw error;
    }
  }

  /**
   * Transform bounds from one system to another
   */
  public async transformBounds(
    bounds: BoundsObject | [number, number, number, number],
    from: CoordinateSystem,
    to: CoordinateSystem
  ): Promise<[number, number, number, number]> {
    this.logger.debug('CoordinateSystemManager', 'Transforming bounds', {
      bounds,
      from,
      to
    });

    // Skip transformation if systems are the same
    if (from === to) {
      const result = convertBoundsToArray(bounds);
      console.debug('[CoordinateSystemManager] Same system, returning converted bounds:', {
        input: bounds,
        output: result
      });
      return result;
    }

    // Validate bounds format first
    if (!validateBoundsFormat(bounds)) {
      console.error('[CoordinateSystemManager] Invalid bounds format:', {
        received: bounds,
        expectedFormat: '[minX, minY, maxX, maxY] or {minX, minY, maxX, maxY}',
        stack: new Error().stack
      });
      
      // Try to recover from invalid format
      if (typeof bounds === 'object' && bounds !== null) {
        const b = bounds as AnyBoundsObject;
        console.debug('[CoordinateSystemManager] Attempting to recover bounds:', {
          original: bounds,
          asAnyBounds: b,
          availableProps: Object.keys(b)
        });

        const recovered = {
          minX: (b as BoundsObject).minX ?? (b as LegacyBoundsObject).min_x ?? (b as LegacyBoundsObject).x_min,
          minY: (b as BoundsObject).minY ?? (b as LegacyBoundsObject).min_y ?? (b as LegacyBoundsObject).y_min,
          maxX: (b as BoundsObject).maxX ?? (b as LegacyBoundsObject).max_x ?? (b as LegacyBoundsObject).x_max,
          maxY: (b as BoundsObject).maxY ?? (b as LegacyBoundsObject).max_y ?? (b as LegacyBoundsObject).y_max
        };

        console.debug('[CoordinateSystemManager] Recovered values:', {
          recovered,
          allValid: Object.values(recovered).every(v => typeof v === 'number')
        });
        
        if (Object.values(recovered).every(v => typeof v === 'number')) {
          console.debug('[CoordinateSystemManager] Successfully recovered bounds:', {
            original: bounds,
            recovered
          });
          bounds = recovered as BoundsObject;
        } else {
          console.error('[CoordinateSystemManager] Failed to recover bounds:', {
            original: bounds,
            recovered,
            stack: new Error().stack
          });
          throw new Error('Invalid bounds format: must be either an array [minX, minY, maxX, maxY] or an object {minX, minY, maxX, maxY}');
        }
      }
    }

    // Convert bounds to array format
    const boundsArray = convertBoundsToArray(bounds);
    console.debug('[CoordinateSystemManager] Working with bounds array:', {
      input: bounds,
      converted: boundsArray,
      isValid: validateBounds(boundsArray, from)
    });

    try {
      const transformer = await this.getTransformer(from, to);

      // Transform corners and calculate new bounds
      const corners = [
        [boundsArray[0], boundsArray[1]], // min point
        [boundsArray[0], boundsArray[3]], // bottom right
        [boundsArray[2], boundsArray[1]], // top left
        [boundsArray[2], boundsArray[3]]  // max point
      ];

      const transformedCorners = await Promise.all(
        corners.map(async corner => {
          try {
            return transformer(corner as Position);
          } catch (error) {
            console.warn('[CoordinateSystemManager] Corner transformation failed:', {
              corner,
              error: error instanceof Error ? error.message : String(error)
            });
            return corner as Position;
          }
        })
      );

      // Calculate bounds from transformed corners
      const transformedBounds: [number, number, number, number] = [
        Math.min(...transformedCorners.map(c => c[0])),
        Math.min(...transformedCorners.map(c => c[1])),
        Math.max(...transformedCorners.map(c => c[0])),
        Math.max(...transformedCorners.map(c => c[1]))
      ];

      console.debug('[CoordinateSystemManager] Calculated bounds from corners:', {
        corners: transformedCorners,
        bounds: transformedBounds
      });

      // Validate and clamp transformed bounds if needed
      if (!validateBounds(transformedBounds, to)) {
        const targetBounds = COORDINATE_SYSTEM_BOUNDS[to as CoordinateSystemId];
        if (targetBounds) {
          const clampedBounds: [number, number, number, number] = [
            Math.max(transformedBounds[0], targetBounds.x.min),
            Math.max(transformedBounds[1], targetBounds.y.min),
            Math.min(transformedBounds[2], targetBounds.x.max),
            Math.min(transformedBounds[3], targetBounds.y.max)
          ];
          
          console.debug('[CoordinateSystemManager] Clamped out-of-range bounds:', {
            original: transformedBounds,
            clamped: clampedBounds
          });
          
          return clampedBounds;
        }
      }

      return transformedBounds;
    } catch (error) {
      console.error('[CoordinateSystemManager] Bounds transformation failed:', {
        error: error instanceof Error ? error.message : String(error),
        bounds: boundsArray,
        from,
        to,
        stack: error instanceof Error ? error.stack : undefined
      });
      
      // Fallback to system bounds if transformation fails
      const systemBounds = COORDINATE_SYSTEM_BOUNDS[to as CoordinateSystemId];
      if (systemBounds) {
        const fallbackBounds: [number, number, number, number] = [
          systemBounds.x.min,
          systemBounds.y.min,
          systemBounds.x.max,
          systemBounds.y.max
        ];
        
        console.warn('[CoordinateSystemManager] Using fallback bounds after transformation failure:', {
          fallback: fallbackBounds,
          system: to
        });
        
        return fallbackBounds;
      }
      
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
      // Register all projections with proj4
      Object.entries(PROJECTIONS).forEach(([code, proj]) => {
        proj4.defs(code, proj);
        console.debug('[CoordinateSystemManager] Registered projection:', code);
      });

      this.initialized = true;
      console.debug('[CoordinateSystemManager] Initialized successfully');
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
