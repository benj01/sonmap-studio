import { Feature, FeatureCollection } from 'geojson';
import { CompressionHandler, CompressedFile } from '../../compression/compression-handler';
import { BufferManager } from '../../memory/buffer-manager';
import { MemoryMonitor } from '../../memory/memory-monitor';
import { ValidationError } from '../../errors/types';
import { LogManager } from '../../logging/log-manager';
import { CoordinateSystemManager } from '../../coordinate-systems/coordinate-system-manager';
import { FileProcessor, ProcessingOptions, ProcessingProgress, ProcessorMetadata, ProcessingResult } from './interfaces';
import { CoordinateSystem } from '../../../types/coordinates';
import { DetectionResult } from '../../coordinate-systems/detector';

export interface ProcessorOptions {
  // Whether to validate geometry
  validateGeometry?: boolean;
  // Whether to repair invalid geometry
  repairGeometry?: boolean;
  // Whether to simplify geometry
  simplifyGeometry?: boolean;
  // Simplification tolerance
  simplifyTolerance?: number;
  // Maximum number of preview records
  previewRecords?: number;
  // Coordinate system
  coordinateSystem?: string;
}

export interface ProcessorResult {
  // Processed features
  features: Feature[];
  // Bounding box
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  // Layer information
  layers: string[];
  // Processing statistics
  statistics: {
    totalFeatures: number;
    byType: Record<string, number>;
  };
}

/**
 * Base processor class with common functionality
 */
export abstract class BaseProcessor implements FileProcessor {
  protected readonly logger = LogManager.getInstance();
  protected readonly coordinateManager = CoordinateSystemManager.getInstance();
  protected progressCallbacks: Array<(progress: ProcessingProgress) => void> = [];
  protected isCancelled = false;
  protected currentProgress: ProcessingProgress = {
    phase: 'analyzing',
    processed: 0,
    total: 0
  };
  protected options: ProcessorOptions;
  protected compressionHandler: CompressionHandler;
  protected bufferManager: BufferManager;
  private memoryMonitorCleanup?: () => void;

  constructor(options: ProcessorOptions = {}) {
    this.options = options;
    this.compressionHandler = new CompressionHandler();
    this.bufferManager = new BufferManager({
      onMemoryWarning: (usage, max) => {
        console.warn(`High memory usage in processor: ${usage}/${max} bytes`);
      }
    });

    // Register for memory warnings
    this.memoryMonitorCleanup = MemoryMonitor.getInstance().onMemoryWarning(
      (usage, limit) => {
        if (usage > limit * 0.9) {
          this.pauseProcessing();
        }
      }
    );
  }

  /**
   * Check if this processor can handle the given file
   */
  abstract canProcess(fileName: string, mimeType?: string): boolean;

  /**
   * Analyze the file and extract metadata without full processing
   */
  abstract analyze(filePath: string): Promise<ProcessorMetadata>;

  /**
   * Sample a subset of features for preview
   */
  abstract sample(filePath: string, options?: ProcessingOptions): Promise<ProcessingResult>;

  /**
   * Process the entire file
   */
  abstract process(filePath: string, options?: ProcessingOptions): Promise<ProcessingResult>;

  /**
   * Get a stream of features for large files
   */
  abstract createFeatureStream(filePath: string, options?: ProcessingOptions): AsyncIterableIterator<Feature>;

  /**
   * Subscribe to processing progress
   */
  public onProgress(callback: (progress: ProcessingProgress) => void): void {
    this.progressCallbacks.push(callback);
  }

  /**
   * Cancel ongoing processing
   */
  public async cancel(): Promise<void> {
    this.isCancelled = true;
    this.updateProgress({ phase: 'complete', processed: 0, total: 0, error: new Error('Processing cancelled') });
  }

  /**
   * Clean up resources
   */
  public async dispose(): Promise<void> {
    this.progressCallbacks = [];
    this.isCancelled = false;
    this.memoryMonitorCleanup?.();
  }

  /**
   * Update progress and notify subscribers
   */
  protected updateProgress(progress: Partial<ProcessingProgress>): void {
    this.currentProgress = { ...this.currentProgress, ...progress };
    this.notifyProgressSubscribers();
  }

  /**
   * Notify all progress subscribers
   */
  protected notifyProgressSubscribers(): void {
    for (const callback of this.progressCallbacks) {
      try {
        callback(this.currentProgress);
      } catch (error) {
        this.logger.error('Error in progress callback:', error instanceof Error ? error.message : String(error));
      }
    }
  }

