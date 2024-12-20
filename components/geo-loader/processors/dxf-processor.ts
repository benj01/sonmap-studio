import { FeatureCollection } from 'geojson';
import { BaseProcessor, ProcessorOptions, AnalyzeResult, ProcessorResult, ProcessorRegistry } from './base-processor';
import { GeoFeature } from '../../../types/geo';
import { DxfData } from '../utils/dxf/types';
import { createDxfParser } from '../utils/dxf/core-parser';
import { createDxfAnalyzer } from '../utils/dxf/analyzer';
import { createDxfConverter, DxfConversionOptions } from '../utils/dxf/converters';
import { COORDINATE_SYSTEMS, CoordinateSystem } from '../types/coordinates';
import { ErrorReporter, ErrorReporterOptions, ErrorMessage, Severity, GeoLoaderError } from '../utils/errors';
import { initializeCoordinateSystems } from '../utils/coordinate-systems';
import { EventEmitter } from 'events';

/**
 * Progress phases for DXF processing
 */
const PROGRESS = {
  PARSE: { start: 0, end: 0.3 },
  ANALYZE: { start: 0.3, end: 0.5 },
  CONVERT: { start: 0.5, end: 1.0 }
};

/**
 * Result of DXF analysis
 */
interface DxfAnalysisResult {
  layers: Record<string, any>;
  coordinateSystem: CoordinateSystem; // Changed to required
  warnings: string[];
}

/**
 * Extended processor options
 */
interface DxfProcessorOptions extends ProcessorOptions {
  onError?: (message: string) => void;
  onWarning?: (message: string) => void;
}

/**
 * Event types for DXF error reporter
 */
type DxfErrorEventType = 'error' | 'warning';
type DxfErrorEventListener = (message: string, code?: string) => void;

interface DxfErrorEvents {
  error: [message: string, code: string];
  warning: [message: string];
}

/**
 * Custom error reporter for DXF processing
 */
class DxfErrorReporter extends ErrorReporter {
  private emitter = new EventEmitter();
  private listeners = new Map<DxfErrorEventType, Set<DxfErrorEventListener>>();
  private disposed = false;

  constructor(options: Required<ErrorReporterOptions>) {
    super(options);
    // Initialize listener sets
    this.listeners.set('error', new Set());
    this.listeners.set('warning', new Set());
  }

  /**
   * Add an event listener for error or warning events
   * @param event The event type ('error' or 'warning')
   * @param listener The callback function to handle the event
   * @throws Error if the reporter has been disposed
   */
  on<K extends keyof DxfErrorEvents>(event: K, listener: (...args: DxfErrorEvents[K]) => void): void {
    if (this.disposed) {
      throw new Error('Cannot add listener to disposed error reporter');
    }
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.add(listener as DxfErrorEventListener);
      this.emitter.on(event, listener);
    }
  }

  /**
   * Remove an event listener
   * @param event The event type ('error' or 'warning')
   * @param listener The callback function to remove
   */
  off<K extends keyof DxfErrorEvents>(event: K, listener: (...args: DxfErrorEvents[K]) => void): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.delete(listener as DxfErrorEventListener);
      this.emitter.off(event, listener);
    }
  }

  /**
   * Remove all event listeners and clean up resources
   */
  dispose(): void {
    if (!this.disposed) {
      this.removeAllListeners();
      this.disposed = true;
    }
  }

  /**
   * Remove all event listeners
   */
  removeAllListeners(): void {
    this.listeners.forEach((listeners, event) => {
      listeners.forEach(listener => {
        this.emitter.off(event, listener);
      });
      listeners.clear();
    });
  }

  addError(message: string, code: string, details?: Record<string, unknown>): void {
    if (this.disposed) {
      return;
    }
    if (!code) {
      code = 'UNKNOWN_ERROR';
    }
    super.addError(message, code, details);
    this.emitter.emit('error', message, code);
  }

  addWarning(message: string, code: string, details?: Record<string, unknown>): void {
    if (this.disposed) {
      return;
    }
    if (!code) {
      code = 'UNKNOWN_WARNING';
    }
    super.addWarning(message, code, details);
    this.emitter.emit('warning', message);
  }
}

