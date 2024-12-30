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

export interface CachedPreviewResult {
  features: CachedFeatureCollection;
  viewportBounds?: [number, number, number, number];
  layers: string[];
  featureCount: number;
  coordinateSystem: CoordinateSystem;
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
}

export interface CacheManager {
  getCachedPreview(key: string, params: CacheKey): CachedPreviewResult | null;
  cachePreview(key: string, params: CacheKey, result: CachedPreviewResult): void;
  clear(): void;
}
