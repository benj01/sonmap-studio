import { Feature, FeatureCollection } from 'geojson';
import { BaseProcessor, ProcessorOptions, ProcessorResult } from '../processors/base-processor';
import { geoErrorManager } from './error-manager';
import { ErrorSeverity } from '../../../types/errors';
import { coordinateSystemManager } from './coordinate-system-manager';
import { COORDINATE_SYSTEMS } from '../types/coordinates';

export interface ProcessingContext {
  bytesProcessed: number;
  totalBytes: number;
  features: Feature[];
  errors: number;
  warnings: number;
  memoryUsage: {
    heapUsed: number | null;
    heapTotal: number | null;
  };
}

export interface StreamProcessorOptions extends ProcessorOptions {
  /** Size of each chunk in bytes */
  chunkSize?: number;
  /** Maximum memory usage in MB */
  maxMemoryMB?: number;
  /** Progress update interval in ms */
  progressInterval?: number;
  /** Whether to enable memory usage monitoring */
  monitorMemory?: boolean;
}

/**
 * Base class for processors that handle large files through streaming
 */
export abstract class StreamProcessor extends BaseProcessor {
  protected readonly DEFAULT_CHUNK_SIZE = 64 * 1024; // 64KB
  protected readonly DEFAULT_MAX_MEMORY = 512; // 512MB
  protected readonly DEFAULT_PROGRESS_INTERVAL = 250; // 250ms
  protected readonly MEMORY_CHECK_INTERVAL = 1000; // 1s

  protected options: StreamProcessorOptions;
  protected context: ProcessingContext;
  private lastProgressUpdate: number = 0;
  private lastMemoryCheck: number = 0;
  private processingCancelled: boolean = false;
  private featureCount: number = 0;

  constructor(options: StreamProcessorOptions = {}) {
    super(options);
    this.options = {
      chunkSize: this.DEFAULT_CHUNK_SIZE,
      maxMemoryMB: this.DEFAULT_MAX_MEMORY,
      progressInterval: this.DEFAULT_PROGRESS_INTERVAL,
      monitorMemory: true,
      ...options
    };
    this.context = this.createContext();
  }

  protected createContext(): ProcessingContext {
    return {
      bytesProcessed: 0,
      totalBytes: 0,
      features: [],
      errors: 0,
      warnings: 0,
      memoryUsage: {
        heapUsed: null,
        heapTotal: null
      }
    };
  }

  /**
   * Process a chunk of data
   * @throws Error if chunk processing fails
   */
  protected abstract processChunk(
    chunk: Buffer,
    context: ProcessingContext
  ): Promise<Feature[]>;

  /**
   * Create a readable stream from the input file
   */
  protected abstract createReadStream(
    file: File,
    options: StreamProcessorOptions
  ): ReadableStream<Buffer>;

  /**
   * Update progress if enough time has passed
   */
  protected updateProgress(): void {
    const now = Date.now();
    if (now - this.lastProgressUpdate >= (this.options.progressInterval || 0)) {
      const progress = this.context.totalBytes > 0
        ? this.context.bytesProcessed / this.context.totalBytes
        : 0;
      this.emitProgress(progress);
      this.lastProgressUpdate = now;
    }
  }

  /**
   * Check memory usage and throw if limit exceeded
   */
  protected async checkMemoryUsage(): Promise<void> {
    if (!this.options.monitorMemory) return;

    const now = Date.now();
    if (now - this.lastMemoryCheck < this.MEMORY_CHECK_INTERVAL) return;

    // Try to get memory usage from Chrome's non-standard API
    const memory = (performance as any).memory;
    let usedMemoryMB = 0;

    if (memory && typeof memory.usedJSHeapSize === 'number') {
      usedMemoryMB = memory.usedJSHeapSize / 1024 / 1024;
      this.context.memoryUsage = {
        heapUsed: memory.usedJSHeapSize,
        heapTotal: memory.totalJSHeapSize
      };
    } else {
      // Fallback: estimate memory based on feature count and bytes processed
      // Assume average feature size of 1KB
      usedMemoryMB = (this.featureCount * 1) / 1024;
      this.context.memoryUsage = {
        heapUsed: usedMemoryMB * 1024 * 1024,
        heapTotal: null
      };
    }

    if (this.options.maxMemoryMB && usedMemoryMB > this.options.maxMemoryMB) {
      geoErrorManager.addError(
        'stream_processor',
        'MEMORY_LIMIT_EXCEEDED',
        `Memory usage (${Math.round(usedMemoryMB)}MB) exceeds limit (${this.options.maxMemoryMB}MB)`,
        ErrorSeverity.CRITICAL,
        { 
          memoryUsage: usedMemoryMB,
          limit: this.options.maxMemoryMB,
          featureCount: this.featureCount,
          bytesProcessed: this.context.bytesProcessed
        }
      );
      throw new Error('Memory limit exceeded');
    }

    this.lastMemoryCheck = now;
  }

  /**
   * Cancel ongoing processing
   */
  public cancel(): void {
    this.processingCancelled = true;
  }

  /**
   * Process file in chunks using streaming
   */
  protected async *processStream(
    file: File,
    options: StreamProcessorOptions
  ): AsyncGenerator<Feature> {
    this.context = this.createContext();
    this.context.totalBytes = file.size;
    this.processingCancelled = false;
    this.featureCount = 0;

    const reader = this.createReadStream(file, options)
      .getReader();

    try {
      while (!this.processingCancelled) {
        const { done, value } = await reader.read();
        if (done) break;

        // Process chunk
        const chunk = value;
        this.context.bytesProcessed += chunk.length;
        
        // Check memory before processing
        await this.checkMemoryUsage();

        // Process chunk and yield features
        const features = await this.processChunk(chunk, this.context);
        for (const feature of features) {
          if (this.processingCancelled) break;
          this.featureCount++;
          yield feature;
        }

        // Update progress
        this.updateProgress();
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Process entire file using streaming
   */
  public async process(file: File): Promise<ProcessorResult> {
    if (!coordinateSystemManager.isInitialized()) {
      await coordinateSystemManager.initialize();
    }

    const features: Feature[] = [];
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    const layers = new Set<string>();

    try {
      for await (const feature of this.processStream(file, this.options)) {
        features.push(feature);

        // Update bounds
        if (feature.geometry.type === 'Point') {
          const [x, y] = feature.geometry.coordinates;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }

        // Track layers
        const layer = feature.properties?.layer;
        if (layer) layers.add(layer);
      }

      return {
        features: {
          type: 'FeatureCollection',
          features
        },
        bounds: { minX, minY, maxX, maxY },
        layers: Array.from(layers),
        coordinateSystem: this.options.coordinateSystem || COORDINATE_SYSTEMS.WGS84,
        statistics: {
          featureCount: features.length,
          layerCount: layers.size,
          featureTypes: {},
          failedTransformations: 0,
          errors: []
        }
      };
    } catch (error) {
      geoErrorManager.addError(
        'stream_processor',
        'PROCESSING_ERROR',
        `Failed to process file: ${error instanceof Error ? error.message : String(error)}`,
        ErrorSeverity.ERROR,
        {
          file: file.name,
          bytesProcessed: this.context.bytesProcessed,
          totalBytes: this.context.totalBytes,
          error: error instanceof Error ? error.message : String(error)
        }
      );
      throw error;
    }
  }

  /**
   * Get current processing context
   */
  public getContext(): ProcessingContext {
    return { ...this.context };
  }

  /**
   * Check if processing was cancelled
   */
  public isCancelled(): boolean {
    return this.processingCancelled;
  }
}
