// components/geo-loader/preview/preview-manager.ts

import { Feature, FeatureCollection, Position, Geometry } from 'geojson';
import { CoordinateSystem } from '../types/coordinates';
import { Analysis } from '../types/map';
import { CoordinateTransformer } from '../utils/coordinate-utils';

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

export class PreviewManager {
  private readonly DEFAULT_MAX_FEATURES = 5000;
  private features: Feature[] = [];
  private options: PreviewOptions;
  private warningFlags: Map<string, Set<string>> = new Map(); // layer -> set of warning handles
  private transformer?: CoordinateTransformer;

  constructor(options: PreviewOptions = {}) {
    this.options = {
      maxFeatures: this.DEFAULT_MAX_FEATURES,
      visibleLayers: [],
      ...options
    };

    // Initialize coordinate transformer if needed
    if (options.coordinateSystem) {
      try {
        this.transformer = new CoordinateTransformer(options.coordinateSystem, 'EPSG:4326');
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

    // Add coordinate system info to feature properties
    if (this.options.coordinateSystem) {
      this.features.forEach(feature => {
        if (!feature.properties) {
          feature.properties = {};
        }
        feature.properties.sourceCoordinateSystem = this.options.coordinateSystem;
      });
    }
  }

  setOptions(options: Partial<PreviewOptions>) {
    this.options = {
      ...this.options,
      ...options
    };

    // Update transformer if coordinate system changes
    if (options.coordinateSystem && options.coordinateSystem !== this.options.coordinateSystem) {
      try {
        this.transformer = new CoordinateTransformer(options.coordinateSystem, 'EPSG:4326');
      } catch (error) {
        console.warn('Failed to update coordinate transformer:', error);
      }
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

  calculateBounds(): { minX: number; minY: number; maxX: number; maxY: number } {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    const updateBounds = (coords: Position) => {
      minX = Math.min(minX, coords[0]);
      minY = Math.min(minY, coords[1]);
      maxX = Math.max(maxX, coords[0]);
      maxY = Math.max(maxY, coords[1]);
    };

    const processCoordinates = (coordinates: Position | Position[] | Position[][]) => {
      if (typeof coordinates[0] === 'number') {
        updateBounds(coordinates as Position);
      } else {
        (coordinates as Position[] | Position[][]).forEach(coords => 
          processCoordinates(coords)
        );
      }
    };

    this.features.forEach(feature => {
      const geometry = feature.geometry;
      switch (geometry.type) {
        case 'Point':
          updateBounds(geometry.coordinates);
          break;
        case 'MultiPoint':
        case 'LineString':
          geometry.coordinates.forEach(coord => updateBounds(coord));
          break;
        case 'MultiLineString':
        case 'Polygon':
          geometry.coordinates.forEach(line => 
            line.forEach(coord => updateBounds(coord))
          );
          break;
        case 'MultiPolygon':
          geometry.coordinates.forEach(poly => 
            poly.forEach(line => 
              line.forEach(coord => updateBounds(coord))
            )
          );
          break;
      }
    });

    return {
      minX: isFinite(minX) ? minX : 0,
      minY: isFinite(minY) ? minY : 0,
      maxX: isFinite(maxX) ? maxX : 1,
      maxY: isFinite(maxY) ? maxY : 1
    };
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
