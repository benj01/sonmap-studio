import { GeoProcessor } from './processor';
import { GeoFileUpload, ProcessingError, ProcessingErrorType } from './types';
import { LogManager } from '../../logging/log-manager';

/**
 * Registry for managing and accessing different file processors
 */
export class ProcessorRegistry {
  private static instance: ProcessorRegistry;
  private processors: Map<string, GeoProcessor> = new Map();
  private readonly logger = LogManager.getInstance();
  private readonly LOG_SOURCE = 'ProcessorRegistry';

  private constructor() {}

  /**
   * Get the singleton instance
   */
  public static getInstance(): ProcessorRegistry {
    if (!ProcessorRegistry.instance) {
      ProcessorRegistry.instance = new ProcessorRegistry();
    }
    return ProcessorRegistry.instance;
  }

  /**
   * Register a processor for a file type
   */
  public register(type: string, processor: GeoProcessor): void {
    this.logger.debug(this.LOG_SOURCE, `Registering processor for type: ${type}`);
    this.processors.set(type.toLowerCase(), processor);
  }

  /**
   * Get a processor that can handle the given file upload
   */
  public getProcessor(upload: GeoFileUpload): GeoProcessor {
    this.logger.debug(this.LOG_SOURCE, 'Finding processor for upload', {
      fileName: upload.mainFile.name,
      type: upload.mainFile.type,
      hasCompanions: Object.keys(upload.companions).length > 0
    });

    // Try to find processor by MIME type
    const processor = this.processors.get(upload.mainFile.type.toLowerCase());
    if (processor) {
      this.logger.debug(this.LOG_SOURCE, 'Found processor by MIME type', {
        type: upload.mainFile.type
      });
      return processor;
    }

    // Try to find processor that can handle the file
    for (const [type, proc] of this.processors.entries()) {
      if (proc.canProcess(upload)) {
        this.logger.debug(this.LOG_SOURCE, 'Found compatible processor', { type });
        return proc;
      }
    }

    this.logger.error(this.LOG_SOURCE, 'No processor found for file', {
      fileName: upload.mainFile.name,
      type: upload.mainFile.type
    });

    throw new ProcessingError(
      `No processor found for file type: ${upload.mainFile.type}`,
      ProcessingErrorType.INVALID_FORMAT,
      {
        fileName: upload.mainFile.name,
        type: upload.mainFile.type,
        availableProcessors: Array.from(this.processors.keys())
      }
    );
  }

  /**
   * Check if a processor exists for the given type
   */
  public hasProcessor(type: string): boolean {
    return this.processors.has(type.toLowerCase());
  }

  /**
   * Get all registered processor types
   */
  public getRegisteredTypes(): string[] {
    return Array.from(this.processors.keys());
  }

  /**
   * Clear all registered processors
   */
  public clear(): void {
    this.processors.clear();
  }

  /**
   * Get all supported file extensions
   */
  public getSupportedExtensions(): string[] {
    return Array.from(this.processors.keys());
  }
}
