import { FeatureCollection } from 'geojson';
import { CoordinateSystem } from '../types/coordinates';
import { DxfData } from '../utils/dxf/types';
import { ErrorReporter } from '../utils/errors';

export interface ProcessorOptions {
  coordinateSystem?: CoordinateSystem;
  selectedLayers?: string[];
  selectedTypes?: string[];
  importAttributes?: boolean;
  errorReporter: ErrorReporter;
  onProgress?: (progress: number) => void;
}

export interface ProcessorStats {
  featureCount: number;
  layerCount: number;
  featureTypes: Record<string, number>;
  failedTransformations?: number;
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
  dxfData?: DxfData;
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
  warnings?: Array<{ type: string; message: string; context?: Record<string, any> }>;
  errors?: Array<{ type: string; message: string; context?: Record<string, any> }>;
  dxfData?: DxfData;
}

export abstract class BaseProcessor {
  protected options: ProcessorOptions;

  constructor(options: ProcessorOptions) {
    this.options = options;
  }

  abstract canProcess(file: File): Promise<boolean>;
  abstract analyze(file: File): Promise<AnalyzeResult>;
  abstract process(file: File): Promise<ProcessorResult>;

  protected emitProgress(progress: number): void {
    if (this.options.onProgress) {
      this.options.onProgress(Math.min(1, Math.max(0, progress)));
    }
  }

  protected reportError(type: string, message: string, context?: Record<string, any>): void {
    this.options.errorReporter.reportError(type, message, context);
  }

  protected reportWarning(type: string, message: string, context?: Record<string, any>): void {
    this.options.errorReporter.reportWarning(type, message, context);
  }

  protected reportInfo(type: string, message: string, context?: Record<string, any>): void {
    this.options.errorReporter.reportInfo(type, message, context);
  }

  protected createDefaultStats(): ProcessorStats {
    return {
      featureCount: 0,
      layerCount: 0,
      featureTypes: {},
      failedTransformations: 0
    };
  }
}

export type ProcessorConstructor = new (options: ProcessorOptions) => BaseProcessor;

export class ProcessorRegistry {
  private static processors = new Map<string, ProcessorConstructor>();

  static register(extension: string, processor: ProcessorConstructor): void {
    ProcessorRegistry.processors.set(extension.toLowerCase(), processor);
  }

  static async getProcessor(file: File, options: ProcessorOptions): Promise<BaseProcessor | null> {
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!extension) {
      options.errorReporter.reportError('FILE_ERROR', 'File has no extension');
      return null;
    }

    const ProcessorClass = ProcessorRegistry.processors.get(extension);
    if (!ProcessorClass) {
      options.errorReporter.reportError('FILE_ERROR', `No processor found for extension: ${extension}`);
      return null;
    }

    const processor = new ProcessorClass(options);
    try {
      if (await processor.canProcess(file)) {
        return processor;
      }
    } catch (error: unknown) {
      const err = error as Error;
      options.errorReporter.reportError('PROCESSOR_ERROR', 'Failed to check if processor can handle file', { error: err });
    }
    return null;
  }

  static getSupportedExtensions(): string[] {
    return Array.from(ProcessorRegistry.processors.keys());
  }
}

export const createProcessor = ProcessorRegistry.getProcessor;
