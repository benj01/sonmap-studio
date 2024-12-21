import { Feature, FeatureCollection } from 'geojson';
import { StreamProcessor } from '../../stream/stream-processor';
import { AnalyzeResult, ProcessorResult } from '../../base/types';
import { StreamProcessorResult } from '../../stream/types';
import { DxfParser } from './parser';
import { DxfProcessorOptions, DxfParseOptions } from './types';
import { ValidationError } from '../../../errors/types';
import { StreamReader } from './utils/stream-reader';
import { BlockManager } from './utils/block-manager';
import { LayerManager } from './utils/layer-manager';
import { EntityParser } from './utils/entity-parser';

/**
 * Processor for DXF files
 */
export class DxfProcessor extends StreamProcessor {
  private parser: DxfParser;
  private blockManager: BlockManager;
  private layerManager: LayerManager;
  private entityParser: EntityParser;
  private streamReader: StreamReader | null = null;
  private bounds: ProcessorResult['bounds'] = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity
  };
  private layers: string[] = [];

  constructor(options: DxfProcessorOptions = {}) {
    super(options);
    this.blockManager = new BlockManager({ maxCacheSize: 100 });
    this.layerManager = new LayerManager();
    this.parser = new DxfParser();
    this.entityParser = new EntityParser(
      this.layerManager,
      this.blockManager,
      {
        validateGeometry: options.validateGeometry,
        preserveColors: options.preserveColors,
        preserveLineWeights: options.preserveLineWeights,
        coordinateSystem: options.coordinateSystem
      }
    );
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

      // Detect coordinate system based on bounds
      let detectedSystem = this.options.coordinateSystem;
      if (!detectedSystem && bounds) {
        // Check for Swiss LV95 coordinates (typical range around 2.6M, 1.2M)
        if (bounds.minX > 2000000 && bounds.minX < 3000000 &&
            bounds.minY > 1000000 && bounds.minY < 1400000) {
          detectedSystem = 'EPSG:2056'; // Swiss LV95
        }
        // Check for Swiss LV03 coordinates (typical range around 600k, 200k)
        else if (bounds.minX > 400000 && bounds.minX < 900000 &&
                bounds.minY > 0 && bounds.minY < 400000) {
          detectedSystem = 'EPSG:21781'; // Swiss LV03
        }
        // Check for WGS84 coordinates
        else if (Math.abs(bounds.minX) <= 180 && Math.abs(bounds.maxX) <= 180 &&
                Math.abs(bounds.minY) <= 90 && Math.abs(bounds.maxY) <= 90) {
          detectedSystem = 'EPSG:4326'; // WGS84
        }
      }

      return {
        layers: this.layers,
        coordinateSystem: detectedSystem,
        bounds,
        preview: {
          type: 'FeatureCollection',
          features: previewFeatures
        },
        dxfData: result.structure // Include the DXF structure data
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

      // Initialize stream reader with memory management
      this.streamReader = new StreamReader(file, {
        chunkSize: 64 * 1024, // 64KB chunks
        maxBuffers: 3,
        memoryLimit: 100 * 1024 * 1024 // 100MB
      });

      // Configure parsing options
      const parseOptions: DxfParseOptions = {
        entityTypes: (this.options as DxfProcessorOptions).entityTypes,
        parseBlocks: (this.options as DxfProcessorOptions).importBlocks,
        parseText: (this.options as DxfProcessorOptions).importText,
        parseDimensions: (this.options as DxfProcessorOptions).importDimensions,
        validate: (this.options as DxfProcessorOptions).validateGeometry
      };

      // Process file in chunks
      let chunkIndex = 0;
      for await (const chunk of this.streamReader.readChunks()) {
        try {
          // Parse entities from chunk
          const entities = await this.parser.parseEntities(chunk, parseOptions);
          
          // Convert entities to features
          const features = await this.entityParser.convertToFeatures(entities);

          if (features.length > 0) {
            // Process features
            const processedFeatures = await this.processChunk(features, chunkIndex++);
            
            // Update bounds
            this.updateBounds(processedFeatures);
            
            // Emit chunk
            this.handleChunk(processedFeatures, chunkIndex);
          }
        } catch (error) {
          console.warn('Failed to process chunk:', error);
          continue;
        }

        // Update progress based on bytes read
        const stats = this.streamReader.getStats();
        this.updateProgress(stats.bytesRead / stats.totalBytes);
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
    } finally {
      // Clean up
      this.streamReader?.clear();
      this.streamReader = null;
      this.blockManager.clearCache();
      this.layerManager.clear();
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
    this.blockManager.clearCache();
    this.layerManager.clear();
    if (this.streamReader) {
      this.streamReader.clear();
    }
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
