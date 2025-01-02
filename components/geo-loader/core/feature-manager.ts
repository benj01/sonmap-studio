import { Feature, FeatureCollection } from 'geojson';
import { geoErrorManager } from './error-manager';
import { ErrorSeverity } from '../../../types/errors';
import { GeoFeature } from '../../../types/geo';

export interface FeatureManagerOptions {
  /** Maximum number of features per chunk */
  chunkSize?: number;
  /** Maximum memory usage in MB */
  maxMemoryMB?: number;
  /** Whether to track memory usage */
  monitorMemory?: boolean;
  /** Whether to use streaming mode for large datasets */
  streamingMode?: boolean;
}

export interface FeatureStats {
  totalFeatures: number;
  chunkCount: number;
  memoryUsage: {
    heapUsed: number | null;
    heapTotal: number | null;
  };
  streamingActive: boolean;
}

interface FeatureChunk {
  features: GeoFeature[];
  index: number;
  timestamp: number;
}

/**
 * Manages feature storage with memory-efficient chunking and streaming support
 */
export class FeatureManager {
  private features: GeoFeature[] = [];
  private chunks: FeatureChunk[] = [];
  private visibleFeatures: GeoFeature[] = [];
  private visibleLayers: string[] = [];
  private readonly options: Required<FeatureManagerOptions>;
  private readonly DEFAULT_CHUNK_SIZE = 1000;
  private readonly DEFAULT_MAX_MEMORY = 512; // 512MB
  private readonly MEMORY_CHECK_INTERVAL = 1000; // 1s
  private readonly CHUNK_TTL = 5 * 60 * 1000; // 5 minutes
  private lastMemoryCheck = 0;
  private totalFeatures = 0;
  private streamingMode = false;
  private featureIndex: Map<string, Set<number>> = new Map(); // layer -> chunk indices

  constructor(options: FeatureManagerOptions = {}) {
    console.debug('[FeatureManager] Initializing with options:', {
      providedOptions: options,
      defaultChunkSize: this.DEFAULT_CHUNK_SIZE,
      defaultMaxMemory: this.DEFAULT_MAX_MEMORY
    });

    this.options = {
      chunkSize: options.chunkSize || this.DEFAULT_CHUNK_SIZE,
      maxMemoryMB: options.maxMemoryMB || this.DEFAULT_MAX_MEMORY,
      monitorMemory: options.monitorMemory ?? true,
      streamingMode: options.streamingMode ?? false
    };

    console.debug('[FeatureManager] Initialized with configuration:', {
      finalOptions: this.options,
      streamingMode: this.streamingMode,
      memoryMonitoring: this.options.monitorMemory
    });

    this.streamingMode = this.options.streamingMode;
  }

