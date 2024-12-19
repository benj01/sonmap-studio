// components/geo-loader/preview/preview-manager.ts

import { Feature, FeatureCollection, Position, Geometry, GeometryCollection } from 'geojson';
import { COORDINATE_SYSTEMS, CoordinateSystem } from '../types/coordinates';
import { Analysis } from '../types/map';
import { CoordinateTransformer } from '../utils/coordinate-utils';
import { CoordinateTransformationError } from '../utils/dxf/geo-converter';
import proj4 from 'proj4';

interface PreviewOptions {
  maxFeatures?: number;
  visibleLayers?: string[];
  selectedElement?: {
    type: string;
    layer: string;
  };
  analysis?: Analysis;
  coordinateSystem?: CoordinateSystem;
}

interface FeatureGroup {
  points: Feature[];
  lines: Feature[];
  polygons: Feature[];
  totalCount: number;
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface TransformationError {
  message: string;
  originalCoordinates: { x: number; y: number; z?: number };
  featureId?: string;
  layer?: string;
}

type GeometryWithCoordinates = Exclude<Geometry, GeometryCollection>;

function hasCoordinates(geometry: Geometry): geometry is GeometryWithCoordinates {
  return 'coordinates' in geometry;
}

export class PreviewManager {
  private readonly DEFAULT_MAX_FEATURES = 5000;
  private readonly BOUNDS_PADDING = 0.1; // 10% padding
  private readonly MAX_TRANSFORMATION_ERROR_RATIO = 0.5; // 50% threshold
  private features: Feature[] = [];
  private options: PreviewOptions;
  private warningFlags: Map<string, Set<string>> = new Map(); // layer -> set of warning handles
  private transformer?: CoordinateTransformer;
  private cachedBounds?: Bounds;
  private transformationErrors: TransformationError[] = [];

  constructor(options: PreviewOptions = {}) {
    this.options = {
      maxFeatures: this.DEFAULT_MAX_FEATURES,
      visibleLayers: [],
      ...options
    };

    this.initializeTransformer(options.coordinateSystem);
  }

  private initializeTransformer(coordinateSystem?: CoordinateSystem) {
    if (coordinateSystem && coordinateSystem !== COORDINATE_SYSTEMS.WGS84) {
      try {
        // Always transform to WGS84 for Mapbox
        this.transformer = new CoordinateTransformer(coordinateSystem, COORDINATE_SYSTEMS.WGS84);
        console.debug('Initialized coordinate transformer:', {
          from: coordinateSystem,
          to: COORDINATE_SYSTEMS.WGS84,
          def: proj4.defs(coordinateSystem)
        });
      } catch (error) {
        const err = error as Error;
        console.error('Failed to initialize coordinate transformer:', err);
        throw new Error(`Failed to initialize coordinate transformer: ${err.message}`);
      }
    } else {
      console.debug('No coordinate transformation needed:', coordinateSystem);
      this.transformer = undefined;
    }
  }

  private transformPosition(pos: Position): Position | null {
    if (!this.transformer || !this.options.coordinateSystem) return pos;

    try {
      const transformed = this.transformer.transform({ x: pos[0], y: pos[1] });
      if (!transformed) {
        throw new CoordinateTransformationError(
          'Transformation failed for position',
          { x: pos[0], y: pos[1], z: pos[2] }
        );
      }

      // Log transformation for debugging
      console.debug('Position transformation:', {
        original: pos,
        transformed: [transformed.x, transformed.y],
        system: this.options.coordinateSystem
      });

      // Validate transformed coordinates
      if (!isFinite(transformed.x) || !isFinite(transformed.y) || 
          Math.abs(transformed.x) > 180 || Math.abs(transformed.y) > 90) {
        throw new CoordinateTransformationError(
          `Invalid transformed coordinates: [${transformed.x}, ${transformed.y}]`,
          { x: pos[0], y: pos[1], z: pos[2] }
        );
      }

      return pos.length > 2 ? [transformed.x, transformed.y, pos[2]] : [transformed.x, transformed.y];
    } catch (error) {
      if (error instanceof CoordinateTransformationError) {
        throw error;
      }
      const err = error as Error;
      throw new CoordinateTransformationError(
        `Transformation error: ${err.message || 'Unknown error'}`,
        { x: pos[0], y: pos[1], z: pos[2] }
      );
    }
  }

