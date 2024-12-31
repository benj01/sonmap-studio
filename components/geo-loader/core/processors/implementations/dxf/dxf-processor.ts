import { Feature, FeatureCollection } from 'geojson';
import { StreamProcessor } from '../../stream/stream-processor';
import { AnalyzeResult, ProcessorResult } from '../../base/types';
import { CoordinateSystem } from '../../../../types/coordinates';
import { StreamProcessorResult, StreamProcessorState } from '../../stream/types';
import { DxfProcessorOptions, DxfParseOptions, DxfStructure, DxfEntity, DxfLayer } from './types';
import { ValidationError } from '../../../errors/types';
import { DxfParserWrapper } from './parsers/dxf-parser-wrapper';
import { DxfAnalyzer } from './modules/analyzer';
import { DxfTransformer } from './modules/transformer';
import { DxfEntityProcessor } from './modules/entity-processor';
import { DxfLayerProcessor } from './modules/layer-processor';
import { DxfCoordinateHandler } from './modules/coordinate-handler';
import { createPreviewManager } from '../../../../preview/preview-manager';

/**
 * Processor for DXF files
 */
export class DxfProcessor extends StreamProcessor {
  private parser: DxfParserWrapper;
  protected state: StreamProcessorState & { features: DxfEntity[] };

  constructor(options: DxfProcessorOptions = {}) {
    super(options);
    this.parser = DxfParserWrapper.getInstance();
    this.state = this.createDxfProcessorState();
  }

  /**
   * Create initial state for DXF processor
   */
  private createDxfProcessorState(): StreamProcessorState & { features: DxfEntity[] } {
    return {
      isProcessing: false,
      progress: 0,
      featuresProcessed: 0,
      chunksProcessed: 0,
      statistics: {
        featureCount: 0,
        layerCount: 0,
        featureTypes: {},
        failedTransformations: 0,
        errors: []
      },
      features: []
    };
  }

  private readonly SYSTEM_PROPERTIES = new Set(['handle', 'ownerHandle', 'layers', '$EXTMIN', '$EXTMAX', '$LIMMIN', '$LIMMAX']);

  /**
   * Get available layers from current state, excluding system properties
   */
  protected getLayers(): string[] {
    const layerSet = new Set<string>();
    this.state.features.forEach(entity => {
      const layer = entity.attributes?.layer || '0';
      if (!this.isSystemProperty(layer)) {
        layerSet.add(layer);
      }
    });
    return Array.from(layerSet);
  }

  /**
   * Check if a layer name represents a system property
   */
  private isSystemProperty(layerName: string | undefined): boolean {
    if (!layerName) return false;
    return this.SYSTEM_PROPERTIES.has(layerName);
  }

  /**
   * Check if file can be processed
   */
  async canProcess(file: File): Promise<boolean> {
    return file.name.toLowerCase().endsWith('.dxf');
  }

  /**
   * Process layer name safely
   */
  private getLayerName(entity: DxfEntity): string {
    return entity.attributes?.layer || '0';
  }

  /**
   * Analyze DXF file
   */
  async analyze(file: File): Promise<AnalyzeResult> {
    try {
      console.log('[DEBUG] Starting DXF analysis for:', file.name);
      
      // Read file content with progress monitoring
      const text = await file.text();
      console.log('[DEBUG] File content length:', text.length);

      // Configure parsing options
      const parseOptions: DxfParseOptions = {
        entityTypes: (this.options as DxfProcessorOptions).entityTypes,
        parseBlocks: (this.options as DxfProcessorOptions).importBlocks,
        parseText: (this.options as DxfProcessorOptions).importText,
        parseDimensions: (this.options as DxfProcessorOptions).importDimensions,
        validate: (this.options as DxfProcessorOptions).validateGeometry
      };

      // Parse DXF structure with options
      const structure = await this.parser.parse(text, parseOptions) as DxfStructure;
      
      console.log('[DEBUG] Starting entity processing');
      
      // Extract entities from structure
      const entities = await DxfEntityProcessor.extractEntities(structure);
      console.log('[DEBUG] Extracted entities:', entities.length);

      // Calculate bounds from entities
      const bounds = DxfAnalyzer.calculateBoundsFromEntities(entities);
      console.log('[DEBUG] Calculated bounds:', bounds);

      // Detect coordinate system
      const detectedSystem = DxfAnalyzer.detectCoordinateSystem(bounds, structure);
      console.log('[DEBUG] Detected coordinate system:', detectedSystem);

      // If no coordinate system detected, default to LV95
      const coordinateSystem = detectedSystem || 'EPSG:2056';
      console.log('[DEBUG] Using coordinate system:', coordinateSystem);

      // Extract layers
      const layers = DxfLayerProcessor.extractLayerNames(structure.tables?.layer || {});
      console.log('[DEBUG] Extracted layers:', layers);

      // Create preview manager
      const previewManager = createPreviewManager();
      await previewManager.addFeatures(entities, coordinateSystem);
      console.log('[DEBUG] Added features to preview manager');

      return {
        fileType: 'dxf',
        coordinateSystem,
        layers,
        bounds,
        previewManager,
        statistics: {
          entityCount: entities.length,
          layerCount: layers.length
        }
      };

    } catch (error) {
      console.error('[DEBUG] Error analyzing DXF file:', error);
      throw error;
    }
  }

