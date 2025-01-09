import { Feature, FeatureCollection, Point } from 'geojson';
import { StreamProcessor } from '../../stream/stream-processor';
import { AnalyzeResult, ProcessorResult } from '../../base/types';
import { StreamProcessorResult } from '../../stream/types';
import { CsvParser } from './parser';
import { CsvProcessorOptions, CsvParseOptions } from './types';
import { ValidationError } from '../../../errors/types';
import { coordinateSystemManager } from '../../../coordinate-systems/coordinate-system-manager';
import { COORDINATE_SYSTEMS } from '../../../../types/coordinates';
import { ErrorReporterImpl as ErrorReporter } from '../../../errors/reporter';
import { CompressedFile } from '../../../compression/compression-handler';

interface ProcessorState {
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  layers: string[];
  statistics: {
    featureCount: number;
    layerCount: number;
    featureTypes: Record<string, number>;
    failedTransformations: number;
    errors: Array<{
      message: string;
      details?: Record<string, unknown>;
    }>;
  };
}

/**
 * Processor for CSV files
 */
export class CsvProcessor extends StreamProcessor {
  private readonly parser: CsvParser;
  protected readonly errorReporter: ErrorReporter;

  protected getFeatureBounds(feature: Feature): { minX: number; minY: number; maxX: number; maxY: number; } {
    // For non-point features or invalid geometries, return infinite bounds
    if (!feature.geometry || feature.geometry.type !== 'Point') {
      return {
        minX: Infinity,
        minY: Infinity,
        maxX: -Infinity,
        maxY: -Infinity
      };
    }

    // For point features, use the point coordinates
    const [x, y] = feature.geometry.coordinates;
    return {
      minX: x,
      minY: y,
      maxX: x,
      maxY: y
    };
  }

  protected async processFileGroup(files: CompressedFile[]): Promise<Feature[]> {
    // CSV files are processed individually, not in groups
    if (files.length === 0) return [];
    
    const file = files[0];
    if (!(file.data instanceof File)) {
      throw new ValidationError(
        'Invalid file data',
        'INVALID_FILE_DATA',
        undefined,
        { fileName: file.name }
      );
    }

    const result = await this.process(file.data);
    return result.features;
  }

  private updateStats(stats: ProcessorState['statistics'], type: string): void {
    stats.featureCount++;
    stats.featureTypes[type] = (stats.featureTypes[type] || 0) + 1;
  }

  private readonly BUFFER_SIZE = 5000; // Size of each buffer in the pool
  private readonly MAX_BUFFERS = 3; // Maximum number of buffers to keep in memory
  private bufferPool: Feature[][] = [];
  private currentBuffer: Feature[] = [];
  protected processorState: ProcessorState = {
    bounds: {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity
    },
    layers: ['points'],
    statistics: {
      featureCount: 0,
      layerCount: 1,
      featureTypes: {},
      failedTransformations: 0,
      errors: []
    }
  };

  constructor(options: CsvProcessorOptions = {}) {
    super(options);
    this.parser = new CsvParser();
    this.errorReporter = options.errorReporter || new ErrorReporter();
    this.initializeBufferPool();
    this.initializeState();
  }

  private initializeState(): void {
    this.processorState = {
      bounds: {
        minX: Infinity,
        minY: Infinity,
        maxX: -Infinity,
        maxY: -Infinity
      },
      layers: ['points'],
      statistics: {
        featureCount: 0,
        layerCount: 1,
        featureTypes: {},
        failedTransformations: 0,
        errors: []
      }
    };
  }

  private initializeBufferPool(): void {
    this.bufferPool = Array(this.MAX_BUFFERS).fill(null).map(() => []);
    this.currentBuffer = this.bufferPool[0];
  }

  private getNextBuffer(): Feature[] {
    const emptyBuffer = this.bufferPool.find(buffer => buffer.length === 0);
    if (emptyBuffer) {
      return emptyBuffer;
    }
    const newBuffer: Feature[] = [];
    this.bufferPool.push(newBuffer);
    if (this.bufferPool.length > this.MAX_BUFFERS) {
      this.bufferPool.shift();
    }
    return newBuffer;
  }

  private clearBuffer(buffer: Feature[]): void {
    buffer.length = 0;
  }

  async canProcess(file: File): Promise<boolean> {
    return file.name.toLowerCase().endsWith('.csv');
  }

