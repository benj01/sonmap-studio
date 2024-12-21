import { Feature, FeatureCollection } from 'geojson';
import { StreamProcessor } from '../../stream/stream-processor';
import { AnalyzeResult, ProcessorResult } from '../../base/types';
import { StreamProcessorResult } from '../../stream/types';
import { DxfParser } from './parser';
import { DxfProcessorOptions, DxfParseOptions } from './types';
import { ValidationError } from '../../../errors/types';

/**
 * Processor for DXF files
 */
export class DxfProcessor extends StreamProcessor {
  private parser: DxfParser;
  private bounds: ProcessorResult['bounds'] = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity
  };
  private layers: string[] = [];
  private features: Feature[] = [];

  constructor(options: DxfProcessorOptions = {}) {
    super(options);
    this.parser = new DxfParser();
  }

  /**
   * Check if file can be processed
   */
  async canProcess(file: File): Promise<boolean> {
    return file.name.toLowerCase().endsWith('.dxf');
  }

  /**
   * Analyze DXF file
   */
  async analyze(file: File): Promise<AnalyzeResult> {
    try {
      const result = await this.parser.analyzeStructure(file, {
        previewEntities: (this.options as DxfProcessorOptions).previewEntities,
        parseBlocks: (this.options as DxfProcessorOptions).importBlocks,
        parseText: (this.options as DxfProcessorOptions).importText,
        parseDimensions: (this.options as DxfProcessorOptions).importDimensions
      });

      // Report any issues found during analysis
      result.issues?.forEach(issue => {
        this.errorReporter.addWarning(
          issue.message,
          issue.type,
          issue.details
        );
      });

      // Convert preview entities to features
      const previewFeatures = await this.parser.parseFeatures(file, {
        entityTypes: (this.options as DxfProcessorOptions).entityTypes,
        parseBlocks: (this.options as DxfProcessorOptions).importBlocks,
        parseText: (this.options as DxfProcessorOptions).importText,
        parseDimensions: (this.options as DxfProcessorOptions).importDimensions,
        validate: (this.options as DxfProcessorOptions).validateGeometry,
        maxEntities: 100
      });

      // Update layers
      this.layers = result.structure.layers.map(layer => layer.name);

      // Calculate preview bounds
      const bounds = this.calculateBoundsFromFeatures(previewFeatures);

      return {
        layers: this.layers,
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
        `Failed to analyze DXF file: ${message}`,
        'DXF_ANALYSIS_ERROR',
        undefined,
        { error: message }
      );
    }
  }

  /**
   * Process DXF file in streaming mode
   */
  protected async processStream(file: File): Promise<StreamProcessorResult> {
    try {
      this.resetState();

      // Configure parsing options
      const parseOptions: DxfParseOptions = {
        entityTypes: (this.options as DxfProcessorOptions).entityTypes,
        parseBlocks: (this.options as DxfProcessorOptions).importBlocks,
        parseText: (this.options as DxfProcessorOptions).importText,
        parseDimensions: (this.options as DxfProcessorOptions).importDimensions,
        validate: (this.options as DxfProcessorOptions).validateGeometry
      };

      // Parse features
      this.features = await this.parser.parseFeatures(file, parseOptions);

      // Process features in chunks
      const chunkSize = 1000;
      for (let i = 0; i < this.features.length; i += chunkSize) {
        const chunk = this.features.slice(i, i + chunkSize);
        const processedChunk = await this.processChunk(chunk, i / chunkSize);
        
        // Update bounds
        this.updateBounds(processedChunk);
        
        // Update progress
        this.updateProgress(i / this.features.length);
      }

      return {
        statistics: this.state.statistics,
        success: true
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        statistics: this.state.statistics,
        success: false,
        error: `Failed to process DXF file: ${message}`
      };
    }
  }

  /**
   * Process a chunk of features
   */
  protected async processChunk(features: Feature[], chunkIndex: number): Promise<Feature[]> {
    // Update statistics
    features.forEach(feature => {
      this.updateStats(this.state.statistics, feature.geometry.type.toLowerCase());
    });

    // Emit chunk
    this.handleChunk(features, chunkIndex);

    return features;
  }

  /**
   * Calculate bounds from features
   */
  protected calculateBounds(): ProcessorResult['bounds'] {
    return this.bounds;
  }

  /**
   * Get available layers
   */
  protected getLayers(): string[] {
    return this.layers;
  }

  /**
   * Reset processor state
   */
  private resetState(): void {
    this.bounds = {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity
    };
    this.layers = [];
    this.features = [];
  }

  /**
   * Update bounds with new features
   */
  private updateBounds(features: Feature[]): void {
    features.forEach(feature => {
      if (feature.geometry.type === 'Point') {
        const coords = feature.geometry.coordinates;
        this.bounds.minX = Math.min(this.bounds.minX, coords[0]);
        this.bounds.minY = Math.min(this.bounds.minY, coords[1]);
        this.bounds.maxX = Math.max(this.bounds.maxX, coords[0]);
        this.bounds.maxY = Math.max(this.bounds.maxY, coords[1]);
      } else if (feature.geometry.type === 'LineString') {
        feature.geometry.coordinates.forEach(coords => {
          this.bounds.minX = Math.min(this.bounds.minX, coords[0]);
          this.bounds.minY = Math.min(this.bounds.minY, coords[1]);
          this.bounds.maxX = Math.max(this.bounds.maxX, coords[0]);
          this.bounds.maxY = Math.max(this.bounds.maxY, coords[1]);
        });
      }
    });
  }

  /**
   * Calculate bounds from a set of features
   */
  private calculateBoundsFromFeatures(features: Feature[]): ProcessorResult['bounds'] {
    const bounds = {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity
    };

    features.forEach(feature => {
      if (feature.geometry.type === 'Point') {
        const coords = feature.geometry.coordinates;
        bounds.minX = Math.min(bounds.minX, coords[0]);
        bounds.minY = Math.min(bounds.minY, coords[1]);
        bounds.maxX = Math.max(bounds.maxX, coords[0]);
        bounds.maxY = Math.max(bounds.maxY, coords[1]);
      } else if (feature.geometry.type === 'LineString') {
        feature.geometry.coordinates.forEach(coords => {
          bounds.minX = Math.min(bounds.minX, coords[0]);
          bounds.minY = Math.min(bounds.minY, coords[1]);
          bounds.maxX = Math.max(bounds.maxX, coords[0]);
          bounds.maxY = Math.max(bounds.maxY, coords[1]);
        });
      }
    });

    return bounds;
  }
}
