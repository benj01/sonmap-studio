import { Feature, FeatureCollection, Position } from 'geojson';
import { StreamProcessor } from '../../stream/stream-processor';
import { AnalyzeResult, ProcessorResult } from '../../base/types';
import { StreamProcessorResult } from '../../stream/types';
import { ShapefileParser } from './parser';
import { ShapefileProcessorOptions, ShapefileParseOptions } from './types';
import { ValidationError } from '../../../errors/types';

/**
 * Processor for Shapefile files
 */
export class ShapefileProcessor extends StreamProcessor {
  private parser: ShapefileParser;
  private bounds: ProcessorResult['bounds'] = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity
  };
  private layers: string[] = [];
  private features: Feature[] = [];

  constructor(options: ShapefileProcessorOptions = {}) {
    super(options);
    this.parser = new ShapefileParser();
  }

  /**
   * Check if file can be processed
   */
  async canProcess(file: File): Promise<boolean> {
    return file.name.toLowerCase().endsWith('.shp');
  }

  /**
   * Analyze Shapefile
   */
  async analyze(file: File): Promise<AnalyzeResult> {
    try {
      const result = await this.parser.analyzeStructure(file, {
        previewRecords: (this.options as ShapefileProcessorOptions).previewRecords,
        parseDbf: (this.options as ShapefileProcessorOptions).importAttributes
      });

      // Report any issues found during analysis
      result.issues?.forEach(issue => {
        this.errorReporter.addWarning(
          issue.message,
          issue.type,
          issue.details
        );
      });

      // Convert preview records to features
      const previewFeatures = await this.parser.parseFeatures(file, {
        parseDbf: (this.options as ShapefileProcessorOptions).importAttributes,
        validate: (this.options as ShapefileProcessorOptions).validateGeometry,
        repair: (this.options as ShapefileProcessorOptions).repairGeometry,
        simplify: (this.options as ShapefileProcessorOptions).simplifyGeometry,
        tolerance: (this.options as ShapefileProcessorOptions).simplifyTolerance,
        maxRecords: 100
      });

      // Update layers (in shapefile case, it's just one layer)
      this.layers = ['shapes'];

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
        `Failed to analyze Shapefile: ${message}`,
        'SHAPEFILE_ANALYSIS_ERROR',
        undefined,
        { error: message }
      );
    }
  }

  /**
   * Process Shapefile in streaming mode
   */
  protected async processStream(file: File): Promise<StreamProcessorResult> {
    try {
      this.resetState();

      // Configure parsing options
      const parseOptions: ShapefileParseOptions = {
        parseDbf: (this.options as ShapefileProcessorOptions).importAttributes,
        validate: (this.options as ShapefileProcessorOptions).validateGeometry,
        repair: (this.options as ShapefileProcessorOptions).repairGeometry,
        simplify: (this.options as ShapefileProcessorOptions).simplifyGeometry,
        tolerance: (this.options as ShapefileProcessorOptions).simplifyTolerance
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
        error: `Failed to process Shapefile: ${message}`
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
    this.layers = ['shapes'];
    this.features = [];
  }

  /**
   * Update bounds with new features
   */
  private updateBounds(features: Feature[]): void {
    features.forEach(feature => {
      if (feature.geometry.type === 'Point') {
        const coords = feature.geometry.coordinates as Position;
        this.bounds.minX = Math.min(this.bounds.minX, coords[0] as number);
        this.bounds.minY = Math.min(this.bounds.minY, coords[1] as number);
        this.bounds.maxX = Math.max(this.bounds.maxX, coords[0] as number);
        this.bounds.maxY = Math.max(this.bounds.maxY, coords[1] as number);
      } else if (feature.geometry.type === 'LineString') {
        (feature.geometry.coordinates as Position[]).forEach(coords => {
          this.bounds.minX = Math.min(this.bounds.minX, coords[0] as number);
          this.bounds.minY = Math.min(this.bounds.minY, coords[1] as number);
          this.bounds.maxX = Math.max(this.bounds.maxX, coords[0] as number);
          this.bounds.maxY = Math.max(this.bounds.maxY, coords[1] as number);
        });
      } else if (feature.geometry.type === 'Polygon') {
        (feature.geometry.coordinates as Position[][]).forEach(ring => {
          ring.forEach(coords => {
            this.bounds.minX = Math.min(this.bounds.minX, coords[0] as number);
            this.bounds.minY = Math.min(this.bounds.minY, coords[1] as number);
            this.bounds.maxX = Math.max(this.bounds.maxX, coords[0] as number);
            this.bounds.maxY = Math.max(this.bounds.maxY, coords[1] as number);
          });
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
        const coords = feature.geometry.coordinates as Position;
        bounds.minX = Math.min(bounds.minX, coords[0] as number);
        bounds.minY = Math.min(bounds.minY, coords[1] as number);
        bounds.maxX = Math.max(bounds.maxX, coords[0] as number);
        bounds.maxY = Math.max(bounds.maxY, coords[1] as number);
      } else if (feature.geometry.type === 'LineString') {
        (feature.geometry.coordinates as Position[]).forEach(coords => {
          bounds.minX = Math.min(bounds.minX, coords[0] as number);
          bounds.minY = Math.min(bounds.minY, coords[1] as number);
          bounds.maxX = Math.max(bounds.maxX, coords[0] as number);
          bounds.maxY = Math.max(bounds.maxY, coords[1] as number);
        });
      } else if (feature.geometry.type === 'Polygon') {
        (feature.geometry.coordinates as Position[][]).forEach(ring => {
          ring.forEach(coords => {
            bounds.minX = Math.min(bounds.minX, coords[0] as number);
            bounds.minY = Math.min(bounds.minY, coords[1] as number);
            bounds.maxX = Math.max(bounds.maxX, coords[0] as number);
            bounds.maxY = Math.max(bounds.maxY, coords[1] as number);
          });
        });
      }
    });

    return bounds;
  }
}