  /**
   * Process DXF file in streaming mode
   */
  protected async processChunk(features: Feature[], chunkIndex: number): Promise<Feature[]> {
    // Process features in chunks
    const processedFeatures = [...features]; // Create copy to avoid modifying original
    
    // Check memory usage
    const memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024;
    if (memoryUsage > 450) {
      console.warn('[DEBUG] High memory usage in chunk processing:', Math.round(memoryUsage), 'MB');
      if (global.gc) {
        global.gc();
      }
    }
    
    return processedFeatures;
  }

  /**
   * Convert entities to GeoJSON features with memory checks
   */
  async convertToFeatures(entities: DxfEntity[]): Promise<Feature[]> {
    const features = await DxfEntityProcessor.entitiesToFeatures(entities);
    
    // Check memory usage after conversion
    const memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024;
    if (memoryUsage > 450) {
      console.warn('[DEBUG] High memory usage in feature conversion:', Math.round(memoryUsage), 'MB');
      if (global.gc) {
        global.gc();
      }
    }
    
    return features;
  }

  /**
   * Calculate bounds for processor result with memory optimization
   */
  protected calculateBounds(): ProcessorResult['bounds'] {
    if (!this.state.features || this.state.features.length === 0) {
      return DxfAnalyzer.getDefaultBounds(this.options.coordinateSystem);
    }
    
    // Calculate bounds in chunks if many features
    if (this.state.features.length > 1000) {
      const chunkSize = 1000;
      let bounds: ProcessorResult['bounds'] | null = null;
      
      for (let i = 0; i < this.state.features.length; i += chunkSize) {
        const chunk = this.state.features.slice(i, i + chunkSize);
        const chunkBounds = DxfAnalyzer.calculateBoundsFromEntities(chunk);
        
        if (chunkBounds) {
          if (!bounds) {
            bounds = chunkBounds;
          } else {
            bounds = {
              minX: Math.min(bounds.minX, chunkBounds.minX),
              minY: Math.min(bounds.minY, chunkBounds.minY),
              maxX: Math.max(bounds.maxX, chunkBounds.maxX),
              maxY: Math.max(bounds.maxY, chunkBounds.maxY)
            };
          }
        }
      }
      
      return bounds || DxfAnalyzer.getDefaultBounds(this.options.coordinateSystem);
    }
    
    return DxfAnalyzer.calculateBoundsFromEntities(this.state.features);
  }

  protected async processStream(file: File): Promise<StreamProcessorResult> {
    try {
      const CHUNK_SIZE = 50000; // Process entities in chunks of 50k
      const parseOptions: DxfParseOptions = {
        entityTypes: (this.options as DxfProcessorOptions).entityTypes,
        parseBlocks: (this.options as DxfProcessorOptions).importBlocks,
        parseText: (this.options as DxfProcessorOptions).importText,
        parseDimensions: (this.options as DxfProcessorOptions).importDimensions,
        validate: (this.options as DxfProcessorOptions).validateGeometry
      };

      // Read file in chunks using streams if available
      const text = await file.text();
      const structure = await this.parser.parse(text, parseOptions) as DxfStructure;

      // Collect all entities including blocks
      const allEntities = [
        ...(structure.entities || []),
        ...structure.blocks.flatMap(block => block.entities || [])
      ];

      // Process entities in chunks
      const totalChunks = Math.ceil(allEntities.length / CHUNK_SIZE);
      let processedCount = 0;
      let validFeatureCount = 0;
      const layerSet = new Set<string>();

      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, allEntities.length);
        const chunk = allEntities.slice(start, end);

        // Store chunk in state for bounds calculation
        this.state.features = chunk;

        // Convert chunk to GeoJSON features
        const features = await DxfEntityProcessor.entitiesToFeatures(chunk);

        // Process features
        features.forEach(feature => {
          const layer = feature.properties?.layer || '0';
          if (!this.isSystemProperty(layer)) {
            validFeatureCount++;
            this.updateStats(this.state.statistics, feature.geometry.type.toLowerCase());
            layerSet.add(layer);
          }
        });

        processedCount += chunk.length;
        this.updateProgress(processedCount / allEntities.length);

        // Check memory usage
        const memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024;
        if (memoryUsage > 450) { // Warning threshold at 450MB
          console.warn('[DEBUG] High memory usage detected:', Math.round(memoryUsage), 'MB');
          // Force garbage collection if available
          if (global.gc) {
            global.gc();
          }
        }

        // Add small delay between chunks to prevent blocking
        await new Promise(resolve => setTimeout(resolve, 0));
      }

      // Update layer count in statistics
      this.state.statistics.layerCount = layerSet.size;

      console.log('[DEBUG] Processing complete:', {
        totalEntities: allEntities.length,
        validFeatures: validFeatureCount,
        layerCount: this.state.statistics.layerCount,
        chunksProcessed: totalChunks
      });

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
}
