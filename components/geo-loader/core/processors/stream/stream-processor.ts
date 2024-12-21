import { Feature } from 'geojson';
import { BaseProcessor } from '../base/base-processor';
import { ProcessorResult } from '../base/types';
import { StreamProcessorOptions, StreamProcessorEvents, StreamProcessorState, StreamProcessorResult } from './types';

/**
 * Abstract base class for stream-based processors
 */
export abstract class StreamProcessor extends BaseProcessor {
  protected options: StreamProcessorOptions;
  protected events: StreamProcessorEvents;
  protected state: StreamProcessorState;

  constructor(options: StreamProcessorOptions = {}, events: StreamProcessorEvents = {}) {
    super(options);
    this.options = {
      chunkSize: 1000,
      parallel: false,
      maxParallel: 4,
      bufferSize: 5000,
      ...options
    };
    this.events = events;
    this.state = this.createInitialState();
  }

  /**
   * Process file using streaming approach
   */
  async process(file: File): Promise<ProcessorResult> {
    try {
      this.state = this.createInitialState();
      const result = await this.processStream(file);
      
      if (!result.success) {
        throw new Error(result.error);
      }

      return {
        features: {
          type: 'FeatureCollection',
          features: []  // Features are handled by stream events
        },
        bounds: this.calculateBounds(),
        layers: this.getLayers(),
        coordinateSystem: this.options.coordinateSystem!,
        statistics: result.statistics
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.events.onError?.(error instanceof Error ? error : new Error(message));
      throw error;
    }
  }

  /**
   * Process features in streaming mode
   */
  protected abstract processStream(file: File): Promise<StreamProcessorResult>;

  /**
   * Process a chunk of features
   */
  protected abstract processChunk(features: Feature[], chunkIndex: number): Promise<Feature[]>;

  /**
   * Get current processing state
   */
  getState(): StreamProcessorState {
    return { ...this.state };
  }

  /**
   * Check if processor is currently active
   */
  isProcessing(): boolean {
    return this.state.isProcessing;
  }

  /**
   * Update processing progress
   */
  protected updateProgress(progress: number): void {
    this.state.progress = Math.min(1, Math.max(0, progress));
    this.events.onProgress?.(this.state.progress);
    this.emitProgress(this.state.progress);
  }

  /**
   * Handle processed feature
   */
  protected handleFeature(feature: Feature): void {
    this.state.featuresProcessed++;
    this.events.onFeature?.(feature);
  }

  /**
   * Handle processed chunk
   */
  protected handleChunk(features: Feature[], chunkIndex: number): void {
    this.state.chunksProcessed++;
    this.events.onChunk?.(features, chunkIndex);
  }

  /**
   * Create initial processor state
   */
  private createInitialState(): StreamProcessorState {
    return {
      isProcessing: false,
      progress: 0,
      featuresProcessed: 0,
      chunksProcessed: 0,
      statistics: this.createDefaultStats()
    };
  }

  /**
   * Calculate bounds from processed features
   */
  protected abstract calculateBounds(): ProcessorResult['bounds'];

  /**
   * Get available layers
   */
  protected abstract getLayers(): string[];
}
