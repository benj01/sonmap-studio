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
  private features: GeoFeature[] = [];
  private visibleFeatures: GeoFeature[] = [];
  private visibleLayers: string[] = [];
  private readonly options: Required<FeatureManagerOptions>;
  private readonly DEFAULT_CHUNK_SIZE = 1000;
  private readonly DEFAULT_MAX_MEMORY = 512; // 512MB
  private readonly MEMORY_CHECK_INTERVAL = 1000; // 1s
  private lastMemoryCheck = 0;
  private totalFeatures = 0;

  constructor(options: FeatureManagerOptions = {}) {
    console.debug('[DEBUG] Creating new FeatureManager');
    this.options = {
      chunkSize: options.chunkSize || this.DEFAULT_CHUNK_SIZE,
      maxMemoryMB: options.maxMemoryMB || this.DEFAULT_MAX_MEMORY,
      monitorMemory: options.monitorMemory ?? true
    };
  }

  async setFeatures(collection: FeatureCollection) {
    console.debug('[DEBUG] Setting features:', { count: collection.features.length });
    const geoFeatures: GeoFeature[] = collection.features.map(feature => ({
      ...feature,
      properties: {
        ...feature.properties,
        layer: feature.properties?.layer || '0',
        type: feature.properties?.type || feature.geometry.type
      }
    }));
    this.features = geoFeatures;
    this.updateVisibleFeatures();
  }

  setVisibleLayers(layers: string[]) {
    console.debug('[DEBUG] Setting visible layers:', layers);
    this.visibleLayers = layers;
    this.updateVisibleFeatures();
  }

  private updateVisibleFeatures() {
    console.debug('[DEBUG] Updating visible features');
    this.visibleFeatures = this.features.filter(feature => {
      const layer = feature.properties?.layer;
      return !layer || this.visibleLayers.includes(layer);
    });
    console.debug('[DEBUG] Visible features updated:', { count: this.visibleFeatures.length });
  }

  getVisibleFeatures(): GeoFeature[] {
    return this.visibleFeatures;
  }

  getAllFeatures(): GeoFeature[] {
    return this.features;
  }

  getFeatureCount(): number {
    return this.features.length;
  }

  getVisibleFeatureCount(): number {
    return this.visibleFeatures.length;
  }

  getVisibleLayers(): string[] {
    return [...this.visibleLayers];
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

  async addFeatures(features: Feature[] | GeoFeature[]): Promise<void> {
    for (const feature of features) {
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
        // Give the UI a chance to update to avoid freezing
        await new Promise(r => setTimeout(r, 0));
      }
    }

    // Check memory usage after batch
    if (this.options.monitorMemory) {
      await this.checkMemoryUsage();
    }
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

  async *getFeatures(): AsyncGenerator<GeoFeature> {
    // First yield any features in the current chunk
    for (const feature of this.features) {
      yield feature;
    }

    // Then yield features from finalized chunks
    // for (const chunk of this.chunks) {
    //   for (const feature of chunk) {
    //     yield feature;
    //   }
    // }
  }

  getChunk(index: number): GeoFeature[] | null {
    // if (index >= 0 && index < this.chunks.length) {
    //   return [...this.chunks[index]];
    // }
    return null;
  }

  getStats(): FeatureStats {
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
      chunkCount: 0 + (this.features.length > 0 ? 1 : 0),
      memoryUsage: {
        heapUsed,
        heapTotal
      }
    };
  }

  getMemoryUsageMB(): number {
    const memory = (performance as any).memory;
    if (memory && typeof memory.usedJSHeapSize === 'number') {
      return memory.usedJSHeapSize / 1024 / 1024;
    }
    // Fallback: estimate based on feature count
    return (this.totalFeatures * 1) / 1024; // 1KB/feature
  }
}
