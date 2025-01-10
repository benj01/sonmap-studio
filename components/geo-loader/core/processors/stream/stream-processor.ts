import { ProcessorResult, ProcessorStats, AnalyzeResult } from '../base/types';
import { StreamProcessorEvents, StreamProcessorResult } from './types';
import { ValidationError } from '../../errors/types';
import { Feature } from 'geojson';
import { CompressedFile } from '../../compression/compression-handler';

/**
 * Base class for stream processors
 */
export abstract class StreamProcessor<R = any, F = Feature> {
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
  abstract canProcess(file: File): Promise<boolean>;

  /**
   * Analyze file structure
   */
  abstract analyze(file: File): Promise<AnalyzeResult<R, F>>;

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
}