/**
 * Processor for DXF files
 */
export class DxfProcessor extends BaseProcessor {
  private parser = createDxfParser();
  private analyzer = createDxfAnalyzer();
  private rawDxfData: DxfData | null = null;
  private cleanupFn: (() => void) | null = null;
  protected stats = this.createDefaultStats();
  protected errorReporter: DxfErrorReporter;
  protected options: DxfProcessorOptions;

  constructor(options: DxfProcessorOptions) {
    super(options);
    this.options = options;
    this.errorReporter = new DxfErrorReporter({
      logToConsole: true,
      minSeverity: Severity.INFO,
      maxErrors: 100
    });

    // Subscribe to error reporter events
    const handleError = (message: string, code: string) => {
      if (this.options.onError) {
        this.options.onError(message);
        this.recordError(this.stats, code, message);
      }
    };

    const handleWarning = (message: string) => {
      if (this.options.onWarning) {
        this.options.onWarning(message);
      }
    };

    this.errorReporter.on('error', handleError);
    this.errorReporter.on('warning', handleWarning);

    // Clean up event listeners when the processor is destroyed
    this.cleanupFn = () => {
      this.errorReporter.off('error', handleError);
      this.errorReporter.off('warning', handleWarning);
      this.errorReporter.dispose();
    };

    // Add cleanup to window unload event
    if (typeof window !== 'undefined') {
      window.addEventListener('unload', this.cleanupFn);
    }
  }

  dispose(): void {
    if (this.cleanupFn) {
      if (typeof window !== 'undefined') {
        window.removeEventListener('unload', this.cleanupFn);
      }
      this.cleanupFn();
      this.cleanupFn = null;
    }
  }

  async canProcess(file: File): Promise<boolean> {
    return file.name.toLowerCase().endsWith('dxf');
  }

  private async readFileContent(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!file) {
        reject(new Error('No file provided'));
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result !== 'string') {
          reject(new Error('Invalid file content'));
          return;
        }
        resolve(reader.result);
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.onabort = () => reject(new Error('File reading aborted'));

