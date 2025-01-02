import { FeatureCollection, Feature } from 'geojson';
import { CoordinateSystem } from './coordinates';

export interface CacheKey {
  viewportBounds?: [number, number, number, number];
  visibleLayers: string[];
}

export interface CachedFeatureCollection {
  type: 'FeatureCollection';
  features: Feature[];
}

export interface PreviewCollections {
  points: FeatureCollection;
  lines: FeatureCollection;
  polygons: FeatureCollection;
  bounds?: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  totalCount: number;
  visibleCount?: number; // Optional to maintain backward compatibility
}

export interface CachedPreviewResult {
  features: CachedFeatureCollection;
  viewportBounds?: [number, number, number, number];
  layers: string[];
  featureCount: number;
  coordinateSystem: CoordinateSystem;
  version?: number; // Add version for cache invalidation
}

export interface CacheKeyParams extends CacheKey {
  coordinateSystem?: CoordinateSystem;
  version?: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
}

export interface CacheManager {
  getCachedPreview(key: string, params: CacheKeyParams): CachedPreviewResult | null;
  cachePreview(key: string, params: CacheKeyParams, result: CachedPreviewResult): void;
  clear(): void;
}
