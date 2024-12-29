import { FeatureCollection, Feature } from 'geojson';
import { CoordinateSystem } from './coordinates';

export interface CacheKey {
  viewportBounds?: [number, number, number, number];
  visibleLayers: string[];
}

export interface CachedPreviewResult {
  features: {
    type: 'FeatureCollection';
    features: Feature[];
  };
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