  setFeatures(features: Feature[] | FeatureCollection) {
    if (Array.isArray(features)) {
      this.features = features;
    } else {
      this.features = features.features;
    }

    // Reset cached bounds and errors
    this.cachedBounds = undefined;
    this.transformationErrors = [];
    this.warningFlags.clear();

    // Add coordinate system info and transform coordinates if needed
    if (this.options.coordinateSystem && this.transformer) {
      console.debug('Transforming features from', this.options.coordinateSystem, 'to', COORDINATE_SYSTEMS.WGS84);
      
      const transformedFeatures: Feature[] = [];
      for (const feature of this.features) {
        if (!feature.properties) {
          feature.properties = {};
        }
        feature.properties.sourceCoordinateSystem = this.options.coordinateSystem;

        try {
          const transformedFeature = this.transformFeature(feature);
          if (transformedFeature) {
            transformedFeatures.push(transformedFeature);
          }
        } catch (error) {
          if (error instanceof CoordinateTransformationError) {
            // Track error details
            this.transformationErrors.push({
              message: error.message,
              originalCoordinates: error.originalCoordinates,
              featureId: feature.properties?.id,
              layer: feature.properties?.layer
            });

            // Add warning flag to the feature
            const layer = feature.properties?.layer || 'default';
            const handle = feature.properties?.id;
            if (handle) {
              this.addWarningFlag(layer, handle);
            }

            // Add feature with warning flag
            transformedFeatures.push({
              ...feature,
              properties: {
                ...feature.properties,
                hasWarning: true,
                transformationError: error.message
              }
            });
          } else {
            const err = error as Error;
            console.error('Failed to transform feature:', err, feature);
            this.transformationErrors.push({
              message: err.message || 'Unknown error',
              originalCoordinates: { x: 0, y: 0 }, // Default coordinates for non-coordinate errors
              featureId: feature.properties?.id,
              layer: feature.properties?.layer
            });
          }
        }
      }

      // Calculate error ratio
      const errorRatio = this.transformationErrors.length / this.features.length;
      if (errorRatio > this.MAX_TRANSFORMATION_ERROR_RATIO) {
        const errorMessage = `Too many transformation errors (${this.transformationErrors.length} out of ${this.features.length} features). The coordinate system may be incorrect.`;
        console.error(errorMessage, {
          errors: this.transformationErrors,
          coordinateSystem: this.options.coordinateSystem
        });
        throw new Error(errorMessage);
      }

      // Add transformation errors to analysis warnings
      if (this.options.analysis && this.transformationErrors.length > 0) {
        const warnings = this.options.analysis.warnings || [];
        warnings.push({
          type: 'coordinate_transformation',
          message: `${this.transformationErrors.length} features had coordinate transformation errors`
        });
        this.options.analysis.warnings = warnings;
      }

      this.features = transformedFeatures;
    }
  }

  private transformFeature(feature: Feature): Feature | null {
    if (!this.transformer) return feature;

    const transformCoordinates = (coords: any): any => {
      if (!Array.isArray(coords)) return coords;
      if (typeof coords[0] === 'number') {
        return this.transformPosition(coords as Position);
      }
      return coords.map(c => transformCoordinates(c));
    };

    if (hasCoordinates(feature.geometry)) {
      const transformed = transformCoordinates(feature.geometry.coordinates);
      return {
        ...feature,
        geometry: {
          ...feature.geometry,
          coordinates: transformed
        }
      };
    }

    return feature;
  }

  setOptions(options: Partial<PreviewOptions>) {
    const prevCoordinateSystem = this.options.coordinateSystem;
    this.options = {
      ...this.options,
      ...options
    };

    // Update transformer if coordinate system changes
    if (options.coordinateSystem && options.coordinateSystem !== prevCoordinateSystem) {
      console.debug('Coordinate system changed:', {
        from: prevCoordinateSystem,
        to: options.coordinateSystem
      });
      this.initializeTransformer(options.coordinateSystem);
      // Re-transform features with new coordinate system
      this.setFeatures(this.features);
    }
  }

  addWarningFlag(layer: string, handle: string) {
    if (!this.warningFlags.has(layer)) {
      this.warningFlags.set(layer, new Set());
    }
    this.warningFlags.get(layer)?.add(handle);
  }

  getTransformationErrors(): TransformationError[] {
    return this.transformationErrors;
  }

