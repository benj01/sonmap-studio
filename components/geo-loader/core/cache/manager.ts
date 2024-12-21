import { ProcessorResult } from '../processors/base/types';
import {
  CacheEntry,
  CacheEntryData,
  CacheEntryMetadata,
  CacheManagerOptions,
  CacheQueryOptions,
  CacheStorage
} from './types';

/**
 * Manages caching of processed geo data
 */
export class CacheManager {
  private storage: CacheStorage;
  private options: Required<CacheManagerOptions>;

  constructor(storage: CacheStorage, options: CacheManagerOptions = {}) {
    this.storage = storage;
    this.options = {
      enabled: true,
      validate: true,
      maxSize: 1024 * 1024 * 1024, // 1GB
      maxEntries: 1000,
      ttl: 24 * 60 * 60 * 1000, // 24 hours
      compress: true,
      keyGenerator: (file: File, options: Record<string, unknown>) => {
        const optionsString = JSON.stringify(options);
        return `${file.name}-${file.size}-${file.lastModified}-${optionsString}`;
      },
      onCacheHit: () => {},
      onCacheMiss: () => {},
      onError: () => {},
      ...options
    };
  }

  /**
   * Cache processor result
   */
  async cacheResult(
    file: File,
    result: ProcessorResult,
    processingOptions: Record<string, unknown>
  ): Promise<CacheEntry> {
    if (!this.options.enabled) {
      throw new Error('Caching is disabled');
    }

    const entry = this.createEntry(file, result, processingOptions);
    
    // Enforce cache limits before adding new entry
    await this.enforceLimits();
    
    // Store entry
    await this.storage.set(entry);
    
    return entry;
  }

  /**
   * Get cached result
   */
  async getCachedResult(
    file: File,
    processingOptions: Record<string, unknown>,
    options: CacheQueryOptions = {}
  ): Promise<CacheEntry | null> {
    if (!this.options.enabled) {
      return null;
    }

    const id = this.generateCacheId(file, processingOptions);
    const entry = await this.storage.get(id, {
      updateAccess: true,
      validateTTL: this.options.validate,
      decompress: this.options.compress,
      ...options
    });

    if (entry) {
      if (this.isEntryValid(entry, file)) {
        this.options.onCacheHit?.(entry);
        return entry;
      } else {
        await this.storage.delete(id);
      }
    }

    this.options.onCacheMiss?.(id);
    return null;
  }

  /**
   * Check if result is cached
   */
  async hasCache(
    file: File,
    processingOptions: Record<string, unknown>
  ): Promise<boolean> {
    if (!this.options.enabled) {
      return false;
    }

    const id = this.generateCacheId(file, processingOptions);
    const entry = await this.storage.get(id, {
      updateAccess: false,
      validateTTL: this.options.validate
    });

    return entry !== null && this.isEntryValid(entry, file);
  }

  /**
   * Delete cached result
   */
  async deleteCache(
    file: File,
    processingOptions: Record<string, unknown>
  ): Promise<boolean> {
    if (!this.options.enabled) {
      return false;
    }

    const id = this.generateCacheId(file, processingOptions);
    return this.storage.delete(id);
  }

  /**
   * Clear all cached results
   */
  async clearCache(): Promise<void> {
    await this.storage.clear();
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    size: number;
    count: number;
    entries: CacheEntryMetadata[];
  }> {
    const [size, count, entries] = await Promise.all([
      this.storage.getSize(),
      this.storage.getCount(),
      this.storage.getAllMetadata()
    ]);

    return { size, count, entries };
  }

  /**
   * Create cache entry from processor result
   */
  private createEntry(
    file: File,
    result: ProcessorResult,
    processingOptions: Record<string, unknown>
  ): CacheEntry {
    const metadata: CacheEntryMetadata = {
      id: this.generateCacheId(file, processingOptions),
      fileName: file.name,
      fileSize: file.size,
      lastModified: file.lastModified,
      created: Date.now(),
      lastAccessed: Date.now(),
      accessCount: 0,
      processingOptions,
      statistics: result.statistics
    };

    const data: CacheEntryData = {
      features: result.features,
      bounds: result.bounds,
      layers: result.layers,
      coordinateSystem: result.coordinateSystem
    };

    return { metadata, data };
  }

  /**
   * Generate cache ID from file and options
   */
  private generateCacheId(
    file: File,
    processingOptions: Record<string, unknown>
  ): string {
    return this.options.keyGenerator(file, processingOptions);
  }

  /**
   * Check if cache entry is valid
   */
  private isEntryValid(entry: CacheEntry, file: File): boolean {
    if (!this.options.validate) {
      return true;
    }

    // Check if file has changed
    if (
      entry.metadata.fileSize !== file.size ||
      entry.metadata.lastModified !== file.lastModified
    ) {
      return false;
    }

    // Check TTL
    if (this.options.ttl > 0) {
      const age = Date.now() - entry.metadata.created;
      if (age > this.options.ttl) {
        return false;
      }
    }

    return true;
  }

  /**
   * Enforce cache limits by removing old entries
   */
  private async enforceLimits(): Promise<void> {
    const stats = await this.getStats();

    if (stats.count >= this.options.maxEntries || stats.size >= this.options.maxSize) {
      // Get all entries sorted by last accessed time
      const entries = stats.entries.sort((a, b) => a.lastAccessed - b.lastAccessed);

      // Remove oldest entries until within limits
      for (const entry of entries) {
        if (stats.count < this.options.maxEntries && stats.size < this.options.maxSize) {
          break;
        }

        await this.storage.delete(entry.id);
        stats.count--;
        stats.size -= entry.fileSize;
      }
    }
  }
}
