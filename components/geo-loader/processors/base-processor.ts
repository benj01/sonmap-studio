// components/geo-loader/processors/base-processor.ts

import { FeatureCollection } from 'geojson';
import { CoordinateSystem } from '../types/coordinates';
import { DxfData } from '../utils/dxf/types';

export interface ProcessorOptions {
  coordinateSystem?: CoordinateSystem;
  selectedLayers?: string[];
  selectedTypes?: string[];
  importAttributes?: boolean;
  onProgress?: (progress: number) => void;
  onWarning?: (message: string) => void;
  onError?: (message: string) => void;
}

export interface ProcessorStats {
  featureCount: number;
  layerCount: number;
  featureTypes: Record<string, number>;
  failedTransformations?: number;
  errors?: Array<{
    type: string;
    message?: string;
    count: number;
  }>;
}

export interface ProcessorResult {
  features: FeatureCollection;
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  layers: string[];
  coordinateSystem: CoordinateSystem;
  statistics: ProcessorStats;
  warnings?: string[];
  dxfData?: DxfData; // Optional DXF data for DXF processor
}

export interface AnalyzeResult {
  layers: string[];
  coordinateSystem?: CoordinateSystem;
  bounds?: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  preview: FeatureCollection;
  warnings?: string[];
  dxfData?: DxfData; // Optional DXF data for DXF processor
}

export abstract class BaseProcessor {
  protected options: ProcessorOptions;

  constructor(options: ProcessorOptions = {}) {
    this.options = options;
  }

  abstract canProcess(file: File): Promise<boolean>;
  abstract analyze(file: File): Promise<AnalyzeResult>;
  abstract process(file: File): Promise<ProcessorResult>;

  protected emitProgress(progress: number) {
    this.options.onProgress?.(Math.min(1, Math.max(0, progress)));
  }

  protected emitWarning(message: string) {
    this.options.onWarning?.(message);
  }

  protected emitError(message: string) {
    this.options.onError?.(message);
  }

  // Utility methods for child classes
  protected validateBounds(bounds: ProcessorResult['bounds']) {
    return (
      isFinite(bounds.minX) &&
      isFinite(bounds.minY) &&
      isFinite(bounds.maxX) &&
      isFinite(bounds.maxY) &&
      bounds.minX <= bounds.maxX &&
      bounds.minY <= bounds.maxY
    );
  }

  protected createDefaultStats(): ProcessorStats {
    return {
      featureCount: 0,
      layerCount: 0,
      featureTypes: {},
      failedTransformations: 0,
      errors: []
    };
  }

  protected updateStats(stats: ProcessorStats, type: string) {
    stats.featureCount++;
    stats.featureTypes[type] = (stats.featureTypes[type] || 0) + 1;
  }

  protected recordError(stats: ProcessorStats, type: string, message?: string) {
    const existingError = stats.errors?.find(e => e.type === type);
    if (existingError) {
      existingError.count++;
    } else {
      stats.errors = stats.errors || [];
      stats.errors.push({ type, message, count: 1 });
    }
  }
}

// Helper type for processor registration
export type ProcessorConstructor = new (options: ProcessorOptions) => BaseProcessor;

// Processor registry
export class ProcessorRegistry {
  private static processors = new Map<string, ProcessorConstructor>();

  static register(extension: string, processor: ProcessorConstructor) {
    this.processors.set(extension.toLowerCase(), processor);
  }

  static async getProcessor(file: File, options: ProcessorOptions = {}): Promise<BaseProcessor | null> {
    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    const ProcessorClass = this.processors.get(extension);
    
    if (!ProcessorClass) {
      return null;
    }

    const processor = new ProcessorClass(options);
    const canProcess = await processor.canProcess(file);
    
    return canProcess ? processor : null;
  }

  static getSupportedExtensions(): string[] {
    return Array.from(this.processors.keys());
  }
}

// Export a function to create processors
export function createProcessor(file: File, options: ProcessorOptions = {}): Promise<BaseProcessor | null> {
  return ProcessorRegistry.getProcessor(file, options);
}
