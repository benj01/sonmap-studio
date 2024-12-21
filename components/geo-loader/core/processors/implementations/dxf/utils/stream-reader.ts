import { ValidationError } from '../../../../errors/types';

interface StreamStats {
  bytesRead: number;
  totalBytes: number;
  bufferSize: number;
  bufferCount: number;
  memoryUsage: number;
}

interface StreamReaderOptions {
  chunkSize?: number;
  maxBuffers?: number;
  memoryLimit?: number;
}

/**
 * Handles streaming reading of DXF files with memory management
 */
export class StreamReader {
  private file: File;
  private reader: FileReader;
  private chunkSize: number;
  private maxBuffers: number;
  private memoryLimit: number;
  private buffers: string[] = [];
  private stats: StreamStats;
  private aborted: boolean = false;

  constructor(file: File, options: StreamReaderOptions = {}) {
    this.file = file;
    this.reader = new FileReader();
    this.chunkSize = options.chunkSize || 64 * 1024; // 64KB chunks
    this.maxBuffers = options.maxBuffers || 3;
    this.memoryLimit = options.memoryLimit || 100 * 1024 * 1024; // 100MB
    this.stats = {
      bytesRead: 0,
      totalBytes: file.size,
      bufferSize: 0,
      bufferCount: 0,
      memoryUsage: 0
    };
  }

  /**
   * Read file in chunks
   */
  async *readChunks(): AsyncGenerator<string, void, unknown> {
    let offset = 0;
    let lastPartialLine = '';

    while (offset < this.file.size && !this.aborted) {
      // Check memory usage
      if (this.stats.memoryUsage > this.memoryLimit) {
        throw new ValidationError(
          'Memory limit exceeded',
          'MEMORY_LIMIT_EXCEEDED',
          undefined,
          { limit: this.memoryLimit, usage: this.stats.memoryUsage }
        );
      }

      // Manage buffer pool
      if (this.buffers.length >= this.maxBuffers) {
        this.buffers.shift(); // Remove oldest buffer
        this.stats.bufferCount--;
      }

      // Read next chunk
      const chunk = await this.readChunk(offset, this.chunkSize);
      const lines = (lastPartialLine + chunk).split('\n');
      
      // Save last line if it might be incomplete
      lastPartialLine = offset + this.chunkSize < this.file.size ? lines.pop() || '' : '';

      // Add to buffer pool
      const buffer = lines.join('\n');
      this.buffers.push(buffer);
      this.stats.bufferCount++;
      this.stats.bufferSize += buffer.length;
      this.stats.memoryUsage = this.calculateMemoryUsage();

      yield buffer;

      offset += this.chunkSize;
      this.stats.bytesRead = offset;
    }

    // Yield any remaining partial line
    if (lastPartialLine && !this.aborted) {
      yield lastPartialLine;
    }
  }

  /**
   * Read a chunk of the file
   */
  private readChunk(offset: number, length: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const blob = this.file.slice(offset, offset + length);
      
      this.reader.onload = () => {
        resolve(this.reader.result as string);
      };
      
      this.reader.onerror = () => {
        reject(new Error('Failed to read file chunk'));
      };
      
      this.reader.readAsText(blob);
    });
  }

  /**
   * Calculate current memory usage
   */
  private calculateMemoryUsage(): number {
    // Rough estimation: 2 bytes per character (UTF-16)
    return this.buffers.reduce((total, buffer) => total + buffer.length * 2, 0);
  }

  /**
   * Get current statistics
   */
  getStats(): StreamStats {
    return { ...this.stats };
  }

  /**
   * Get progress (0-1)
   */
  getProgress(): number {
    return this.stats.totalBytes > 0 ? this.stats.bytesRead / this.stats.totalBytes : 0;
  }

  /**
   * Abort reading
   */
  abort(): void {
    this.aborted = true;
    this.reader.abort();
    this.buffers = [];
    this.stats.bufferCount = 0;
    this.stats.bufferSize = 0;
    this.stats.memoryUsage = 0;
  }

  /**
   * Clear buffers
   */
  clear(): void {
    this.buffers = [];
    this.stats.bufferCount = 0;
    this.stats.bufferSize = 0;
    this.stats.memoryUsage = 0;
  }
}
