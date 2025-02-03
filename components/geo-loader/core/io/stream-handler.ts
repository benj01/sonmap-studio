import { ProcessingError, ProcessingErrorType } from '../processors/base/types';
import { LogManager } from '../logging/log-manager';

/**
 * Options for stream processing
 */
export interface StreamOptions {
  chunkSize?: number;
  maxChunks?: number;
  onProgress?: (processed: number, total: number) => void;
}

/**
 * Handler for streaming large file data
 */
export class StreamHandler {
  private static readonly DEFAULT_CHUNK_SIZE = 1024 * 1024; // 1MB
  private static readonly DEFAULT_MAX_CHUNKS = 100;
  private static readonly logger = LogManager.getInstance();
  private static readonly LOG_SOURCE = 'StreamHandler';

  /**
   * Create an async iterator for processing a file in chunks
   */
  public static async *createStream(
    data: ArrayBuffer,
    options: StreamOptions = {}
  ): AsyncIterableIterator<Uint8Array> {
    const chunkSize = options.chunkSize || this.DEFAULT_CHUNK_SIZE;
    const maxChunks = options.maxChunks || this.DEFAULT_MAX_CHUNKS;
    const total = data.byteLength;
    let processed = 0;
    let chunkCount = 0;

    this.logger.debug(this.LOG_SOURCE, 'Creating stream', {
      totalSize: total,
      chunkSize,
      maxChunks
    });

    while (processed < total) {
      if (chunkCount >= maxChunks) {
        throw new ProcessingError(
          'Maximum number of chunks exceeded',
          ProcessingErrorType.PARSING_ERROR,
          { maxChunks, totalSize: total, processedSize: processed }
        );
      }

      const end = Math.min(processed + chunkSize, total);
      const chunk = new Uint8Array(data.slice(processed, end));
      
      yield chunk;
      
      processed = end;
      chunkCount++;

      options.onProgress?.(processed, total);
      
      this.logger.debug(this.LOG_SOURCE, 'Processed chunk', {
        chunkNumber: chunkCount,
        chunkSize: chunk.length,
        totalProcessed: processed,
        percentComplete: Math.round((processed / total) * 100)
      });
    }
  }

  /**
   * Process a stream with a transform function
   */
  public static async processStream<T>(
    data: ArrayBuffer,
    transform: (chunk: Uint8Array) => Promise<T>,
    options: StreamOptions = {}
  ): Promise<T[]> {
    const results: T[] = [];
    
    for await (const chunk of this.createStream(data, options)) {
      const result = await transform(chunk);
      results.push(result);
    }

    return results;
  }

  /**
   * Combine chunks into a single result
   */
  public static async combineChunks<T>(
    chunks: T[],
    combine: (chunks: T[]) => Promise<T>
  ): Promise<T> {
    this.logger.debug(this.LOG_SOURCE, 'Combining chunks', {
      chunkCount: chunks.length
    });

    try {
      const result = await combine(chunks);
      
      this.logger.debug(this.LOG_SOURCE, 'Successfully combined chunks');
      
      return result;
    } catch (error) {
      throw new ProcessingError(
        'Failed to combine chunks',
        ProcessingErrorType.PARSING_ERROR,
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Create a transform stream for processing chunks
   */
  public static async *createTransformStream<T>(
    data: ArrayBuffer,
    transform: (chunk: Uint8Array) => Promise<T>,
    options: StreamOptions = {}
  ): AsyncIterableIterator<T> {
    for await (const chunk of this.createStream(data, options)) {
      yield await transform(chunk);
    }
  }
} 