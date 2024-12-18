// components/geo-loader/preview/preview-manager.ts

import { Feature, FeatureCollection, Position, Geometry } from 'geojson';
import { CoordinateSystem } from '../types/coordinates';
import { Analysis } from '../types/map';
import { CoordinateTransformer } from '../utils/coordinate-utils';
import { toMapboxCoordinates } from '../utils/coordinate-systems';

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

export class PreviewManager {
  private readonly DEFAULT_MAX_FEATURES = 5000;
  private readonly BOUNDS_PADDING = 0.1; // 10% padding
  private features: Feature[] = [];
  private options: PreviewOptions;
  private warningFlags: Map<string, Set<string>> = new Map(); // layer -> set of warning handles
  private transformer?: CoordinateTransformer;
  private cachedBounds?: Bounds;

  constructor(options: PreviewOptions = {}) {
    this.options = {
      maxFeatures: this.DEFAULT_MAX_FEATURES,
      visibleLayers: [],
      ...options
    };

    this.initializeTransformer(options.coordinateSystem);
  }

  private initializeTransformer(coordinateSystem?: CoordinateSystem) {
    if (coordinateSystem) {
      try {
        // Always transform to WGS84 for Mapbox
        this.transformer = new CoordinateTransformer(coordinateSystem, 'EPSG:4326');
      } catch (error) {
        console.warn('Failed to initialize coordinate transformer:', error);
      }
    }
  }

  setFeatures(features: Feature[] | FeatureCollection) {
    if (Array.isArray(features)) {
      this.features = features;
    } else {
      this.features = features.features;
    }

    // Reset cached bounds
    this.cachedBounds = undefined;

    // Add coordinate system info and transform coordinates if needed
    if (this.options.coordinateSystem && this.transformer) {
      this.features.forEach(feature => {
        if (!feature.properties) {
          feature.properties = {};
        }
        feature.properties.sourceCoordinateSystem = this.options.coordinateSystem;

        // Transform coordinates to WGS84 for preview
        try {
          this.transformFeatureCoordinates(feature);
        } catch (error) {
          console.warn('Failed to transform feature coordinates:', error);
        }
      });
    }
  }

  private transformPosition(pos: Position): Position {
    if (!this.transformer) return pos;

    const transformed = this.transformer.transform({ x: pos[0], y: pos[1] });
    if (!transformed) return pos;

    // Convert to Mapbox format [longitude, latitude]
    const [lon, lat] = toMapboxCoordinates(transformed);
    return [lon, lat, pos[2]];
  }

  private transformFeatureCoordinates(feature: Feature) {
    if (!this.transformer) return;

    const transformCoordinates = (coords: any): any => {
      if (!Array.isArray(coords)) return coords;
      if (typeof coords[0] === 'number') {
        return this.transformPosition(coords as Position);
      }
      return coords.map(c => transformCoordinates(c));
    };

    if ('coordinates' in feature.geometry) {
      const transformed = transformCoordinates(feature.geometry.coordinates);
      if (transformed) {
        feature.geometry = {
          ...feature.geometry,
          coordinates: transformed
        };
      }
    }
  }

  setOptions(options: Partial<PreviewOptions>) {
    const prevCoordinateSystem = this.options.coordinateSystem;
    this.options = {
      ...this.options,
      ...options
    };

    // Update transformer if coordinate system changes
    if (options.coordinateSystem && options.coordinateSystem !== prevCoordinateSystem) {
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
      // Ensure coordinates are in [longitude, latitude] format for Mapbox
      const [lon, lat] = coords;
      minX = Math.min(minX, lon);
      minY = Math.min(minY, lat);
      maxX = Math.max(maxX, lon);
      maxY = Math.max(maxY, lat);
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
      if ('coordinates' in feature.geometry) {
        processCoordinates(feature.geometry.coordinates);
      }
    });

    // Handle empty or invalid bounds
    if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
      // Default to Aarau, Switzerland if no valid bounds
      return {
        minX: 8.0,  // longitude
        minY: 47.3, // latitude
        maxX: 8.1,  // longitude
        maxY: 47.4  // latitude
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
