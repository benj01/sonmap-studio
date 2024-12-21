import { Feature } from 'geojson';
import { geoErrorManager } from './error-manager';
import { ErrorSeverity } from '../../../types/errors';

export interface FeatureManagerOptions {
  /** Maximum number of features per chunk */
  chunkSize?: number;
  /** Maximum memory usage in MB */
  maxMemoryMB?: number;
  /** Whether to track memory usage */
  monitorMemory?: boolean;
}

export interface FeatureStats {
  totalFeatures: number;
  chunkCount: number;
  memoryUsage: {
    heapUsed: number | null;
    heapTotal: number | null;
  };
}

/**
 * Manages feature storage with memory-efficient chunking
 */
export class FeatureManager {
  private chunks: Feature[][] = [];
  private currentChunk: Feature[] = [];
  private readonly options: Required<FeatureManagerOptions>;
  private readonly DEFAULT_CHUNK_SIZE = 1000;
  private readonly DEFAULT_MAX_MEMORY = 512; // 512MB
  private readonly MEMORY_CHECK_INTERVAL = 1000; // 1s
  private lastMemoryCheck = 0;
  private totalFeatures = 0;

  constructor(options: FeatureManagerOptions = {}) {
    this.options = {
      chunkSize: options.chunkSize || this.DEFAULT_CHUNK_SIZE,
      maxMemoryMB: options.maxMemoryMB || this.DEFAULT_MAX_MEMORY,
      monitorMemory: options.monitorMemory ?? true
    };
  }

  /**
   * Add features to storage
   * @throws Error if memory limit is exceeded
   */
  public async addFeatures(features: Feature[]): Promise<void> {
    for (const feature of features) {
      this.currentChunk.push(feature);
      this.totalFeatures++;

      if (this.currentChunk.length >= this.options.chunkSize) {
        await this.finalizeCurrentChunk();
      }
    }

    // Check memory usage after batch
    if (this.options.monitorMemory) {
      await this.checkMemoryUsage();
    }
  }

  /**
   * Add a single feature to storage
   * @throws Error if memory limit is exceeded
   */
  public async addFeature(feature: Feature): Promise<void> {
    this.currentChunk.push(feature);
    this.totalFeatures++;

    if (this.currentChunk.length >= this.options.chunkSize) {
      await this.finalizeCurrentChunk();
    }

    // Check memory periodically
    if (this.options.monitorMemory) {
      const now = Date.now();
      if (now - this.lastMemoryCheck >= this.MEMORY_CHECK_INTERVAL) {
        await this.checkMemoryUsage();
        this.lastMemoryCheck = now;
      }
    }
  }

  private async finalizeCurrentChunk(): Promise<void> {
    if (this.currentChunk.length > 0) {
      this.chunks.push([...this.currentChunk]);
      this.currentChunk = [];
    }
  }

  private async checkMemoryUsage(): Promise<void> {
    // Try to get memory usage from Chrome's non-standard API
    const memory = (performance as any).memory;
    let usedMemoryMB = 0;

    if (memory && typeof memory.usedJSHeapSize === 'number') {
      usedMemoryMB = memory.usedJSHeapSize / 1024 / 1024;
    } else {
      // Fallback: estimate memory based on feature count
      // Assume average feature size of 1KB
      usedMemoryMB = (this.totalFeatures * 1) / 1024;
    }

    if (usedMemoryMB > this.options.maxMemoryMB) {
      geoErrorManager.addError(
        'feature_manager',
        'MEMORY_LIMIT_EXCEEDED',
        `Memory usage (${Math.round(usedMemoryMB)}MB) exceeds limit (${this.options.maxMemoryMB}MB)`,
        ErrorSeverity.CRITICAL,
        { 
          memoryUsage: usedMemoryMB,
          limit: this.options.maxMemoryMB,
          totalFeatures: this.totalFeatures,
          chunkCount: this.chunks.length
        }
      );
      throw new Error('Memory limit exceeded');
    }
  }

  /**
   * Get all features as an async generator
   */
  public async *getFeatures(): AsyncGenerator<Feature> {
    // First yield any features in the current chunk
    for (const feature of this.currentChunk) {
      yield feature;
    }

    // Then yield features from finalized chunks
    for (const chunk of this.chunks) {
      for (const feature of chunk) {
        yield feature;
      }
    }
  }

  /**
   * Get features from a specific chunk
   */
  public getChunk(index: number): Feature[] | null {
    if (index >= 0 && index < this.chunks.length) {
      return [...this.chunks[index]];
    }
    return null;
  }

  /**
   * Get current statistics
   */
  public getStats(): FeatureStats {
    // Try to get memory usage from Chrome's non-standard API
    const memory = (performance as any).memory;
    let heapUsed = null;
    let heapTotal = null;

    if (memory && typeof memory.usedJSHeapSize === 'number') {
      heapUsed = memory.usedJSHeapSize;
      heapTotal = memory.totalJSHeapSize;
    }

    return {
      totalFeatures: this.totalFeatures,
      chunkCount: this.chunks.length + (this.currentChunk.length > 0 ? 1 : 0),
      memoryUsage: {
        heapUsed,
        heapTotal
      }
    };
  }

  /**
   * Clear all stored features
   */
  public clear(): void {
    this.chunks = [];
    this.currentChunk = [];
    this.totalFeatures = 0;
  }

  /**
   * Get total number of features
   */
  public getFeatureCount(): number {
    return this.totalFeatures;
  }

  /**
   * Get number of chunks
   */
  public getChunkCount(): number {
    return this.chunks.length + (this.currentChunk.length > 0 ? 1 : 0);
  }

  /**
   * Check if manager has any features
   */
  public isEmpty(): boolean {
    return this.totalFeatures === 0;
  }

  /**
   * Finalize current chunk if any features pending
   */
  public async finalize(): Promise<void> {
    await this.finalizeCurrentChunk();
  }

  /**
   * Get memory usage in MB
   */
  public getMemoryUsageMB(): number {
    const memory = (performance as any).memory;
    if (memory && typeof memory.usedJSHeapSize === 'number') {
      return memory.usedJSHeapSize / 1024 / 1024;
    }
    // Fallback: estimate based on feature count
    return (this.totalFeatures * 1) / 1024; // Assume 1KB per feature
  }
}
