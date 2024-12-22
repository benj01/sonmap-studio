import { Feature, FeatureCollection } from 'geojson';
import { StreamProcessor } from '../../stream/stream-processor';
import { AnalyzeResult, ProcessorResult } from '../../base/types';
import { StreamProcessorResult } from '../../stream/types';
import { DxfParser } from './parser';
import { DxfProcessorOptions, DxfParseOptions, DxfEntity } from './types';
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
   * Convert DXF entities to GeoJSON features
   */
  async convertToFeatures(entities: unknown): Promise<Feature[]> {
    console.log('[DEBUG] Converting DXF entities to features');
    try {
      // Ensure entities is an array
      const entityArray = Array.isArray(entities) ? entities : [];
      console.log('[DEBUG] Entity array length:', entityArray.length);

      // Validate each entity has required structure
      const validEntities = entityArray.filter((entity): entity is DxfEntity => {
        const isValid = entity && 
                       typeof entity === 'object' && 
                       'type' in entity && 
                       'attributes' in entity && 
                       'data' in entity;
        
        if (!isValid) {
          console.warn('[DEBUG] Invalid entity structure:', entity);
        }
        
        return isValid;
      });

      console.log('[DEBUG] Valid entities to convert:', {
        total: entityArray.length,
        valid: validEntities.length,
        types: validEntities.map(e => e.type)
      });

      const features = await this.entityParser.convertToFeatures(validEntities);
      console.log('[DEBUG] Converted to features:', {
        count: features.length,
        types: Array.from(new Set(features.map(f => f.geometry.type)))
      });
      
      return features;
    } catch (error) {
      console.error('Failed to convert entities to features:', error);
      return [];
    }
  }

  /**
   * Analyze DXF file
   */
  async analyze(file: File): Promise<AnalyzeResult> {
    try {
      console.log('[DEBUG] Starting DXF analysis for:', file.name);
      
      // Parse DXF structure
      const parseResult = await this.parser.analyzeStructure(file, {
        previewEntities: (this.options as DxfProcessorOptions).previewEntities || 1000,
        parseBlocks: (this.options as DxfProcessorOptions).importBlocks,
        parseText: (this.options as DxfProcessorOptions).importText,
        parseDimensions: (this.options as DxfProcessorOptions).importDimensions
      });
      
      console.log('[DEBUG] Analysis structure:', {
        layers: parseResult.structure.layers.length,
        blocks: parseResult.structure.blocks.length,
        entityTypes: parseResult.structure.entityTypes,
        previewEntities: parseResult.preview.length
      });

      // Report any issues found during analysis
      parseResult.issues?.forEach(issue => {
        this.errorReporter.addWarning(
          issue.message,
          issue.type,
          issue.details
        );
      });

      // Convert preview entities to features
      console.log('[DEBUG] Converting preview entities...');
      if (!Array.isArray(parseResult.preview)) {
        console.error('[DEBUG] Preview entities is not an array:', parseResult.preview);
        parseResult.preview = [];
      }
      
      const previewFeatures = await this.convertToFeatures(parseResult.preview);
      console.log('[DEBUG] Preview features:', {
        input: parseResult.preview.length,
        converted: previewFeatures.length,
        types: new Set(previewFeatures.map(f => f.geometry.type))
      });

      if (previewFeatures.length === 0) {
        console.warn('[DEBUG] No preview features generated from entities');
        this.errorReporter.addWarning(
          'No preview features could be generated',
          'PREVIEW_GENERATION',
          { entityCount: parseResult.preview.length }
        );
      }

      // Update layers
      this.layers = parseResult.structure.layers.map(layer => layer.name);
      console.log('[DEBUG] Detected layers:', this.layers);

      // Calculate preview bounds
      const bounds = this.calculateBoundsFromFeatures(previewFeatures);
      console.log('[DEBUG] Calculated bounds:', bounds);

      // Detect coordinate system based on bounds
      let detectedSystem = this.options.coordinateSystem;
      if (!detectedSystem && bounds) {
        // Check for Swiss LV95 coordinates (typical range around 2.6M, 1.2M)
        if (bounds.minX > 2000000 && bounds.minX < 3000000 &&
            bounds.minY > 1000000 && bounds.minY < 1400000) {
          detectedSystem = 'EPSG:2056'; // Swiss LV95
          console.log('[DEBUG] Detected Swiss LV95 coordinates');
        }
        // Check for Swiss LV03 coordinates (typical range around 600k, 200k)
        else if (bounds.minX > 400000 && bounds.minX < 900000 &&
                bounds.minY > 0 && bounds.minY < 400000) {
          detectedSystem = 'EPSG:21781'; // Swiss LV03
          console.log('[DEBUG] Detected Swiss LV03 coordinates');
        }
        // Check for WGS84 coordinates
        else if (Math.abs(bounds.minX) <= 180 && Math.abs(bounds.maxX) <= 180 &&
                Math.abs(bounds.minY) <= 90 && Math.abs(bounds.maxY) <= 90) {
          detectedSystem = 'EPSG:4326'; // WGS84
          console.log('[DEBUG] Detected WGS84 coordinates');
        } else {
          console.warn('[DEBUG] Could not detect coordinate system from bounds:', bounds);
        }
      }

      const analyzeResult: AnalyzeResult = {
        layers: this.layers,
        coordinateSystem: detectedSystem,
        bounds,
        preview: {
          type: 'FeatureCollection',
          features: previewFeatures
        },
        dxfData: parseResult.structure
      };

      // Log analysis results
      console.log('[DEBUG] Analysis complete:', {
        layers: this.layers.length,
        features: previewFeatures.length,
        featureTypes: Array.from(new Set(previewFeatures.map(f => f.geometry.type))),
        coordinateSystem: detectedSystem,
        hasBounds: !!bounds
      });

      return analyzeResult;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[DEBUG] Analysis error:', message);
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
          const features = await this.convertToFeatures(entities);

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
    const updateBoundsWithCoord = (coord: number[]) => {
      this.bounds.minX = Math.min(this.bounds.minX, coord[0]);
      this.bounds.minY = Math.min(this.bounds.minY, coord[1]);
      this.bounds.maxX = Math.max(this.bounds.maxX, coord[0]);
      this.bounds.maxY = Math.max(this.bounds.maxY, coord[1]);
    };

    const processCoordinates = (coords: any) => {
      if (Array.isArray(coords)) {
        if (coords.length === 2 && typeof coords[0] === 'number') {
          // This is a coordinate pair
          updateBoundsWithCoord(coords);
        } else {
          // This is an array of coordinates or arrays
          coords.forEach(processCoordinates);
        }
      }
    };

    features.forEach(feature => {
      if (feature.geometry && 'coordinates' in feature.geometry) {
        processCoordinates(feature.geometry.coordinates);
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

    const updateBoundsWithCoord = (coord: number[]) => {
      bounds.minX = Math.min(bounds.minX, coord[0]);
      bounds.minY = Math.min(bounds.minY, coord[1]);
      bounds.maxX = Math.max(bounds.maxX, coord[0]);
      bounds.maxY = Math.max(bounds.maxY, coord[1]);
    };

    const processCoordinates = (coords: any) => {
      if (Array.isArray(coords)) {
        if (coords.length === 2 && typeof coords[0] === 'number') {
          // This is a coordinate pair
          updateBoundsWithCoord(coords);
        } else {
          // This is an array of coordinates or arrays
          coords.forEach(processCoordinates);
        }
      }
    };

    features.forEach(feature => {
      if (feature.geometry && 'coordinates' in feature.geometry) {
        processCoordinates(feature.geometry.coordinates);
      }
    });

    // If no valid coordinates were found, return default bounds
    if (bounds.minX === Infinity) {
      console.warn('[DEBUG] No valid coordinates found for bounds calculation');
      return {
        minX: -1,
        minY: -1,
        maxX: 1,
        maxY: 1
      };
    }

    console.log('[DEBUG] Calculated bounds:', bounds);
    return bounds;
  }
}