  async setFeatures(collection: FeatureCollection) {
    console.debug('[FeatureManager] Setting features:', { 
      count: collection.features.length,
      geometryTypes: collection.features.reduce((acc, f) => {
        const type = f.geometry?.type || 'unknown';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      streamingMode: this.streamingMode
    });

    await this.clear();
    await this.addFeatures(collection.features);
  }

  /**
   * Set visible layers and update visible features
   */
  public setVisibleLayers(layers: string[]) {
    console.debug('[FeatureManager] Setting visible layers:', {
      current: this.visibleLayers,
      new: layers,
      allLayers: Array.from(this.featureIndex.keys())
    });

    // If no layers specified, show all layers
    if (!layers || layers.length === 0) {
      this.visibleLayers = Array.from(this.featureIndex.keys());
    } else {
      this.visibleLayers = layers;
    }

    // Update visible features
    this.updateVisibleFeatures();

    console.debug('[FeatureManager] Updated visible layers:', {
      visibleLayers: this.visibleLayers,
      visibleFeatureCount: this.visibleFeatures.length
    });
  }

  /**
   * Update visible features based on current visible layers
   */
  private async updateVisibleFeatures() {
    console.debug('[FeatureManager] Updating visible features');
    
    this.visibleFeatures = [];
    const visibleChunks = new Set<number>();

    // If no layers are specified as visible, show all features
    if (this.visibleLayers.length === 0) {
      console.debug('[FeatureManager] No visible layers specified, showing all features');
      this.visibleFeatures = [...this.features];
      return;
    }

    // Collect all chunk indices that contain features from visible layers
    this.visibleLayers.forEach(layer => {
      const chunkIndices = this.featureIndex.get(layer);
      if (chunkIndices) {
        chunkIndices.forEach(index => visibleChunks.add(index));
      }
    });

    // Get features from visible chunks that belong to visible layers
    for (const chunkIndex of visibleChunks) {
      const chunk = this.chunks[chunkIndex];
      if (chunk) {
        const visibleFeaturesInChunk = chunk.features.filter(feature => 
          feature.properties?.layer && 
          this.visibleLayers.includes(feature.properties.layer)
        );
        this.visibleFeatures.push(...visibleFeaturesInChunk);
      }
    }

    console.debug('[FeatureManager] Visible features updated:', {
      totalFeatures: this.features.length,
      visibleFeatures: this.visibleFeatures.length,
      visibleLayers: this.visibleLayers,
      visibleChunks: visibleChunks.size
    });
  }

  /**
   * Get visible features
   */
  public async getVisibleFeatures(): Promise<GeoFeature[]> {
    console.debug('[FeatureManager] Getting visible features:', {
      totalFeatures: this.features.length,
      visibleFeatures: this.visibleFeatures.length,
      visibleLayers: this.visibleLayers
    });

    // If no layers are specified as visible, return all features
    if (this.visibleLayers.length === 0) {
      console.debug('[FeatureManager] No visible layers specified, returning all features');
      return this.features;
    }

    return this.visibleFeatures;
  }

  async addFeatures(features: Feature[] | GeoFeature[]): Promise<void> {
    const batchSize = this.options.chunkSize;
    let batch: GeoFeature[] = [];

    for (const feature of features) {
      const geoFeature: GeoFeature = {
        ...feature,
        properties: {
          ...feature.properties,
          layer: feature.properties?.layer || '0',
          type: feature.properties?.type || feature.geometry.type
        }
      };
      
      batch.push(geoFeature);
      this.totalFeatures++;

      if (batch.length >= batchSize) {
        await this.processBatch(batch);
        batch = [];
        await new Promise(r => setTimeout(r, 0)); // UI update opportunity
      }
    }

    if (batch.length > 0) {
      await this.processBatch(batch);
    }

    if (this.options.monitorMemory) {
      await this.checkMemoryUsage();
    }
  }

  private async processBatch(batch: GeoFeature[]): Promise<void> {
    console.debug('[FeatureManager] Processing feature batch:', {
      batchSize: batch.length,
      mode: this.streamingMode ? 'streaming' : 'memory',
      currentChunks: this.chunks.length,
      memoryUsage: await this.getMemoryUsageMB()
    });

    if (this.streamingMode) {
      const chunk: FeatureChunk = {
        features: batch,
        index: this.chunks.length,
        timestamp: Date.now()
      };
      this.chunks.push(chunk);
      this.updateFeatureIndex(chunk);

      console.debug('[FeatureManager] Created new chunk:', {
        chunkIndex: chunk.index,
        featureCount: chunk.features.length,
        timestamp: new Date(chunk.timestamp).toISOString()
      });
    } else {
      this.features.push(...batch);
    }
    
    await this.cleanupOldChunks();
  }

  private async cleanupOldChunks(): Promise<void> {
    if (!this.streamingMode) return;

    const now = Date.now();
    const oldChunks = this.chunks.filter(chunk => 
      now - chunk.timestamp > this.CHUNK_TTL
    );

    if (oldChunks.length > 0) {
      console.debug('[FeatureManager] Cleaning up old chunks:', {
        totalChunks: this.chunks.length,
        expiredChunks: oldChunks.length,
        oldestChunkAge: Math.round((now - Math.min(...oldChunks.map(c => c.timestamp))) / 1000),
        memoryBefore: await this.getMemoryUsageMB()
      });

      for (const chunk of oldChunks) {
        // Remove from index
        for (const feature of chunk.features) {
          const layer = feature.properties?.layer || '0';
          const indices = this.featureIndex.get(layer);
          if (indices) {
            indices.delete(chunk.index);
            if (indices.size === 0) {
              this.featureIndex.delete(layer);
            }
          }
        }
        
        // Clear chunk data
        this.chunks[chunk.index] = {
          ...chunk,
          features: []
        };
      }

      console.debug('[FeatureManager] Chunk cleanup completed:', {
        remainingChunks: this.chunks.filter(c => c.features.length > 0).length,
        memoryAfter: await this.getMemoryUsageMB(),
        layerIndices: Array.from(this.featureIndex.entries()).map(([layer, indices]) => ({
          layer,
          indexCount: indices.size
        }))
      });

      // Trigger garbage collection if available
      if (global.gc) {
        const memoryBefore = await this.getMemoryUsageMB();
        global.gc();
        const memoryAfter = await this.getMemoryUsageMB();
        console.debug('[FeatureManager] Garbage collection completed:', {
          memoryBefore,
          memoryAfter,
          reduction: Math.round((memoryBefore - memoryAfter) * 100) / 100
        });
      }
    }
  }

  async *getFeatures(): AsyncGenerator<GeoFeature> {
    // First yield any features in the current chunk
    for (const feature of this.features) {
      yield feature;
    }

    // Then yield features from chunks
    for (const chunk of this.chunks) {
      for (const feature of chunk.features) {
        yield feature;
      }
    }
  }

  getChunk(index: number): GeoFeature[] | null {
    if (index >= 0 && index < this.chunks.length) {
      return [...this.chunks[index].features];
    }
    return null;
  }

  async getStats(): Promise<FeatureStats> {
    const memory = (performance as any).memory;
    let heapUsed = null;
    let heapTotal = null;

    if (memory && typeof memory.usedJSHeapSize === 'number') {
      heapUsed = memory.usedJSHeapSize;
      heapTotal = memory.totalJSHeapSize;
    }

    const stats = {
      totalFeatures: this.totalFeatures,
      chunkCount: this.chunks.length + (this.features.length > 0 ? 1 : 0),
      memoryUsage: {
        heapUsed,
        heapTotal
      },
      streamingActive: this.streamingMode
    };

    console.debug('[FeatureManager] Current stats:', {
      ...stats,
      visibleFeatures: this.visibleFeatures.length,
      activeChunks: this.chunks.filter(c => c.features.length > 0).length,
      layerStats: Array.from(this.featureIndex.entries()).map(([layer, indices]) => ({
        layer,
        chunkCount: indices.size
      })),
      memoryMB: await this.getMemoryUsageMB()
    });

    return stats;
  }

  getMemoryUsageMB(): number {
    const memory = (performance as any).memory;
    if (memory && typeof memory.usedJSHeapSize === 'number') {
      return memory.usedJSHeapSize / 1024 / 1024;
    }
    // Fallback: estimate based on feature count
    return (this.totalFeatures * 1) / 1024; // 1KB/feature
  }

  async addFeature(feature: Feature | GeoFeature): Promise<void> {
    // Convert Feature to GeoFeature if needed
    const geoFeature: GeoFeature = {
      ...feature,
      properties: {
        ...feature.properties,
        layer: feature.properties?.layer || '0',
        type: feature.properties?.type || feature.geometry.type
      }
    };

    this.features.push(geoFeature);
    this.totalFeatures++;

    if (this.features.length >= this.options.chunkSize) {
      await this.finalizeCurrentChunk();
      // Give the UI a chance to update
      await new Promise(r => setTimeout(r, 0));
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
    if (this.features.length > 0) {
      // this.chunks.push([...this.features]);
      this.features = [];
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
      // Assume average feature size of ~1KB
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
          chunkCount: 0
        }
      );
      throw new Error('Memory limit exceeded');
    }
  }

  clear() {
    console.debug('[DEBUG] Clearing feature manager');
    this.features = [];
    this.visibleFeatures = [];
    this.visibleLayers = [];
  }

  dispose() {
    console.debug('[DEBUG] Disposing feature manager');
    this.clear();
  }

  getAllFeatures(): GeoFeature[] {
    return [...this.features, ...this.chunks.flatMap(c => c.features)];
  }

  getVisibleFeatureCount(): number {
    return this.visibleFeatures.length;
  }
}
