/**
 * Manages streaming buffers for large file processing
 */
export class BufferManager {
  // Default chunk size (4MB)
  private static readonly DEFAULT_CHUNK_SIZE = 4 * 1024 * 1024;
  
  // Maximum memory usage (256MB by default)
  private static readonly DEFAULT_MAX_MEMORY = 256 * 1024 * 1024;
  
  private chunkSize: number;
  private maxMemory: number;
  private currentMemoryUsage: number = 0;
  private buffers: Map<string, ArrayBuffer> = new Map();
  private memoryWarningCallback?: (usage: number, max: number) => void;

  constructor(options: {
    chunkSize?: number;
    maxMemory?: number;
    onMemoryWarning?: (usage: number, max: number) => void;
  } = {}) {
    this.chunkSize = options.chunkSize || BufferManager.DEFAULT_CHUNK_SIZE;
    this.maxMemory = options.maxMemory || BufferManager.DEFAULT_MAX_MEMORY;
    this.memoryWarningCallback = options.onMemoryWarning;
  }

  /**
   * Create a new buffer stream
   */
  async* createBufferStream(
    file: File | ArrayBuffer,
    options: {
      id?: string;
      priority?: number;
    } = {}
  ): AsyncGenerator<ArrayBuffer> {
    const id = options.id || `buffer-${Date.now()}-${Math.random()}`;
    const priority = options.priority || 1;

    try {
      let buffer: ArrayBuffer;
      if (file instanceof File) {
        buffer = await file.arrayBuffer();
      } else {
        buffer = file;
      }

      // Check if we need to split the buffer
      if (buffer.byteLength <= this.chunkSize) {
        // Small enough to process as is
        this.trackMemory(id, buffer.byteLength);
        this.buffers.set(id, buffer);
        yield buffer;
      } else {
        // Split into chunks
        const totalChunks = Math.ceil(buffer.byteLength / this.chunkSize);
        const view = new Uint8Array(buffer);

        for (let i = 0; i < totalChunks; i++) {
          const start = i * this.chunkSize;
          const end = Math.min(start + this.chunkSize, buffer.byteLength);
          const chunk = view.slice(start, end).buffer;

          // Check memory limits before processing chunk
          await this.ensureMemoryAvailable(chunk.byteLength, priority);

          this.trackMemory(id, chunk.byteLength);
          this.buffers.set(`${id}-chunk-${i}`, chunk);
          
          yield chunk;

          // Clean up chunk after processing
          this.releaseBuffer(`${id}-chunk-${i}`);
        }
      }
    } finally {
      // Clean up all buffers for this stream
      this.releaseAllBuffers(id);
    }
  }

  /**
   * Track memory usage for a buffer
   */
  private trackMemory(id: string, size: number): void {
    this.currentMemoryUsage += size;

    // Check if we're approaching memory limit
    if (this.currentMemoryUsage > this.maxMemory * 0.8) {
      this.memoryWarningCallback?.(this.currentMemoryUsage, this.maxMemory);
    }
  }

  /**
   * Ensure enough memory is available for next chunk
   */
  private async ensureMemoryAvailable(
    requiredSize: number,
    priority: number
  ): Promise<void> {
    if (this.currentMemoryUsage + requiredSize > this.maxMemory) {
      // Try to free up memory
      this.cleanupUnusedBuffers();

      // If still not enough, wait briefly and try again
      if (this.currentMemoryUsage + requiredSize > this.maxMemory) {
        await new Promise(resolve => setTimeout(resolve, 100 * priority));
        return this.ensureMemoryAvailable(requiredSize, priority);
      }
    }
  }

  /**
   * Release a specific buffer
   */
  releaseBuffer(id: string): void {
    const buffer = this.buffers.get(id);
    if (buffer) {
      this.currentMemoryUsage -= buffer.byteLength;
      this.buffers.delete(id);
    }
  }

  /**
   * Release all buffers for a stream
   */
  private releaseAllBuffers(streamId: string): void {
    for (const [id, buffer] of this.buffers.entries()) {
      if (id.startsWith(streamId)) {
        this.releaseBuffer(id);
      }
    }
  }

  /**
   * Clean up unused buffers
   */
  private cleanupUnusedBuffers(): void {
    // In a real implementation, we would track buffer usage
    // and clean up least recently used buffers
    // For now, we'll just clear all buffers
    this.buffers.clear();
    this.currentMemoryUsage = 0;
  }

  /**
   * Get current memory usage
   */
  getCurrentMemoryUsage(): number {
    return this.currentMemoryUsage;
  }

  /**
   * Get maximum memory limit
   */
  getMaxMemory(): number {
    return this.maxMemory;
  }

  /**
   * Update maximum memory limit
   */
  setMaxMemory(maxMemory: number): void {
    this.maxMemory = maxMemory;
  }

  /**
   * Update chunk size
   */
  setChunkSize(chunkSize: number): void {
    this.chunkSize = chunkSize;
  }
}
