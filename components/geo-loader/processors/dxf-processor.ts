import { FeatureCollection } from 'geojson';
import { BaseProcessor, ProcessorOptions, AnalyzeResult, ProcessorResult, ProcessorRegistry } from './base-processor';
import { GeoFeature } from '../../../types/geo';
import { DxfData } from '../utils/dxf/types';
import { createDxfParser } from '../utils/dxf/core-parser';
import { createDxfAnalyzer } from '../utils/dxf/analyzer';
import { createDxfConverter, DxfConversionOptions } from '../utils/dxf/converters';
import { COORDINATE_SYSTEMS, CoordinateSystem } from '../types/coordinates';
import { ErrorReporter, ErrorReporterOptions, ErrorMessage, Severity, GeoLoaderError } from '../utils/errors';
import { 
  initializeCoordinateSystems,
  areCoordinateSystemsInitialized,
  createTransformer
} from '../utils/coordinate-systems';
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
  coordinateSystem: CoordinateSystem;
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

  off<K extends keyof DxfErrorEvents>(event: K, listener: (...args: DxfErrorEvents[K]) => void): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.delete(listener as DxfErrorEventListener);
      this.emitter.off(event, listener);
    }
  }

  dispose(): void {
    if (!this.disposed) {
      this.removeAllListeners();
      this.disposed = true;
    }
  }

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
        const error = new Error('No file provided');
        this.errorReporter.addError('File reading error', 'NO_FILE_PROVIDED');
        reject(error);
        return;
      }

      console.log('[DEBUG] Starting to read file:', {
        name: file.name,
        size: file.size,
        type: file.type
      });

      const reader = new FileReader();
      
      reader.onload = () => {
        if (typeof reader.result !== 'string') {
          const error = new Error('Invalid file content');
          this.errorReporter.addError('File reading error', 'INVALID_CONTENT_TYPE');
          reject(error);
          return;
        }
        
        const content = reader.result;
        console.log('[DEBUG] File read complete:', {
          contentLength: content.length,
          firstChars: content.substring(0, 100)
        });
        
        if (content.trim().length === 0) {
          const error = new Error('File is empty');
          this.errorReporter.addError('File reading error', 'EMPTY_FILE');
          reject(error);
          return;
        }

        resolve(content);
      };

      reader.onerror = () => {
        const error = new Error('Failed to read file');
        this.errorReporter.addError('File reading error', 'READ_ERROR', {
          readerError: reader.error
        });
        reject(error);
      };

      reader.onabort = () => {
        const error = new Error('File reading aborted');
        this.errorReporter.addError('File reading error', 'READ_ABORTED');
        reject(error);
      };

      try {
        reader.readAsText(file);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.errorReporter.addError('File reading error', 'READ_EXCEPTION', {
          error: message
        });
        reject(new Error(`Failed to read file: ${message}`));
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
      const message = error instanceof Error ? error.message : String(error);
      this.errorReporter.addError(
        `Failed to parse DXF file: ${message}`,
        'DXF_PARSE_ERROR',
        {
          phase: 'parsing',
          contentLength: content.length,
          error: error instanceof Error ? error.stack : undefined
        }
      );
      throw new GeoLoaderError(
        `Failed to parse DXF file: ${message}`,
        'DXF_PARSE_ERROR'
      );
    }
  }

  async analyze(file: File): Promise<AnalyzeResult> {
    try {
      // Read and parse the DXF file
      const content = await this.readFileContent(file);
      const dxfData = await this.parseDxf(content);

      // Analyze the DXF data
      const analysisResult = await this.analyzer.analyze(dxfData);
      
      // Forward all messages from the analyzer's error reporter to our error reporter
      analysisResult.errorReporter.getMessages().forEach(message => {
        switch (message.severity) {
          case Severity.ERROR:
            this.errorReporter.addError(message.message, message.code, message.details);
            break;
          case Severity.WARNING:
            this.errorReporter.addWarning(message.message, message.code, message.details);
            break;
          case Severity.INFO:
            this.errorReporter.addInfo(message.message, message.code, message.details);
            break;
        }
      });

      // Use detected coordinate system from analysis
      let coordinateSystem = analysisResult.coordinateSystem || COORDINATE_SYSTEMS.NONE;
      
      // Log coordinate system detection result
      this.errorReporter.addInfo(
        `Detected coordinate system: ${coordinateSystem}`,
        'COORDINATE_SYSTEM_DETECTION',
        { 
          system: coordinateSystem,
          confidence: analysisResult.coordinateSystem ? 'high' : 'fallback',
          source: analysisResult.coordinateSystem ? 'analysis' : 'default'
        }
      );

      // Initialize coordinate systems if needed
      if (coordinateSystem !== COORDINATE_SYSTEMS.NONE) {
        try {
          initializeCoordinateSystems();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.errorReporter.addWarning(
            `Failed to initialize coordinate systems: ${message}`,
            'COORDINATE_SYSTEM_INITIALIZATION_WARNING',
            {
              system: coordinateSystem,
              error: error instanceof Error ? error.stack : undefined
            }
          );
          // Don't throw - we'll continue with NONE coordinate system
          coordinateSystem = COORDINATE_SYSTEMS.NONE;
        }
      }

      // Create a converter for preview features
      const converter = createDxfConverter(this.errorReporter);
      const conversionOptions: DxfConversionOptions = {
        includeStyles: true,
        layerInfo: dxfData.tables?.layer?.layers || {},
        coordinateSystem: coordinateSystem,
        validateEntities: true,
        skipInvalidEntities: true
      };

      this.errorReporter.addInfo(
        'Starting preview conversion',
        'PREVIEW_CONVERSION_START',
        {
          coordinateSystem: coordinateSystem,
          options: conversionOptions
        }
      );

      // Convert a sample of entities for preview
      const previewFeatures = converter.convertEntities(
        dxfData.entities.slice(0, 1000),
        conversionOptions
      );

      // Calculate bounds from preview features
      const bounds = this.calculateBounds(previewFeatures);

      const result: AnalyzeResult = {
        layers: Object.keys(dxfData.tables?.layer?.layers || {}),
        coordinateSystem: coordinateSystem,
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

      // Determine coordinate system with progressive detection strategy
      let coordinateSystem: CoordinateSystem = this.options.coordinateSystem || COORDINATE_SYSTEMS.NONE;
      let detectionSource = 'options';
      let confidence = this.options.coordinateSystem ? 'high' : 'none';
      
      // Try header-based detection if no system provided
      if (coordinateSystem === COORDINATE_SYSTEMS.NONE && dxfData.header) {
        try {
          const analysisResult = this.analyzer.analyze(dxfData);
          if (analysisResult.coordinateSystem) {
            coordinateSystem = analysisResult.coordinateSystem;
            detectionSource = 'header';
            confidence = 'high';
            
            // Verify the detected system by testing coordinate transformation
            if (areCoordinateSystemsInitialized() || initializeCoordinateSystems()) {
              try {
                const transformer = createTransformer(coordinateSystem, COORDINATE_SYSTEMS.WGS84);
                // Use a sample point based on the coordinate system
                const testPoint = coordinateSystem === COORDINATE_SYSTEMS.SWISS_LV95 
                  ? { x: 2600000, y: 1200000 }  // Center point of LV95
                  : coordinateSystem === COORDINATE_SYSTEMS.SWISS_LV03
                  ? { x: 600000, y: 200000 }    // Center point of LV03
                  : { x: 8.0, y: 47.0 };        // Default test point in Switzerland

                transformer.transform(testPoint);
                confidence = 'verified';
              } catch (error) {
                this.errorReporter.addWarning(
                  'Coordinate system verification failed',
                  'COORDINATE_SYSTEM_VERIFICATION_WARNING',
                  {
                    system: coordinateSystem,
                    error: error instanceof Error ? error.stack : undefined
                  }
                );
                confidence = 'unverified';
              }
            }
          }
          
          this.errorReporter.addInfo(
            `Coordinate system detection result: ${coordinateSystem}`,
            'COORDINATE_SYSTEM_DETECTION',
            {
              system: coordinateSystem,
              source: detectionSource,
              confidence,
              header: dxfData.header
            }
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.errorReporter.addWarning(
            `Failed to detect coordinate system: ${message}`,
            'COORDINATE_SYSTEM_DETECTION_WARNING',
            {
              error: error instanceof Error ? error.stack : undefined,
              header: dxfData.header,
              fallbackSystem: COORDINATE_SYSTEMS.NONE
            }
          );
          coordinateSystem = COORDINATE_SYSTEMS.NONE;
          detectionSource = 'fallback';
          confidence = 'none';
        }
      }

      // If no system detected, try point-based detection
      if (coordinateSystem === COORDINATE_SYSTEMS.NONE && dxfData.entities.length > 0) {
        try {
          // Sample some points for detection
          const samplePoints = dxfData.entities
            .slice(0, 100)
            .flatMap(entity => {
              if ('vertices' in entity) return entity.vertices || [];
              if ('position' in entity) return [entity.position];
              return [];
            })
            .filter(point => point && typeof point.x === 'number' && typeof point.y === 'number')
            .map(point => ({ x: point.x, y: point.y }));

          if (samplePoints.length > 0) {
            // Check if points match Swiss coordinate ranges
            const isInSwissRange = samplePoints.every(point => {
              const isLV95Range = point.x >= 2000000 && point.x <= 3000000 && point.y >= 1000000 && point.y <= 2000000;
              const isLV03Range = point.x >= 400000 && point.x <= 900000 && point.y >= 0 && point.y <= 400000;
              return isLV95Range || isLV03Range;
            });

            if (isInSwissRange) {
              // Determine if LV95 or LV03 based on coordinate ranges
              const isLV95 = samplePoints[0].x > 1000000;
              coordinateSystem = isLV95 ? COORDINATE_SYSTEMS.SWISS_LV95 : COORDINATE_SYSTEMS.SWISS_LV03;
              detectionSource = 'point-based';
              confidence = 'medium';

              this.errorReporter.addInfo(
                'Detected Swiss coordinate system from point ranges',
                'COORDINATE_SYSTEM_POINT_DETECTION',
                {
                  system: coordinateSystem,
                  sampleSize: samplePoints.length,
                  ranges: {
                    x: {
                      min: Math.min(...samplePoints.map(p => p.x)),
                      max: Math.max(...samplePoints.map(p => p.x))
                    },
                    y: {
                      min: Math.min(...samplePoints.map(p => p.y)),
                      max: Math.max(...samplePoints.map(p => p.y))
                    }
                  }
                }
              );
            }
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.errorReporter.addWarning(
            `Point-based detection failed: ${message}`,
            'POINT_DETECTION_WARNING',
            {
              error: error instanceof Error ? error.stack : undefined
            }
          );
        }
      }

      // Initialize coordinate systems if needed
      if (coordinateSystem !== COORDINATE_SYSTEMS.NONE) {
        try {
          initializeCoordinateSystems();
          this.errorReporter.addInfo(
            'Initialized coordinate systems',
            'COORDINATE_SYSTEM_INITIALIZATION',
            { system: coordinateSystem }
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.errorReporter.addWarning(
            `Failed to initialize coordinate systems: ${message}`,
            'COORDINATE_SYSTEM_INITIALIZATION_WARNING',
            {
              system: coordinateSystem,
              error: error instanceof Error ? error.stack : undefined
            }
          );
          coordinateSystem = COORDINATE_SYSTEMS.NONE;
        }
      }

      // Create a converter
      const converter = createDxfConverter(this.errorReporter);
      const conversionOptions: DxfConversionOptions = {
        includeStyles: true,
        layerInfo: dxfData.tables?.layer?.layers,
        validateEntities: true,
        skipInvalidEntities: true,
        coordinateSystem: coordinateSystem
      };

      this.errorReporter.addInfo(
        'Starting entity conversion',
        'ENTITY_CONVERSION_START',
        {
          totalEntities: dxfData.entities.length,
          coordinateSystem: coordinateSystem,
          options: conversionOptions
        }
      );

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
        coordinateSystem: coordinateSystem,
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
