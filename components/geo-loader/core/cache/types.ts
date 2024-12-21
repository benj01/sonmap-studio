import { Feature, FeatureCollection } from 'geojson';
import { ProcessorResult } from '../processors/base/types';

/**
 * Cache entry metadata
 */
export interface CacheEntryMetadata {
  /** Unique identifier for the cache entry */
  id: string;
  /** Original file name */
  fileName: string;
  /** File size in bytes */
  fileSize: number;
  /** File last modified timestamp */
  lastModified: number;
  /** Cache creation timestamp */
  created: number;
  /** Cache last accessed timestamp */
  lastAccessed: number;
  /** Number of times accessed */
  accessCount: number;
  /** Processing options used */
  processingOptions: Record<string, unknown>;
  /** Processing statistics */
  statistics: ProcessorResult['statistics'];
}

/**
 * Cache entry data
 */
export interface CacheEntryData {
  /** Processed features */
  features: FeatureCollection;
  /** Feature bounds */
  bounds: ProcessorResult['bounds'];
  /** Available layers */
  layers: string[];
  /** Coordinate system */
  coordinateSystem: ProcessorResult['coordinateSystem'];
}

/**
 * Complete cache entry
 */
export interface CacheEntry {
  metadata: CacheEntryMetadata;
  data: CacheEntryData;
}

/**
 * Cache storage options
 */
export interface CacheStorageOptions {
  /** Maximum cache size in bytes */
  maxSize?: number;
  /** Maximum number of entries */
  maxEntries?: number;
  /** Time-to-live in milliseconds */
  ttl?: number;
  /** Whether to compress cached data */
  compress?: boolean;
}

/**
 * Cache query options
 */
export interface CacheQueryOptions {
  /** Whether to update access timestamps */
  updateAccess?: boolean;
  /** Whether to validate entry TTL */
  validateTTL?: boolean;
  /** Whether to decompress data */
  decompress?: boolean;
}

/**
 * Cache storage interface
 */
export interface CacheStorage {
  /** Get entry by ID */
  get(id: string, options?: CacheQueryOptions): Promise<CacheEntry | null>;
  /** Set entry */
  set(entry: CacheEntry): Promise<void>;
  /** Delete entry by ID */
  delete(id: string): Promise<boolean>;
  /** Clear all entries */
  clear(): Promise<void>;
  /** Get all entry metadata */
  getAllMetadata(): Promise<CacheEntryMetadata[]>;
  /** Get current cache size */
  getSize(): Promise<number>;
  /** Get number of entries */
  getCount(): Promise<number>;
}

/**
 * Cache manager options
 */
export interface CacheManagerOptions extends CacheStorageOptions {
  /** Whether to enable caching */
  enabled?: boolean;
  /** Whether to validate cache entries */
  validate?: boolean;
  /** Custom cache key generator */
  keyGenerator?: (file: File, options: Record<string, unknown>) => string;
  /** Cache hit callback */
  onCacheHit?: (entry: CacheEntry) => void;
  /** Cache miss callback */
  onCacheMiss?: (id: string) => void;
  /** Cache error callback */
  onError?: (error: Error) => void;
}
