import { GeoFileUpload, ProcessingOptions, ProcessingResult, ProcessingContext, ProcessingStatus } from './types';
import { LogManager } from '../../logging/log-manager';

/**
 * Base interface for all geo data processors
 */
export interface GeoProcessor {
  /**
   * Check if this processor can handle the given file upload
   */
  canProcess(upload: GeoFileUpload): boolean;

  /**
   * Analyze file contents without full processing
   * Used for previews and metadata extraction
   */
  analyze(upload: GeoFileUpload, options?: ProcessingOptions): Promise<ProcessingResult>;

  /**
   * Sample a subset of features for preview
   */
  sample(upload: GeoFileUpload, options?: ProcessingOptions): Promise<ProcessingResult>;

  /**
   * Process the entire file
   */
  process(upload: GeoFileUpload, options?: ProcessingOptions): Promise<ProcessingResult>;

  /**
   * Clean up any resources
   */
  dispose(): Promise<void>;
}

/**
 * Abstract base class implementing common processor functionality
 */
export abstract class BaseGeoProcessor implements GeoProcessor {
  protected readonly logger = LogManager.getInstance();
  protected context: ProcessingContext | null = null;

  constructor(protected readonly options: ProcessingOptions = {}) {}

  /**
   * Initialize processing context
   */
  protected initContext(upload: GeoFileUpload, options: ProcessingOptions = {}): ProcessingContext {
    this.context = {
      mainFile: upload.mainFile,
      companions: upload.companions,
      options: { ...this.options, ...options },
      progress: this.updateProgress.bind(this)
    };
    return this.context;
  }

  /**
   * Update processing progress
   */
  protected updateProgress(status: ProcessingStatus): void {
    this.logger.debug('BaseGeoProcessor', `Processing progress: ${status.phase}`, status);
  }

  /**
   * Check if this processor can handle the given file upload
   */
  abstract canProcess(upload: GeoFileUpload): boolean;

  /**
   * Analyze file contents
   */
  abstract analyze(upload: GeoFileUpload, options?: ProcessingOptions): Promise<ProcessingResult>;

  /**
   * Sample features
   */
  abstract sample(upload: GeoFileUpload, options?: ProcessingOptions): Promise<ProcessingResult>;

  /**
   * Process file
   */
  abstract process(upload: GeoFileUpload, options?: ProcessingOptions): Promise<ProcessingResult>;

  /**
   * Clean up
   */
  async dispose(): Promise<void> {
    this.context = null;
  }
} 