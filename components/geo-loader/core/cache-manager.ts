import { Feature, FeatureCollection } from 'geojson';
import { CoordinatePoint } from '../types/coordinates';
import { geoErrorManager } from './error-manager';
import { ErrorSeverity } from '../../../types/errors';

export interface CacheOptions {
  /** Maximum size of transformation cache */
  maxTransformationCacheSize?: number;
  /** Maximum size of preview cache */
  maxPreviewCacheSize?: number;
  /** Time-to-live for cached items in milliseconds */
  ttlMs?: number;
}

import { PreviewResult } from '../preview/preview-manager';

interface CachedPreviewResult extends PreviewResult {
  timestamp: number;
}

interface CacheStats {
  transformationCacheSize: number;
  previewCacheSize: number;
  transformationHits: number;
  transformationMisses: number;
  previewHits: number;
  previewMisses: number;
}

/**
 * Manages caching for coordinate transformations and preview generation
 */
export class CacheManager {
  private static instance: CacheManager;
  private transformationCache: Map<string, { point: CoordinatePoint; timestamp: number }>;
  private previewCache: Map<string, CachedPreviewResult>;
  private readonly options: Required<CacheOptions>;
  private stats: CacheStats;

  private readonly DEFAULT_MAX_TRANSFORMATION_CACHE_SIZE = 10000;
  private readonly DEFAULT_MAX_PREVIEW_CACHE_SIZE = 100;
  private readonly DEFAULT_TTL = 24 * 60 * 60 * 1000; // 24 hours

  private constructor(options: CacheOptions = {}) {
    this.options = {
      maxTransformationCacheSize: options.maxTransformationCacheSize || this.DEFAULT_MAX_TRANSFORMATION_CACHE_SIZE,
      maxPreviewCacheSize: options.maxPreviewCacheSize || this.DEFAULT_MAX_PREVIEW_CACHE_SIZE,
      ttlMs: options.ttlMs || this.DEFAULT_TTL
    };

    this.transformationCache = new Map();
    this.previewCache = new Map();
    this.stats = this.createStats();
  }

  public static getInstance(options?: CacheOptions): CacheManager {
    if (!this.instance) {
      this.instance = new CacheManager(options);
    }
    return this.instance;
  }

  private createStats(): CacheStats {
    return {
      transformationCacheSize: 0,
      previewCacheSize: 0,
      transformationHits: 0,
      transformationMisses: 0,
      previewHits: 0,
      previewMisses: 0
    };
  }

  private getCacheKey(point: CoordinatePoint, fromSystem: string, toSystem: string): string {
    return `${fromSystem}:${toSystem}:${point.x}:${point.y}`;
  }

  private getPreviewKey(fileId: string, options: Record<string, unknown>): string {
    return `${fileId}:${JSON.stringify(options)}`;
  }

  /**
   * Get cached transformation result
   */
  public getCachedTransformation(
    point: CoordinatePoint,
    fromSystem: string,
    toSystem: string
  ): CoordinatePoint | null {
    const key = this.getCacheKey(point, fromSystem, toSystem);
    const cached = this.transformationCache.get(key);

    if (!cached) {
      this.stats.transformationMisses++;
      return null;
    }

    // Check TTL
    if (Date.now() - cached.timestamp > this.options.ttlMs) {
      this.transformationCache.delete(key);
      this.stats.transformationMisses++;
      return null;
    }

    this.stats.transformationHits++;
    return cached.point;
  }

  /**
   * Cache transformation result
   */
  public cacheTransformation(
    point: CoordinatePoint,
    fromSystem: string,
    toSystem: string,
    result: CoordinatePoint
  ): void {
    const key = this.getCacheKey(point, fromSystem, toSystem);

    // Check cache size limit
    if (this.transformationCache.size >= this.options.maxTransformationCacheSize) {
      // Remove oldest entries (25% of cache)
      const entriesToRemove = Math.floor(this.options.maxTransformationCacheSize * 0.25);
      const entries = Array.from(this.transformationCache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp)
        .slice(0, entriesToRemove);

      entries.forEach(([k]) => this.transformationCache.delete(k));

      geoErrorManager.addError(
        'cache_manager',
        'TRANSFORMATION_CACHE_PRUNED',
        `Pruned ${entriesToRemove} entries from transformation cache`,
        ErrorSeverity.INFO,
        { cacheSize: this.transformationCache.size, removedEntries: entriesToRemove }
      );
    }

    this.transformationCache.set(key, {
      point: result,
      timestamp: Date.now()
    });
    this.stats.transformationCacheSize = this.transformationCache.size;
  }

  /**
   * Get cached preview result
   */
  public getCachedPreview(
    fileId: string,
    options: Record<string, unknown>
  ): CachedPreviewResult | null {
    const key = this.getPreviewKey(fileId, options);
    const cached = this.previewCache.get(key);

    if (!cached) {
      this.stats.previewMisses++;
      return null;
    }

    // Check TTL
    if (Date.now() - cached.timestamp > this.options.ttlMs) {
      this.previewCache.delete(key);
      this.stats.previewMisses++;
      return null;
    }

    this.stats.previewHits++;
    return cached;
  }

  /**
   * Cache preview result
   */
  public cachePreview(
    fileId: string,
    options: Record<string, unknown>,
    result: PreviewResult
  ): void {
    const key = this.getPreviewKey(fileId, options);

    // Check cache size limit
    if (this.previewCache.size >= this.options.maxPreviewCacheSize) {
      // Remove oldest entries (25% of cache)
      const entriesToRemove = Math.floor(this.options.maxPreviewCacheSize * 0.25);
      const entries = Array.from(this.previewCache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp)
        .slice(0, entriesToRemove);

      entries.forEach(([k]) => this.previewCache.delete(k));

      geoErrorManager.addError(
        'cache_manager',
        'PREVIEW_CACHE_PRUNED',
        `Pruned ${entriesToRemove} entries from preview cache`,
        ErrorSeverity.INFO,
        { cacheSize: this.previewCache.size, removedEntries: entriesToRemove }
      );
    }

    this.previewCache.set(key, {
      ...result,
      timestamp: Date.now()
    });
    this.stats.previewCacheSize = this.previewCache.size;
  }

  /**
   * Clear all caches
   */
  public clear(): void {
    this.transformationCache.clear();
    this.previewCache.clear();
    this.stats = this.createStats();
  }

  /**
   * Clear expired cache entries
   */
  public clearExpired(): void {
    const now = Date.now();

    // Clear expired transformations
    for (const [key, value] of this.transformationCache.entries()) {
      if (now - value.timestamp > this.options.ttlMs) {
        this.transformationCache.delete(key);
      }
    }

    // Clear expired previews
    for (const [key, value] of this.previewCache.entries()) {
      if (now - value.timestamp > this.options.ttlMs) {
        this.previewCache.delete(key);
      }
    }

    this.stats.transformationCacheSize = this.transformationCache.size;
    this.stats.previewCacheSize = this.previewCache.size;
  }

  /**
   * Get cache statistics
   */
  public getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Get cache hit rates
   */
  public getHitRates(): { transformation: number; preview: number } {
    const transformationTotal = this.stats.transformationHits + this.stats.transformationMisses;
    const previewTotal = this.stats.previewHits + this.stats.previewMisses;

    return {
      transformation: transformationTotal > 0 ? 
        this.stats.transformationHits / transformationTotal : 0,
      preview: previewTotal > 0 ? 
        this.stats.previewHits / previewTotal : 0
    };
  }
}

// Export singleton instance
export const cacheManager = CacheManager.getInstance();
