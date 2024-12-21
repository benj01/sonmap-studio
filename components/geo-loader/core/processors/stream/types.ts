import { Feature } from 'geojson';
import { ProcessorOptions, ProcessorStats } from '../base/types';

/**
 * Options for stream processing
 */
export interface StreamProcessorOptions extends ProcessorOptions {
  /** Chunk size for processing */
  chunkSize?: number;
  /** Whether to process features in parallel */
  parallel?: boolean;
  /** Maximum number of parallel operations */
  maxParallel?: number;
  /** Buffer size for feature queue */
  bufferSize?: number;
}

/**
 * Result of stream processing
 */
export interface StreamProcessorResult {
  /** Processing statistics */
  statistics: ProcessorStats;
  /** Whether processing completed successfully */
  success: boolean;
  /** Error message if processing failed */
  error?: string;
}

/**
 * Stream processor events
 */
export interface StreamProcessorEvents {
  /** Emitted when a feature is processed */
  onFeature?: (feature: Feature) => void;
  /** Emitted when a chunk is processed */
  onChunk?: (features: Feature[], chunkIndex: number) => void;
  /** Emitted when processing progress updates */
  onProgress?: (progress: number) => void;
  /** Emitted when processing errors occur */
  onError?: (error: Error) => void;
}

/**
 * Stream processor state
 */
export interface StreamProcessorState {
  /** Whether processing is active */
  isProcessing: boolean;
  /** Current progress (0-1) */
  progress: number;
  /** Number of features processed */
  featuresProcessed: number;
  /** Number of chunks processed */
  chunksProcessed: number;
  /** Processing statistics */
  statistics: ProcessorStats;
}
