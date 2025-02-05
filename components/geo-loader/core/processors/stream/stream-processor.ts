import { ProcessorResult, ProcessorStats, AnalyzeResult, ProcessingOptions, GeoFileUpload, ProcessingResult } from '../base/types';
import { StreamProcessorEvents, StreamProcessorResult } from './types';
import { ValidationError } from '../../errors/types';
import { Feature } from 'geojson';
import { CompressedFile } from '../../compression/compression-handler';
import { GeoProcessor } from '../base/processor';

/**
 * Base class for stream processors
 */
export abstract class StreamProcessor<R = any, F = Feature> implements GeoProcessor {
  protected state: {
    statistics: ProcessorStats;
  };

  protected options: Record<string, any>;
  protected events: StreamProcessorEvents;

  constructor(options: Record<string, any> = {}, events: StreamProcessorEvents = {}) {
    this.options = options;
    this.events = events;
    this.state = {
      statistics: {
        featureCount: 0,
        layerCount: 0,
        featureTypes: {},
        failedTransformations: 0,
        errors: []
      }
    };
  }

  /**
   * Check if file can be processed
   */
  abstract canProcess(upload: GeoFileUpload): boolean;

  /**
   * Analyze file structure
   */
  abstract analyze(upload: GeoFileUpload, options?: ProcessingOptions): Promise<ProcessingResult>;

  async sample(upload: GeoFileUpload, options?: ProcessingOptions): Promise<ProcessingResult> {
    // Default implementation - can be overridden by subclasses
    return this.analyze(upload, { ...options, sampleSize: 100 });
  }

  async process(upload: GeoFileUpload, options?: ProcessingOptions): Promise<ProcessingResult> {
    const streamResult = await this.processStream(upload as unknown as File);
    return {
      features: streamResult.features || [],
      metadata: {
        fileName: upload.mainFile.name,
        fileSize: upload.mainFile.size,
        format: this.getFormat(),
        layerCount: streamResult.statistics.layerCount,
        featureCount: streamResult.statistics.featureCount,
        bounds: streamResult.bounds
      },
      layerStructure: this.getLayers().map(layer => ({
        name: layer,
        featureCount: 0, // This should be updated by specific implementations
        geometryType: 'unknown', // This should be updated by specific implementations
        attributes: []
      })),
      statistics: {
        importTime: 0, // This should be updated by specific implementations
        validatedCount: streamResult.statistics.featureCount,
        transformedCount: streamResult.statistics.featureCount - streamResult.statistics.failedTransformations,
        failedFeatures: streamResult.statistics.errors.map(error => ({
          entity: null,
          error
        }))
      }
    };
  }

  async dispose(): Promise<void> {
    await this.cleanup();
  }

  /**
   * Process a chunk of features
   */
  protected abstract processChunk(features: F[], chunkIndex: number): Promise<F[]>;

  /**
   * Calculate bounds from processed features
   */
  protected abstract calculateBounds(): ProcessorResult['bounds'];

  /**
   * Get available layers
   */
  protected abstract getLayers(): string[];

  /**
   * Get bounds for a specific feature
   */
  protected abstract getFeatureBounds(feature: F): Required<ProcessorResult>['bounds'];

  /**
   * Process file stream
   */
  protected abstract processStream(file: File): Promise<StreamProcessorResult>;

  /**
   * Process a group of files
   */
  protected abstract processFileGroup(files: CompressedFile[]): Promise<F[]>;

  /**
   * Clean up resources
   */
  abstract cleanup(): Promise<void>;

  /**
   * Update progress
   */
  protected updateProgress(progress: number): void {
    if (this.events.onProgress) {
      this.events.onProgress(progress);
    }
  }

  /**
   * Handle error
   */
  protected handleError(error: ValidationError): void {
    if (this.events.onError) {
      this.events.onError(error);
    }
  }

  protected abstract getFormat(): string;
}
