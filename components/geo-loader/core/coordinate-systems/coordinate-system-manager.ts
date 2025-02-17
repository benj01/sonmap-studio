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
import { CoordinateSystemDetector, DetectionResult } from './detector';
import { CoordinateTransformer } from './transformer';
import { TransformationCache } from './cache';

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
  private readonly logger = LogManager.getInstance();
  private readonly LOG_SOURCE = 'CoordinateSystemManager';
  private readonly detector: CoordinateSystemDetector;
  private readonly transformer: CoordinateTransformer;
  private readonly cache: TransformationCache;
  private initialized = false;

  private constructor() {
    this.detector = CoordinateSystemDetector.getInstance();
    this.transformer = CoordinateTransformer.getInstance();
    this.cache = TransformationCache.getInstance();
  }

  public static getInstance(): CoordinateSystemManager {
    if (!CoordinateSystemManager.instance) {
      CoordinateSystemManager.instance = new CoordinateSystemManager();
    }
    return CoordinateSystemManager.instance;
  }

  /**
   * Detect coordinate system from features and metadata
   */
  public async detect(
    features: Feature[],
    metadata?: { prj?: string; crs?: string | object }
  ): Promise<DetectionResult> {
    try {
      return await this.detector.detect(features, metadata);
    } catch (error) {
      this.logger.error('Error detecting coordinate system:', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * Transform features from one coordinate system to another
   */
  public async transform(
    features: Feature[],
    fromSystem: CoordinateSystem,
    toSystem: CoordinateSystem
  ): Promise<Feature[]> {
    this.logger.debug(this.LOG_SOURCE, 'Starting feature transformation', {
      featureCount: features.length,
      fromSystem,
      toSystem,
      firstFeature: features[0] ? {
        type: features[0].geometry?.type,
        coordinates: this.getGeometryCoordinates(features[0].geometry),
        properties: features[0].properties
      } : null
    });

    try {
      // Transform each feature
      const transformedFeatures = await Promise.all(
        features.map(async (feature) => {
          try {
            const transformed = await this.transformFeature(feature, fromSystem, toSystem);
            if (transformed) {
              this.logger.debug(this.LOG_SOURCE, 'Feature transformed', {
                originalCoords: this.getGeometryCoordinates(feature.geometry),
                transformedCoords: this.getGeometryCoordinates(transformed.geometry),
                fromSystem,
                toSystem
              });
            } else {
              this.logger.warn(this.LOG_SOURCE, 'Feature transformation failed', {
                type: feature.geometry?.type,
                coordinates: this.getGeometryCoordinates(feature.geometry),
                fromSystem,
                toSystem
              });
            }
            return transformed || feature;
          } catch (error) {
            this.logger.error(this.LOG_SOURCE, 'Error transforming feature', {
              error: error instanceof Error ? error.message : String(error),
              feature: {
                type: feature.geometry?.type,
                coordinates: this.getGeometryCoordinates(feature.geometry)
              }
            });
            return feature;
          }
        })
      );

      this.logger.debug(this.LOG_SOURCE, 'Transformation complete', {
        originalCount: features.length,
        transformedCount: transformedFeatures.length,
        fromSystem,
        toSystem
      });

      return transformedFeatures;
    } catch (error) {
      this.logger.error(this.LOG_SOURCE, 'Batch transformation failed', {
        error: error instanceof Error ? error.message : String(error),
        featureCount: features.length,
        fromSystem,
        toSystem
      });
      return features;
    }
  }

  /**
   * Transform a single feature
   */
  public async transformFeature(
    feature: Feature,
    from: CoordinateSystem,
    to: CoordinateSystem
  ): Promise<Feature> {
    try {
      return await this.transformer.transformFeature(feature, from, to);
    } catch (error) {
      this.logger.error('Error transforming feature:', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * Transform coordinates from one system to another
   */
  public async transformCoordinates(
    coordinates: Position,
    from: CoordinateSystem,
    to: CoordinateSystem
  ): Promise<Position> {
    try {
      return await this.transformer.transformPosition(coordinates, from, to);
    } catch (error) {
      this.logger.error('Error transforming coordinates:', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * Get cache statistics
   */
  public getCacheStats() {
    return this.cache.getStats();
  }

  /**
   * Clear the transformation cache
   */
  public clearCache(): void {
    this.cache.clear();
  }

  /**
   * Check if the manager is initialized
   */
  public isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Initialize the coordinate system manager
   */
  public async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Any initialization logic can go here
      this.initialized = true;
      this.logger.debug('CoordinateSystemManager', 'Coordinate system manager initialized');
    } catch (error) {
      this.logger.error('Error initializing coordinate system manager:', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * Validate if a coordinate system is valid
   */
  public validateSystem(system: CoordinateSystem): boolean {
    if (!system) {
      this.logger.warn('CoordinateSystemManager', 'Invalid coordinate system: system is undefined');
      return false;
    }

    // Check if the system is one of the known coordinate systems
    const isValid = Object.values(COORDINATE_SYSTEMS).includes(system);
    if (!isValid) {
      this.logger.warn('CoordinateSystemManager', 'Invalid coordinate system', { system });
    }
    return isValid;
  }

  private getGeometryCoordinates(geometry: Geometry | undefined): number[][] | null {
    if (!geometry) return null;
    
    switch (geometry.type) {
      case 'Point':
        return [geometry.coordinates];
      case 'LineString':
        return geometry.coordinates;
      case 'Polygon':
        return geometry.coordinates[0];
      case 'MultiPoint':
        return geometry.coordinates;
      case 'MultiLineString':
        return geometry.coordinates[0];
      case 'MultiPolygon':
        return geometry.coordinates[0][0];
      default:
        return null;
    }
  }
}

// Export the singleton instance
export const coordinateSystemManager = CoordinateSystemManager.getInstance();
