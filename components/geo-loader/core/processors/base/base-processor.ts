import { Feature, FeatureCollection } from 'geojson';
import { CompressionHandler, CompressedFile } from '../../compression/compression-handler';
import { BufferManager } from '../../memory/buffer-manager';
import { MemoryMonitor } from '../../memory/memory-monitor';
import { ValidationError } from '../../errors/types';

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
export abstract class BaseProcessor {
  protected options: ProcessorOptions;
  protected compressionHandler: CompressionHandler;
  protected bufferManager: BufferManager;
  private memoryMonitorCleanup?: () => void;
  private progressCallback?: (progress: number) => void;

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
   * Process a file or group of files
   */
  async process(files: File | File[]): Promise<ProcessorResult> {
    try {
      const fileArray = Array.isArray(files) ? files : [files];
      const processedFiles: CompressedFile[] = [];

      // Process each file (handle compressed files)
      for (const file of fileArray) {
        if (CompressionHandler.isCompressedFile(file)) {
          const extracted = await this.compressionHandler.processCompressedFile(
            file,
            (progress) => this.updateProgress(progress * 0.5) // First 50% for extraction
          );
          processedFiles.push(...extracted);
        } else {
          processedFiles.push({
            name: file.name,
            path: file.name,
            size: file.size,
            data: file
          });
        }
      }

      // Group related files
      const fileGroups = this.compressionHandler.groupRelatedFiles(processedFiles);

      // Process each group
      const results: Feature[] = [];
      let processed = 0;

      for (const [groupName, groupFiles] of fileGroups) {
        const groupFeatures = await this.processFileGroup(groupFiles);
        results.push(...groupFeatures);
        
        processed++;
        this.updateProgress(0.5 + (processed / fileGroups.size) * 0.5); // Last 50% for processing
      }

      return {
        features: results,
        bounds: this.calculateBounds(results),
        layers: this.getLayers(results),
        statistics: this.calculateStatistics(results)
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Set progress callback
   */
  setProgressCallback(callback: (progress: number) => void): void {
    this.progressCallback = callback;
  }

  /**
   * Update progress
   */
  protected updateProgress(progress: number): void {
    this.progressCallback?.(Math.min(1, Math.max(0, progress)));
  }

  /**
   * Pause processing (implement in derived class if needed)
   */
  protected pauseProcessing(): void {
    // Default implementation does nothing
  }

  /**
   * Calculate bounds from features
   */
  protected calculateBounds(features: Feature[]): ProcessorResult['bounds'] {
    const bounds = {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity
    };

    for (const feature of features) {
      const featureBounds = this.getFeatureBounds(feature);
      bounds.minX = Math.min(bounds.minX, featureBounds.minX);
      bounds.minY = Math.min(bounds.minY, featureBounds.minY);
      bounds.maxX = Math.max(bounds.maxX, featureBounds.maxX);
      bounds.maxY = Math.max(bounds.maxY, featureBounds.maxY);
    }

    return bounds;
  }

  /**
   * Get bounds for a single feature
   */
  protected abstract getFeatureBounds(feature: Feature): ProcessorResult['bounds'];

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
   * Process a group of related files (implement in derived class)
   */
  protected abstract processFileGroup(files: CompressedFile[]): Promise<Feature[]>;

  /**
   * Clean up resources
   */
  dispose(): void {
    this.memoryMonitorCleanup?.();
  }
}