  /**
   * Detect coordinate system from features
   */
  protected async detectCoordinateSystem(
    features: Feature[],
    metadata?: { prj?: string; crs?: string | object }
  ): Promise<DetectionResult> {
    try {
      return await this.coordinateManager.detect(features, metadata);
    } catch (error) {
      this.logger.error('Error detecting coordinate system:', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * Transform features to target coordinate system
   */
  protected async transformFeatures(
    features: Feature[],
    from: CoordinateSystem,
    to: CoordinateSystem
  ): Promise<Feature[]> {
    try {
      return await this.coordinateManager.transform(features, from, to);
    } catch (error) {
      this.logger.error('Error transforming features:', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * Calculate bounds from features
   */
  protected calculateBounds(features: Feature[]): NonNullable<ProcessorMetadata['bounds']> {
    if (!features.length) return {
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0
    };

    const bounds = {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity
    };

    for (const feature of features) {
      if (!feature.geometry) continue;

      // Get the original geometry if it exists
      const geometry = feature.properties?._originalGeometry || feature.geometry;
      const coords = this.extractCoordinates(geometry);

      for (const [x, y] of coords) {
        bounds.minX = Math.min(bounds.minX, x);
        bounds.minY = Math.min(bounds.minY, y);
        bounds.maxX = Math.max(bounds.maxX, x);
        bounds.maxY = Math.max(bounds.maxY, y);
      }
    }

    if (bounds.minX === Infinity || bounds.minY === Infinity || 
        bounds.maxX === -Infinity || bounds.maxY === -Infinity) {
      return {
        minX: 0,
        minY: 0,
        maxX: 0,
        maxY: 0
      };
    }

    return bounds;
  }

  /**
   * Extract coordinates from a geometry object
   */
  protected extractCoordinates(geometry: any): Array<[number, number]> {
    const coordinates: Array<[number, number]> = [];

    const processCoordinate = (coord: any) => {
      if (Array.isArray(coord) && typeof coord[0] === 'number' && coord.length >= 2) {
        coordinates.push([coord[0], coord[1]]);
      } else if (Array.isArray(coord)) {
        coord.forEach(processCoordinate);
      }
    };

    if (geometry && geometry.coordinates) {
      processCoordinate(geometry.coordinates);
    }

    return coordinates;
  }

  /**
   * Check if processing should be cancelled
   */
  protected checkCancelled(): void {
    if (this.isCancelled) {
      throw new Error('Processing cancelled');
    }
  }

  /**
   * Process a file or group of files
   */
  async processFiles(files: File | File[]): Promise<ProcessingResult> {
    try {
      const fileArray = Array.isArray(files) ? files : [files];
      const fileGroups = new Map<string, string[]>();

      // Group files by extension
      for (const file of fileArray) {
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        if (!fileGroups.has(ext)) {
          fileGroups.set(ext, []);
        }
        fileGroups.get(ext)?.push(file.name);
      }

      // Process each group
      let processed = 0;
      for (const [ext, group] of fileGroups) {
        this.updateProgress({ 
          phase: 'processing',
          processed: processed,
          total: fileGroups.size
        });

        const result = await this.processFileGroup(group);
        processed++;

        this.updateProgress({ 
          phase: 'processing',
          processed: processed,
          total: fileGroups.size
        });

        return result;
      }

      throw new Error('No files to process');
    } catch (error) {
      this.logger.error('Error processing files:', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * Get layers from features
   */
  protected getLayers(features: Feature[]): string[] {
    const layers = new Set<string>();
    for (const feature of features) {
      const layer = feature.properties?.layer;
      if (layer) {
        layers.add(String(layer));
      }
    }
    return Array.from(layers);
  }

  /**
   * Calculate statistics
   */
  protected calculateStatistics(features: Feature[]): ProcessorResult['statistics'] {
    const statistics = {
      totalFeatures: features.length,
      byType: {} as Record<string, number>
    };

    for (const feature of features) {
      const type = feature.geometry.type;
      statistics.byType[type] = (statistics.byType[type] || 0) + 1;
    }

    return statistics;
  }

  /**
   * Handle errors
   */
  protected handleError(error: unknown): Error {
    if (error instanceof Error) {
      return error;
    }
    return new ValidationError(
      'Processing error: ' + String(error),
      'PROCESSING_ERROR',
      undefined,
      { error: String(error) }
    );
  }

  /**
   * Process a group of related files
   */
  protected abstract processFileGroup(files: string[]): Promise<ProcessingResult>;

  /**
   * Pause processing (implement in derived class if needed)
   */
  protected pauseProcessing(): void {
    // Default implementation does nothing
  }
}
