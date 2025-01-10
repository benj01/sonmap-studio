import { ProcessorStats } from '../../../base/types';
import { ShapefileRecord, ShapeType } from '../types';

/**
 * Create default statistics object
 */
export function createDefaultStats(): ProcessorStats {
  return {
    featureCount: 0,
    layerCount: 0,
    featureTypes: {},
    failedTransformations: 0,
    errors: []
  };
}

/**
 * Update statistics with batch of records
 */
export function updateStats(stats: ProcessorStats, records: ShapefileRecord[] | string): void {
  if (typeof records === 'string') {
    // Handle string input (geometry type)
    const type = records.toLowerCase();
    if (!stats.featureTypes[type]) {
      stats.featureTypes[type] = 0;
    }
    stats.featureTypes[type]++;
    stats.featureCount++;
  } else {
    // Handle array input (batch of records)
    records.forEach(record => {
      const type = ShapeType[record.shapeType].toLowerCase();
      if (!stats.featureTypes[type]) {
        stats.featureTypes[type] = 0;
      }
      stats.featureTypes[type]++;
      stats.featureCount++;
    });
  }
}

/**
 * Add error to statistics
 */
export function addError(stats: ProcessorStats, error: string): void {
  stats.errors.push(error);
  stats.failedTransformations++;
}

/**
 * Reset statistics
 */
export function resetStats(stats: ProcessorStats): void {
  stats.featureCount = 0;
  stats.layerCount = 0;
  stats.featureTypes = {};
  stats.failedTransformations = 0;
  stats.errors = [];
}

/**
 * Create batch statistics
 */
export function createBatchStats(batchNumber: number, totalBatches: number): Partial<ProcessorStats> {
  return {
    featureCount: 0,
    featureTypes: {},
    failedTransformations: 0,
    errors: []
  };
}
