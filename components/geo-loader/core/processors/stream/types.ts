import { Feature } from 'geojson';
import { ProcessorOptions, ProcessorStats, DatabaseImportResult } from '../base/types';

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
  /** Database import results */
  databaseResult?: DatabaseImportResult;
  /** Processed features */
  features?: Feature[];
  /** Bounds of all features */
  bounds?: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
}

/**
 * Stream processor batch events
 */
export interface StreamProcessorBatchEvents {
  /** Emitted when a batch is completed */
  onBatchComplete?: (batchNumber: number, totalBatches: number) => void;
  /** Emitted when a transaction status changes */
  onTransactionStatus?: (status: 'begin' | 'commit' | 'rollback') => void;
}

/**
 * Stream processor events
 */
export interface StreamProcessorEvents extends StreamProcessorBatchEvents {
  /** Emitted when a feature is processed */
  onFeature?: (feature: Feature) => void;
  /** Emitted when a chunk is processed */
  onChunk?: (features: Feature[], chunkIndex: number) => void;
  /** Emitted when processing progress updates */
  onProgress?: (progress: number) => void;
  /** Emitted when processing errors occur */
  onError?: (error: Error) => void;
  /** Emitted when warnings occur */
  onWarning?: (message: string) => void;
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
