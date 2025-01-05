import { Feature } from 'geojson';
import { WorkerManager } from '../../../workers/worker-manager';
import { BufferManager } from '../../../memory/buffer-manager';
import { MemoryMonitor } from '../../../memory/memory-monitor';
import { ShapefileProcessorOptions, ShapefileParseOptions } from './types';
import { ShapefileProcessor } from './processor';
import { ValidationError } from '../../../errors/types';
import { ShapefileSizeError } from '../../../errors/shapefile-errors';

/**
 * Worker-based processor for Shapefile files with memory management
 */
export class WorkerShapefileProcessor extends ShapefileProcessor {
  private workerManager: WorkerManager;
  private bufferManager: BufferManager;
  private currentTaskId?: string;
  private memoryMonitorCleanup?: () => void;

  constructor(options: ShapefileProcessorOptions = {}) {
    super(options);
    this.workerManager = new WorkerManager();
    this.bufferManager = new BufferManager({
      onMemoryWarning: (usage, max) => {
        console.warn(`High memory usage: ${usage}/${max} bytes`);
      }
    });

    // Register for memory warnings
    this.memoryMonitorCleanup = MemoryMonitor.getInstance().onMemoryWarning(
      (usage, limit) => {
        if (usage > limit * 0.9) {
          // Critical memory usage - pause processing
          this.pauseProcessing();
        }
      }
    );
  }

  /**
   * Process file using worker with memory management
   */
  protected async processStream(file: File): Promise<Feature[]> {
    try {
      // Check file size
      if (file.size > MemoryMonitor.getInstance().getMemoryLimit()) {
        throw new ShapefileSizeError(
          'File size exceeds memory limit',
          file.size,
          MemoryMonitor.getInstance().getMemoryLimit()
        );
      }

      // Generate unique task ID
      this.currentTaskId = `shapefile-${Date.now()}-${Math.random()}`;

      // Check if we can create a new worker
      if (!this.workerManager.canCreateWorker()) {
        throw new ValidationError(
          'Maximum number of concurrent processing tasks reached',
          'WORKER_LIMIT_EXCEEDED'
        );
      }

      // Create worker
      const worker = this.workerManager.createWorker(
        this.currentTaskId,
        '/components/geo-loader/core/workers/shapefile.worker.ts'
      );

      // Process in chunks using buffer manager
      const features: Feature[] = [];
      let processedChunks = 0;

      for await (const chunk of this.bufferManager.createBufferStream(file, {
        id: this.currentTaskId,
        priority: 1
      })) {
        const chunkFeatures = await this.processChunk(worker, chunk);
        features.push(...chunkFeatures);
        processedChunks++;
        
        // Update progress
        this.updateProgress(processedChunks * this.bufferManager['chunkSize'] / file.size);
      }

      return features;
    } catch (error) {
      // Clean up resources
      this.cleanup();
      throw error;
    }
  }

  /**
   * Process a single chunk using worker
   */
  private processChunk(worker: Worker, chunk: ArrayBuffer): Promise<Feature[]> {
    return new Promise((resolve, reject) => {
      const chunkHandler = (e: MessageEvent) => {
        if (e.data.type === 'complete') {
          worker.removeEventListener('message', chunkHandler);
          resolve(e.data.features);
        } else if (e.data.type === 'error') {
          worker.removeEventListener('message', chunkHandler);
          reject(new ValidationError(
            e.data.error.message,
            'WORKER_PROCESSING_ERROR',
            undefined,
            e.data.error
          ));
        }
      };

      worker.addEventListener('message', chunkHandler);

      // Start processing chunk
      const options: ShapefileParseOptions = {
        parseDbf: (this.options as ShapefileProcessorOptions).importAttributes,
        validate: (this.options as ShapefileProcessorOptions).validateGeometry,
        repair: (this.options as ShapefileProcessorOptions).repairGeometry,
        simplify: (this.options as ShapefileProcessorOptions).simplifyGeometry,
        tolerance: (this.options as ShapefileProcessorOptions).simplifyTolerance
      };

      worker.postMessage({ type: 'parse', file: chunk, options }, [chunk]);
    });
  }

  /**
   * Pause processing (called when memory usage is high)
   */
  private pauseProcessing(): void {
    // Implement pause logic
    console.warn('Processing paused due to high memory usage');
    // Could implement a more sophisticated pause mechanism here
  }

  /**
   * Clean up resources
   */
  private cleanup(): void {
    if (this.currentTaskId) {
      this.workerManager.terminateWorker(this.currentTaskId);
      this.currentTaskId = undefined;
    }
  }

  /**
   * Dispose of resources
   */
  public dispose(): void {
    this.cleanup();
    this.memoryMonitorCleanup?.();
    super.dispose?.();
  }
}