  async analyze(file: File): Promise<AnalyzeResult> {
    try {
      const result = await this.parser.analyzeStructure(file, {
        previewRows: (this.options as CsvProcessorOptions).previewRows,
        detectTypes: (this.options as CsvProcessorOptions).detectTypes,
        hasHeaders: (this.options as CsvProcessorOptions).hasHeaders,
        delimiter: (this.options as CsvProcessorOptions).delimiter,
        quote: (this.options as CsvProcessorOptions).quote
      });

      result.issues?.forEach(issue => {
        this.errorReporter.addWarning(
          issue.message,
          issue.type,
          issue.details
        );
      });

      const previewFeatures = await this.parser.parseFeatures(file, {
        columns: result.structure.columns,
        hasHeaders: result.structure.hasHeaders,
        delimiter: result.structure.delimiter,
        quote: result.structure.quote,
        maxRows: 100
      });

      const bounds = this.calculateBoundsFromFeatures(previewFeatures);

      return {
        layers: ['points'],
        coordinateSystem: this.options.coordinateSystem,
        bounds,
        preview: {
          type: 'FeatureCollection',
          features: previewFeatures
        }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ValidationError(
        `Failed to analyze CSV file: ${message}`,
        'CSV_ANALYSIS_ERROR',
        undefined,
        { error: message }
      );
    }
  }

  protected async processChunk(features: Feature[], chunkIndex: number): Promise<Feature[]> {
    features.forEach(feature => {
      this.updateStats(this.processorState.statistics, 'point');
    });

    this.updateBoundsFromFeatures(features);
    this.handleChunk(features, chunkIndex);

    return features;
  }

  protected calculateBounds(): ProcessorResult['bounds'] {
    return this.processorState.bounds;
  }

  protected getLayers(): string[] {
    return this.processorState.layers;
  }

  protected async processStream(file: File): Promise<StreamProcessorResult> {
    try {
      this.initializeState();

      if (!coordinateSystemManager.isInitialized()) {
        await coordinateSystemManager.initialize();
      }

      const targetSystem = this.options.coordinateSystem || COORDINATE_SYSTEMS.WGS84;

      const structure = await this.parser.analyzeStructure(file, {
        detectTypes: (this.options as CsvProcessorOptions).detectTypes,
        hasHeaders: (this.options as CsvProcessorOptions).hasHeaders,
        delimiter: (this.options as CsvProcessorOptions).delimiter,
        quote: (this.options as CsvProcessorOptions).quote
      });

      const parseOptions: CsvParseOptions = {
        columns: structure.structure.columns,
        hasHeaders: structure.structure.hasHeaders,
        delimiter: structure.structure.delimiter,
        quote: structure.structure.quote,
        comment: (this.options as CsvProcessorOptions).comment,
        skipRows: (this.options as CsvProcessorOptions).skipRows,
        validate: (this.options as CsvProcessorOptions).validateCoordinates
      };

      const reader = new ReadableStreamDefaultReader(file.stream());
      const decoder = new TextDecoder();
      let buffer = '';
      let processedRows = 0;
      let currentBuffer = this.getNextBuffer();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (processedRows++ < (parseOptions.skipRows || 0)) continue;
          
          try {
            const feature = await this.parser.parseFeatures(file, {
              ...parseOptions,
              maxRows: 1,
              skipRows: processedRows - 1
            }).then(features => features[0]);

            if (!feature) continue;

            if (feature.geometry.type === 'Point') {
              const [x, y, z] = feature.geometry.coordinates;
              try {
                const transformed = await coordinateSystemManager.transform(
                  { x, y },
                  COORDINATE_SYSTEMS.SWISS_LV95,
                  targetSystem
                );
                feature.geometry.coordinates = z !== undefined 
                  ? [transformed.x, transformed.y, z]
                  : [transformed.x, transformed.y];
              } catch (error) {
                this.processorState.statistics.errors.push({
                  message: `Failed to transform coordinates: ${error instanceof Error ? error.message : String(error)}`,
                  details: { coordinates: feature.geometry.coordinates }
                });
                this.processorState.statistics.failedTransformations++;
                continue;
              }
            }
            
            currentBuffer.push(feature);
            
            if (currentBuffer.length >= this.BUFFER_SIZE) {
              await this.processChunk(currentBuffer, processedRows);
              this.clearBuffer(currentBuffer);
              currentBuffer = this.getNextBuffer();
            }
          } catch (error) {
            this.processorState.statistics.errors.push({
              message: `Failed to parse line: ${error instanceof Error ? error.message : String(error)}`,
              details: { line }
            });
          }
        }

        this.updateProgress(processedRows / file.size);
      }
      
      if (currentBuffer.length > 0) {
        await this.processChunk(currentBuffer, processedRows);
      }

      return {
        statistics: this.processorState.statistics,
        success: true
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        statistics: this.processorState.statistics,
        success: false,
        error: `Failed to process CSV file: ${message}`
      };
    }
  }

  private updateBoundsFromFeatures(features: Feature[]): void {
    features.forEach(feature => {
      if (feature.geometry.type === 'Point') {
        const [x, y] = feature.geometry.coordinates;
        this.processorState.bounds.minX = Math.min(this.processorState.bounds.minX, x);
        this.processorState.bounds.minY = Math.min(this.processorState.bounds.minY, y);
        this.processorState.bounds.maxX = Math.max(this.processorState.bounds.maxX, x);
        this.processorState.bounds.maxY = Math.max(this.processorState.bounds.maxY, y);
      }
    });
  }

  private calculateBoundsFromFeatures(features: Feature[]): ProcessorResult['bounds'] {
    const bounds = {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity
    };

    features.forEach(feature => {
      if (feature.geometry.type === 'Point') {
        const [x, y] = feature.geometry.coordinates;
        bounds.minX = Math.min(bounds.minX, x);
        bounds.minY = Math.min(bounds.minY, y);
        bounds.maxX = Math.max(bounds.maxX, x);
        bounds.maxY = Math.max(bounds.maxY, y);
      }
    });

    return bounds;
  }
}
