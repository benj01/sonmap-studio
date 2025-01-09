/**
 * Stream processor state
 */
export interface StreamProcessorState {
  /** Whether processing is active */
  isProcessing: boolean;
  /** Progress value between 0 and 1 */
  progress: number;
  /** Number of features processed */
  featuresProcessed: number;
  /** Number of chunks processed */
  chunksProcessed: number;
  /** Processing statistics */
  statistics: {
    /** Total number of features */
    featureCount: number;
    /** Total number of layers */
    layerCount: number;
    /** Count of features by type */
    featureTypes: Record<string, number>;
    /** Number of failed transformations */
    failedTransformations: number;
    /** Processing errors */
    errors: Array<{
      /** Error type */
      type: string;
      /** Error message */
      message: string;
      /** Additional error details */
      details?: Record<string, unknown>;
    }>;
  };
}
