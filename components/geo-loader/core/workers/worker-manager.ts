/**
 * Manager for web workers
 */
export class WorkerManager {
  private workers: Map<string, Worker> = new Map();
  private maxWorkers: number;

  constructor(maxWorkers = navigator.hardwareConcurrency || 4) {
    this.maxWorkers = maxWorkers;
  }

  /**
   * Create a new worker for a specific task
   */
  createWorker(taskId: string, workerScript: string): Worker {
    // Terminate existing worker for this task if it exists
    this.terminateWorker(taskId);

    // Create new worker
    const worker = new Worker(workerScript, { type: 'module' });
    this.workers.set(taskId, worker);

    return worker;
  }

  /**
   * Get an existing worker for a task
   */
  getWorker(taskId: string): Worker | undefined {
    return this.workers.get(taskId);
  }

  /**
   * Terminate a specific worker
   */
  terminateWorker(taskId: string): void {
    const worker = this.workers.get(taskId);
    if (worker) {
      worker.terminate();
      this.workers.delete(taskId);
    }
  }

  /**
   * Terminate all workers
   */
  terminateAll(): void {
    for (const [taskId] of this.workers) {
      this.terminateWorker(taskId);
    }
  }

  /**
   * Check if we can create more workers
   */
  canCreateWorker(): boolean {
    return this.workers.size < this.maxWorkers;
  }

  /**
   * Get number of active workers
   */
  getActiveWorkerCount(): number {
    return this.workers.size;
  }

  /**
   * Get maximum number of workers
   */
  getMaxWorkers(): number {
    return this.maxWorkers;
  }
}