      try {
        reader.readAsText(file);
      } catch (error) {
        reject(new Error(`Failed to read file: ${error instanceof Error ? error.message : String(error)}`));
      }
    });
  }

  private async parseDxf(content: string): Promise<DxfData> {
    const updateProgress = (progress: number) => {
      const scaledProgress = PROGRESS.PARSE.start + 
        (PROGRESS.PARSE.end - PROGRESS.PARSE.start) * progress;
      this.emitProgress(scaledProgress);
    };

    try {
      const dxfData = await this.parser.parse(content, { onProgress: updateProgress });
      this.rawDxfData = dxfData;
      return dxfData;
    } catch (error) {
      throw new Error(`Failed to parse DXF file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async analyze(file: File): Promise<AnalyzeResult> {
    try {
      // Read and parse the DXF file
      const content = await this.readFileContent(file);
      const dxfData = await this.parseDxf(content);

      // Analyze the DXF data
      const analysisResult = await this.analyzer.analyze(dxfData);
      const dxfResult = analysisResult as unknown as DxfAnalysisResult;
      for (const warning of dxfResult.warnings) {
        this.errorReporter.addWarning('DXF Analysis Warning', 'DXF_ANALYSIS_WARNING', { message: warning });
      }

      // Use provided coordinate system or detected system
      const detectedSystem = dxfResult.coordinateSystem || COORDINATE_SYSTEMS.NONE;
      console.log('DXF Analysis - Detected coordinate system:', detectedSystem);

      // Initialize coordinate systems if needed
      if (detectedSystem !== COORDINATE_SYSTEMS.NONE) {
        try {
          initializeCoordinateSystems();
        } catch (error) {
          console.warn('Failed to initialize coordinate systems:', error);
        }
      }

      // Create a converter for preview features
      const converter = createDxfConverter(this.errorReporter);
      const conversionOptions: DxfConversionOptions = {
        includeStyles: true,
        layerInfo: dxfResult.layers,
        coordinateSystem: detectedSystem
      };

      console.log('Preview conversion using coordinate system:', detectedSystem);

      // Convert a sample of entities for preview
      const previewFeatures = converter.convertEntities(
        dxfData.entities.slice(0, 1000),
        conversionOptions
      );

      // Calculate bounds from preview features
      const bounds = this.calculateBounds(previewFeatures);

      const result: AnalyzeResult = {
        layers: Object.keys(dxfResult.layers || {}),
        coordinateSystem: detectedSystem,
        bounds,
        preview: {
          type: 'FeatureCollection',
          features: previewFeatures
        },
        dxfData
      };

      console.log('DXF Analysis complete:', {
        layers: result.layers.length,
        coordinateSystem: result.coordinateSystem,
        features: result.preview.features.length
      });

      return result;
    } catch (error) {
      if (error instanceof GeoLoaderError) {
        throw error;
      }
      throw new GeoLoaderError(
        `DXF analysis failed: ${error instanceof Error ? error.message : String(error)}`,
        'DXF_ANALYSIS_ERROR'
      );
    }
  }

  async process(file: File): Promise<ProcessorResult> {
    try {
      // Use cached DXF data if available, otherwise parse the file
      const dxfData = this.rawDxfData || await this.parseDxf(await this.readFileContent(file));

      // Determine coordinate system
      let detectedSystem = this.options.coordinateSystem || 
        (dxfData.header && this.analyzer.analyze(dxfData).coordinateSystem) || 
        COORDINATE_SYSTEMS.NONE;

      // Initialize coordinate systems if needed and not already initialized
      if (detectedSystem !== COORDINATE_SYSTEMS.NONE) {
        try {
          initializeCoordinateSystems();
        } catch (error) {
          // Log error but don't throw - fall back to NONE coordinate system
          console.warn('Failed to initialize coordinate systems:', error);
          detectedSystem = COORDINATE_SYSTEMS.NONE;
        }
      }

      console.log('Using coordinate system:', detectedSystem);

      // Create a converter
      const converter = createDxfConverter(this.errorReporter);
      const conversionOptions: DxfConversionOptions = {
        includeStyles: true,
        layerInfo: dxfData.tables?.layer?.layers,
        validateEntities: true,
        skipInvalidEntities: true,
        coordinateSystem: detectedSystem
      };

      console.log('Converting entities with options:', conversionOptions);

      // Convert entities in chunks to maintain responsiveness
      const CHUNK_SIZE = 500;
      const features: GeoFeature[] = [];
      const totalChunks = Math.ceil(dxfData.entities.length / CHUNK_SIZE);

      for (let i = 0; i < dxfData.entities.length; i += CHUNK_SIZE) {
        const chunk = dxfData.entities.slice(i, i + CHUNK_SIZE);
        const chunkFeatures = converter.convertEntities(chunk, conversionOptions);
        features.push(...chunkFeatures);

        // Update progress
        const progress = PROGRESS.CONVERT.start +
          ((i + chunk.length) / dxfData.entities.length) *
          (PROGRESS.CONVERT.end - PROGRESS.CONVERT.start);
        this.emitProgress(progress);
      }

      // Calculate final bounds
      const bounds = this.calculateBounds(features);

      // Get all available layers
      const layers = Object.keys(dxfData.tables?.layer?.layers || {});

      return {
        features: {
          type: 'FeatureCollection',
          features
        },
        bounds,
        layers,
        coordinateSystem: detectedSystem,
        statistics: this.stats,
        dxfData
      };
    } catch (error) {
      if (error instanceof GeoLoaderError) {
        throw error;
      }
      throw new GeoLoaderError(
        `DXF processing failed: ${error instanceof Error ? error.message : String(error)}`,
        'DXF_PROCESSING_ERROR'
      );
    }
  }

  private calculateBounds(features: GeoFeature[]): ProcessorResult['bounds'] {
    if (features.length === 0) {
      return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const feature of features) {
      if (feature.bbox) {
        minX = Math.min(minX, feature.bbox[0]);
        minY = Math.min(minY, feature.bbox[1]);
        maxX = Math.max(maxX, feature.bbox[2]);
        maxY = Math.max(maxY, feature.bbox[3]);
      }
    }

    return { minX, minY, maxX, maxY };
  }
}

// Register the processor
ProcessorRegistry.register('dxf', DxfProcessor);