  private groupFeatures(): FeatureGroup {
    const result: FeatureGroup = {
      points: [],
      lines: [],
      polygons: [],
      totalCount: 0
    };

    const { maxFeatures, visibleLayers } = this.options;
    const processedCounts: Record<string, number> = {};

    for (const feature of this.features) {
      // Skip if feature's layer is not visible
      const layer = feature.properties?.layer;
      if (visibleLayers?.length && !visibleLayers.includes(layer)) {
        continue;
      }

      // Track counts per layer
      processedCounts[layer] = (processedCounts[layer] || 0) + 1;
      result.totalCount++;

      // Apply sampling if needed
      if (maxFeatures && processedCounts[layer] > maxFeatures) {
        continue;
      }

      // Add warning flags
      if (feature.properties?.handle && this.warningFlags.get(layer)?.has(feature.properties.handle)) {
        feature.properties.hasWarning = true;
      }

      // Group by geometry type
      switch (feature.geometry.type) {
        case 'Point':
        case 'MultiPoint':
          result.points.push(feature);
          break;
        case 'LineString':
        case 'MultiLineString':
          result.lines.push(feature);
          break;
        case 'Polygon':
        case 'MultiPolygon':
          result.polygons.push(feature);
          break;
      }
    }

    return result;
  }

  getPreviewCollections(): {
    points: FeatureCollection;
    lines: FeatureCollection;
    polygons: FeatureCollection;
    totalCount: number;
    visibleCount: number;
  } {
    const grouped = this.groupFeatures();

    // Add coordinate system info to feature collections
    const addMetadata = (collection: FeatureCollection) => {
      if (this.options.coordinateSystem) {
        collection.features.forEach(feature => {
          if (!feature.properties) {
            feature.properties = {};
          }
          feature.properties.sourceCoordinateSystem = this.options.coordinateSystem;
        });
      }
      return collection;
    };

    return {
      points: addMetadata({
        type: 'FeatureCollection',
        features: grouped.points
      }),
      lines: addMetadata({
        type: 'FeatureCollection',
        features: grouped.lines
      }),
      polygons: addMetadata({
        type: 'FeatureCollection',
        features: grouped.polygons
      }),
      totalCount: this.features.length,
      visibleCount: grouped.points.length + grouped.lines.length + grouped.polygons.length
    };
  }

  getFeaturesByTypeAndLayer(type: string, layer: string): Feature[] {
    return this.features.filter(feature => 
      feature.properties?.entityType === type && 
      feature.properties?.layer === layer
    );
  }

  calculateBounds(): Bounds {
    // Return cached bounds if available
    if (this.cachedBounds) {
      return this.cachedBounds;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    const updateBounds = (coords: Position) => {
      const [x, y] = coords;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    };

    const processCoordinates = (coords: any): void => {
      if (!Array.isArray(coords)) return;
      if (typeof coords[0] === 'number') {
        updateBounds(coords as Position);
      } else {
        coords.forEach(c => processCoordinates(c));
      }
    };

    this.features.forEach(feature => {
      if (hasCoordinates(feature.geometry)) {
        processCoordinates(feature.geometry.coordinates);
      }
    });

    // Handle empty or invalid bounds
    if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
      // Default to Aarau, Switzerland if no valid bounds
      return {
        minX: 8.0444,  // longitude
        minY: 47.3892, // latitude
        maxX: 8.0544,  // longitude
        maxY: 47.3992  // latitude
      };
    }

    // Add padding
    const width = maxX - minX;
    const height = maxY - minY;
    const paddingX = width * this.BOUNDS_PADDING;
    const paddingY = height * this.BOUNDS_PADDING;

    this.cachedBounds = {
      minX: minX - paddingX,
      minY: minY - paddingY,
      maxX: maxX + paddingX,
      maxY: maxY + paddingY
    };

    return this.cachedBounds;
  }

  hasVisibleFeatures(): boolean {
    const { points, lines, polygons } = this.groupFeatures();
    return points.length > 0 || lines.length > 0 || polygons.length > 0;
  }

  getLayerCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    this.features.forEach(feature => {
      const layer = feature.properties?.layer || 'default';
      counts[layer] = (counts[layer] || 0) + 1;
    });
    return counts;
  }
}

export function createPreviewManager(options?: PreviewOptions): PreviewManager {
  return new PreviewManager(options);
}
