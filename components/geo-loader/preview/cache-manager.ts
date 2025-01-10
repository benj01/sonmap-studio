import { PreviewCollectionResult } from './types';

export class PreviewCacheManager {
  private readonly CACHE_TTL: number;
  private collectionsCache: Map<string, PreviewCollectionResult>;

  constructor(cacheTTL: number = 5 * 60 * 1000) { // Default 5 minutes
    this.CACHE_TTL = cacheTTL;
    this.collectionsCache = new Map();
  }

  get(key: string): PreviewCollectionResult | undefined {
    const cached = this.collectionsCache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      console.debug('[PreviewCacheManager] Cache hit:', {
        key,
        age: Date.now() - cached.timestamp
      });
      return cached;
    }
    console.debug('[PreviewCacheManager] Cache miss:', { key });
    return undefined;
  }

  set(key: string, value: PreviewCollectionResult): void {
    console.debug('[PreviewCacheManager] Setting cache:', {
      key,
      features: value.totalCount
    });
    this.collectionsCache.set(key, value);
  }

  invalidate(reason?: string): void {
    const cacheSize = this.collectionsCache.size;
    const cacheKeys = Array.from(this.collectionsCache.keys());
    
    console.debug('[PreviewCacheManager] Invalidating cache:', {
      reason,
      previousSize: cacheSize,
      keys: cacheKeys,
      oldestEntry: cacheKeys.length > 0 ? 
        Math.min(...Array.from(this.collectionsCache.values()).map(v => v.timestamp)) : 
        null
    });
    
    this.collectionsCache.clear();
  }

  cleanExpired(): void {
    const now = Date.now();
    let expiredCount = 0;
    
    for (const [key, value] of this.collectionsCache.entries()) {
      if (now - value.timestamp > this.CACHE_TTL) {
        console.debug('[PreviewCacheManager] Removing expired cache entry:', key);
        this.collectionsCache.delete(key);
        expiredCount++;
      }
    }

    if (expiredCount > 0) {
      console.debug('[PreviewCacheManager] Cleaned expired entries:', {
        removed: expiredCount,
        remaining: this.collectionsCache.size
      });
    }
  }

  getCacheKey(coordinateSystem: string, visibleLayers: string[]): string {
    return `preview:${coordinateSystem}:${visibleLayers.sort().join(',')}`;
  }
}
