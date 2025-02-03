import { Position } from 'geojson';
import { CoordinateSystem } from '../../types/coordinates';
import { LogManager } from '../logging/log-manager';

export interface CacheEntry {
  transformer: (coord: Position) => Position;
  lastUsed: number;
  hits: number;
}

export interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  oldestEntry: number;
  newestEntry: number;
}

export class TransformationCache {
  private static instance: TransformationCache;
  private readonly logger = LogManager.getInstance();
  private readonly cache = new Map<string, CacheEntry>();
  private readonly CACHE_LIFETIME = 5 * 60 * 1000; // 5 minutes
  private lastCacheClear = Date.now();
  private hits = 0;
  private misses = 0;

  private constructor() {}

  public static getInstance(): TransformationCache {
    if (!TransformationCache.instance) {
      TransformationCache.instance = new TransformationCache();
    }
    return TransformationCache.instance;
  }

  /**
   * Get a transformer from the cache
   */
  public get(from: CoordinateSystem, to: CoordinateSystem): CacheEntry | undefined {
    const key = this.getCacheKey(from, to);
    
    if (this.shouldClearCache()) {
      this.clear();
    }

    const entry = this.cache.get(key);
    if (entry) {
      entry.lastUsed = Date.now();
      entry.hits++;
      this.hits++;
      return entry;
    }

    this.misses++;
    return undefined;
  }

  /**
   * Set a transformer in the cache
   */
  public set(
    from: CoordinateSystem,
    to: CoordinateSystem,
    transformer: (coord: Position) => Position
  ): void {
    const key = this.getCacheKey(from, to);
    
    this.cache.set(key, {
      transformer,
      lastUsed: Date.now(),
      hits: 0
    });

    this.logger.debug('Added transformer to cache:', JSON.stringify({
      from,
      to,
      cacheSize: this.cache.size
    }));
  }

  /**
   * Get cache statistics
   */
  public getStats(): CacheStats {
    let oldestEntry = Date.now();
    let newestEntry = 0;

    this.cache.forEach(entry => {
      oldestEntry = Math.min(oldestEntry, entry.lastUsed);
      newestEntry = Math.max(newestEntry, entry.lastUsed);
    });

    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      oldestEntry,
      newestEntry
    };
  }

  /**
   * Clear entries older than cache lifetime
   */
  public clearStaleEntries(): void {
    const now = Date.now();
    const staleThreshold = now - this.CACHE_LIFETIME;

    let staleCount = 0;
    this.cache.forEach((entry, key) => {
      if (entry.lastUsed < staleThreshold) {
        this.cache.delete(key);
        staleCount++;
      }
    });

    if (staleCount > 0) {
      this.logger.debug('Cleared stale cache entries:', JSON.stringify({
        clearedCount: staleCount,
        remainingSize: this.cache.size
      }));
    }
  }

  /**
   * Clear all cache entries
   */
  public clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    this.lastCacheClear = Date.now();
    this.hits = 0;
    this.misses = 0;

    this.logger.debug('Cleared transformation cache:', JSON.stringify({
      clearedEntries: size
    }));
  }

  private getCacheKey(from: CoordinateSystem, to: CoordinateSystem): string {
    return `${from}:${to}`;
  }

  private shouldClearCache(): boolean {
    const now = Date.now();
    return now - this.lastCacheClear > this.CACHE_LIFETIME;
  }
} 