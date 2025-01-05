/**
 * Monitors memory usage across the application
 */
export class MemoryMonitor {
  private static instance: MemoryMonitor;
  private memoryWarningCallbacks: Set<(usage: number, limit: number) => void> = new Set();
  private memoryLimit: number;
  private warningThreshold: number;
  private checkInterval: number;
  private intervalId?: number;

  private constructor() {
    // Default memory limit (80% of available memory)
    this.memoryLimit = this.getAvailableMemory() * 0.8;
    // Warning at 70% of limit
    this.warningThreshold = this.memoryLimit * 0.7;
    // Check every 5 seconds by default
    this.checkInterval = 5000;

    this.startMonitoring();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): MemoryMonitor {
    if (!MemoryMonitor.instance) {
      MemoryMonitor.instance = new MemoryMonitor();
    }
    return MemoryMonitor.instance;
  }

  /**
   * Start monitoring memory usage
   */
  private startMonitoring(): void {
    if (this.intervalId) {
      return;
    }

    this.intervalId = window.setInterval(() => {
      const usage = this.getCurrentMemoryUsage();
      
      if (usage > this.warningThreshold) {
        this.notifyWarning(usage);
      }

      if (usage > this.memoryLimit) {
        this.notifyLimit(usage);
      }
    }, this.checkInterval);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  /**
   * Get current memory usage
   */
  getCurrentMemoryUsage(): number {
    if (performance.memory) {
      return (performance.memory as any).usedJSHeapSize;
    }
    
    // Fallback if performance.memory is not available
    return 0;
  }

  /**
   * Get available system memory
   */
  private getAvailableMemory(): number {
    if (performance.memory) {
      return (performance.memory as any).jsHeapSizeLimit;
    }
    
    // Fallback if performance.memory is not available
    return 512 * 1024 * 1024; // 512MB default
  }

  /**
   * Register for memory warnings
   */
  onMemoryWarning(callback: (usage: number, limit: number) => void): () => void {
    this.memoryWarningCallbacks.add(callback);
    
    // Return cleanup function
    return () => {
      this.memoryWarningCallbacks.delete(callback);
    };
  }

  /**
   * Notify about approaching memory limit
   */
  private notifyWarning(usage: number): void {
    this.memoryWarningCallbacks.forEach(callback => {
      try {
        callback(usage, this.memoryLimit);
      } catch (error) {
        console.error('Error in memory warning callback:', error);
      }
    });
  }

  /**
   * Notify about exceeding memory limit
   */
  private notifyLimit(usage: number): void {
    // Force garbage collection if possible
    if (global.gc) {
      global.gc();
    }

    // Notify callbacks with urgency flag
    this.memoryWarningCallbacks.forEach(callback => {
      try {
        callback(usage, this.memoryLimit);
      } catch (error) {
        console.error('Error in memory limit callback:', error);
      }
    });
  }

  /**
   * Update memory limit
   */
  setMemoryLimit(limit: number): void {
    this.memoryLimit = limit;
    this.warningThreshold = limit * 0.7;
  }

  /**
   * Update warning threshold
   */
  setWarningThreshold(threshold: number): void {
    this.warningThreshold = threshold;
  }

  /**
   * Update check interval
   */
  setCheckInterval(interval: number): void {
    this.checkInterval = interval;
    if (this.intervalId) {
      this.stopMonitoring();
      this.startMonitoring();
    }
  }

  /**
   * Get current memory limit
   */
  getMemoryLimit(): number {
    return this.memoryLimit;
  }

  /**
   * Get current warning threshold
   */
  getWarningThreshold(): number {
    return this.warningThreshold;
  }
}
