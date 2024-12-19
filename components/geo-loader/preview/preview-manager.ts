import { Feature, FeatureCollection, Position, Geometry, GeometryCollection } from 'geojson';
import { COORDINATE_SYSTEMS, CoordinateSystem } from '../types/coordinates';
import { Analysis } from '../types/map';
import { CoordinateTransformer } from '../utils/coordinate-utils';
import { ErrorReporter } from '../utils/errors';
import type { Proj4Type } from '../types/proj4';

export interface PreviewManagerOptions {
  maxFeatures?: number;
  visibleLayers?: string[];
  selectedElement?: { type: string; layer: string };
  analysis?: Analysis;
  coordinateSystem?: CoordinateSystem;
}

interface RequiredPreviewManagerOptions {
  maxFeatures: number;
  visibleLayers: string[];
  selectedElement: { type: string; layer: string } | undefined;
  analysis: Analysis | undefined;
  coordinateSystem: CoordinateSystem | undefined;
}

export interface FeatureGroup {
  points: Feature[];
  lines: Feature[];
  polygons: Feature[];
  totalCount: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface TransformationError {
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
  private static readonly DEFAULT_MAX_FEATURES = 5000;
  private static readonly BOUNDS_PADDING = 0.1; // 10% padding
  private static readonly MAX_TRANSFORMATION_ERROR_RATIO = 0.5; // 50%

  private features: Feature[] = [];
  private options: RequiredPreviewManagerOptions;
  private warningFlags = new Map<string, Set<string>>();
  private transformer: CoordinateTransformer | undefined;
  private cachedBounds: Bounds | undefined;
  private transformationErrors: TransformationError[] = [];

  constructor(
    options: PreviewManagerOptions = {},
    private readonly errorReporter: ErrorReporter,
    private readonly proj4Instance: Proj4Type
  ) {
    this.options = {
      maxFeatures: options.maxFeatures ?? PreviewManager.DEFAULT_MAX_FEATURES,
      visibleLayers: options.visibleLayers ?? [],
      selectedElement: options.selectedElement,
      analysis: options.analysis,
      coordinateSystem: options.coordinateSystem
    };

    this.initializeTransformer(options.coordinateSystem);
  }

  private initializeTransformer(coordinateSystem?: CoordinateSystem): void {
    if (coordinateSystem && coordinateSystem !== COORDINATE_SYSTEMS.WGS84) {
      try {
        this.transformer = new CoordinateTransformer(
          coordinateSystem,
          COORDINATE_SYSTEMS.WGS84,
          this.errorReporter,
          this.proj4Instance
        );
        this.errorReporter.reportInfo('PREVIEW_INIT', 'Initialized coordinate transformer', {
          fromSystem: coordinateSystem,
          toSystem: COORDINATE_SYSTEMS.WGS84
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.errorReporter.reportError('TRANSFORM_ERROR', 'Failed to initialize coordinate transformer', {
          error: errorMessage,
          coordinateSystem
        });
        throw error;
      }
    }
  }

  private transformPosition(pos: Position): Position | null {
    if (!this.transformer) {
      return pos;
    }

    try {
      const result = this.transformer.transform(
        { x: pos[0], y: pos[1], z: pos[2] }
      );
      if (!result) {
        this.errorReporter.reportError('TRANSFORM_ERROR', 'Coordinate transformation failed', {
          coordinates: pos,
          fromSystem: this.options.coordinateSystem,
          toSystem: COORDINATE_SYSTEMS.WGS84
        });
        return null;
      }
      return result.z !== undefined
        ? [result.x, result.y, result.z]
        : [result.x, result.y];
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.errorReporter.reportError('TRANSFORM_ERROR', 'Failed to transform coordinates', {
        error: errorMessage,
        coordinates: pos,
        fromSystem: this.options.coordinateSystem,
        toSystem: COORDINATE_SYSTEMS.WGS84
      });
      return null;
    }
  }

  private transformCoordinates(coords: any): any {
    if (Array.isArray(coords)) {
      if (typeof coords[0] === 'number') {
        return this.transformPosition(coords as Position);
      }
      const transformed = coords.map(c => this.transformCoordinates(c));
      return transformed.every(t => t !== null) ? transformed : null;
    }
    return coords;
  }

  setFeatures(features: Feature[] | FeatureCollection): void {
    this.cachedBounds = undefined;
    this.transformationErrors = [];
    this.features = Array.isArray(features) ? features : features.features;

    // Transform coordinates to WGS84 if needed
    if (this.transformer) {
      const transformedFeatures: Feature[] = [];
      let transformationErrors = 0;

      for (const feature of this.features) {
        const transformed = this.transformFeature(feature);
        if (transformed) {
          transformedFeatures.push(transformed);
        } else {
          transformationErrors++;
          if (feature.properties?.handle && feature.properties?.layer) {
            this.addWarningFlag(feature.properties.layer, feature.properties.handle);
          }
        }
      }

      // Check if too many transformations failed
      const errorRatio = transformationErrors / this.features.length;
      if (errorRatio > PreviewManager.MAX_TRANSFORMATION_ERROR_RATIO) {
        this.errorReporter.reportError('TRANSFORM_ERROR', 'Too many coordinate transformations failed', {
          failedCount: transformationErrors,
          totalCount: this.features.length,
          errorRatio
        });
        throw new Error('Too many coordinate transformations failed');
      }

      this.features = transformedFeatures;

      // Add warning to analysis if any transformations failed
      if (transformationErrors > 0 && this.options.analysis?.warnings) {
        this.options.analysis.warnings.push({
          type: 'TRANSFORM_ERROR',
          message: `${transformationErrors} features failed coordinate transformation`
        });
      }
    }
  }

  private transformFeature(feature: Feature): Feature | null {
    if (!feature.geometry) {
      return feature;
    }

    try {
      if (hasCoordinates(feature.geometry)) {
        const transformed = this.transformCoordinates(feature.geometry.coordinates);
        if (!transformed) {
          return null;
        }

        return {
          ...feature,
          geometry: {
            ...feature.geometry,
            coordinates: transformed
          },
          properties: {
            ...feature.properties,
            sourceCoordinateSystem: this.options.coordinateSystem
          }
        };
      }
      return feature; // Return unmodified GeometryCollection
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.errorReporter.reportError('TRANSFORM_ERROR', 'Failed to transform feature', {
        error: errorMessage,
        featureId: feature.id,
        layer: feature.properties?.layer,
        geometryType: feature.geometry.type
      });
      return null;
    }
  }

  setOptions(options: Partial<PreviewManagerOptions>): void {
    const prevCoordinateSystem = this.options.coordinateSystem;
    this.options = {
      ...this.options,
      ...options,
      selectedElement: options.selectedElement ?? this.options.selectedElement,
      analysis: options.analysis ?? this.options.analysis,
      coordinateSystem: options.coordinateSystem ?? this.options.coordinateSystem
    };

    // Re-initialize transformer if coordinate system changed
    if (options.coordinateSystem !== prevCoordinateSystem) {
      this.initializeTransformer(options.coordinateSystem);
      if (this.features.length > 0) {
        this.setFeatures(this.features);
      }
    }
  }

  addWarningFlag(layer: string, handle: string): void {
    let layerWarnings = this.warningFlags.get(layer);
    if (!layerWarnings) {
      layerWarnings = new Set();
      this.warningFlags.set(layer, layerWarnings);
    }
    layerWarnings.add(handle);
  }

  getTransformationErrors(): TransformationError[] {
    return [...this.transformationErrors];
  }

  groupFeatures(): FeatureGroup {
    const points: Feature[] = [];
    const lines: Feature[] = [];
    const polygons: Feature[] = [];
    let totalCount = 0;

    for (const feature of this.features) {
      if (!feature.geometry || !hasCoordinates(feature.geometry)) {
        continue;
      }

      // Filter by visible layers
      if (this.options.visibleLayers?.length &&
          !this.options.visibleLayers.includes(feature.properties?.layer || '0')) {
        continue;
      }

      // Add warning flags
      if (feature.properties?.layer && feature.properties?.handle) {
        const layerWarnings = this.warningFlags.get(feature.properties.layer);
        if (layerWarnings?.has(feature.properties.handle)) {
          feature.properties.hasWarning = true;
        }
      }

      switch (feature.geometry.type) {
        case 'Point':
        case 'MultiPoint':
          points.push(feature);
          break;
        case 'LineString':
        case 'MultiLineString':
          lines.push(feature);
          break;
        case 'Polygon':
        case 'MultiPolygon':
          polygons.push(feature);
          break;
      }
      totalCount++;
    }

    return { points, lines, polygons, totalCount };
  }

  getPreviewCollections(): {
    points: FeatureCollection;
    lines: FeatureCollection;
    polygons: FeatureCollection;
    totalCount: number;
    visibleCount: number;
  } {
    const { points, lines, polygons, totalCount } = this.groupFeatures();

    return {
      points: {
        type: 'FeatureCollection',
        features: points.map(f => ({
          ...f,
          properties: {
            ...f.properties,
            sourceCoordinateSystem: this.options.coordinateSystem
          }
        }))
      },
      lines: {
        type: 'FeatureCollection',
        features: lines.map(f => ({
          ...f,
          properties: {
            ...f.properties,
            sourceCoordinateSystem: this.options.coordinateSystem
          }
        }))
      },
      polygons: {
        type: 'FeatureCollection',
        features: polygons.map(f => ({
          ...f,
          properties: {
            ...f.properties,
            sourceCoordinateSystem: this.options.coordinateSystem
          }
        }))
      },
      totalCount: this.features.length,
      visibleCount: totalCount
    };
  }

  getFeaturesByTypeAndLayer(type: string, layer: string): Feature[] {
    return this.features.filter(f =>
      f.properties?.type === type &&
      f.properties?.layer === layer
    );
  }

  calculateBounds(): Bounds {
    if (this.cachedBounds) {
      return this.cachedBounds;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const feature of this.features) {
      if (feature.bbox) {
        minX = Math.min(minX, feature.bbox[0]);
        minY = Math.min(minY, feature.bbox[1]);
        maxX = Math.max(maxX, feature.bbox[2]);
        maxY = Math.max(maxY, feature.bbox[3]);
      }
    }

    // Handle empty or invalid bounds
    if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
      this.errorReporter.reportWarning('BOUNDS_ERROR', 'Invalid bounds, using default location');
      // Default to Aarau, Switzerland
      minX = 7.7472;
      minY = 47.0892;
      maxX = 8.3472;
      maxY = 47.6892;
    }

    // Add padding
    const width = maxX - minX;
    const height = maxY - minY;
    const paddingX = width * PreviewManager.BOUNDS_PADDING;
    const paddingY = height * PreviewManager.BOUNDS_PADDING;

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
    for (const feature of this.features) {
      const layer = feature.properties?.layer || '0';
      counts[layer] = (counts[layer] || 0) + 1;
    }
    return counts;
  }
}

/**
 * Create a new PreviewManager instance
 */
export function createPreviewManager(
  options: PreviewManagerOptions,
  errorReporter: ErrorReporter,
  proj4Instance: Proj4Type
): PreviewManager {
  return new PreviewManager(options, errorReporter, proj4Instance);
}
