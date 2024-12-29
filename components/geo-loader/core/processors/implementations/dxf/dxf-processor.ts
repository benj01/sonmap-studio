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
      
      // Process entities directly from structure to avoid copies
      const validLayerNames = new Set<string>();
      let entityBounds: ProcessorResult['bounds'] | null = null;

      // Process main entities
      if (structure.entities) {
        for (const entity of structure.entities) {
          // Process layer
          const layer = this.getLayerName(entity);
          if (!this.isSystemProperty(layer)) {
            validLayerNames.add(layer);
          }

          // Update bounds
          const entityBound = DxfAnalyzer.calculateBoundsFromEntities([entity]);
          if (entityBound) {
            if (!entityBounds) {
              entityBounds = entityBound;
            } else {
              entityBounds = {
                minX: Math.min(entityBounds.minX, entityBound.minX),
                minY: Math.min(entityBounds.minY, entityBound.minY),
                maxX: Math.max(entityBounds.maxX, entityBound.maxX),
                maxY: Math.max(entityBounds.maxY, entityBound.maxY)
              };
            }
          }
        }
      }

      // Process block entities
      if (structure.blocks) {
        for (const block of structure.blocks) {
          if (block.entities) {
            for (const entity of block.entities) {
              const layer = this.getLayerName(entity);
              if (!this.isSystemProperty(layer)) {
                validLayerNames.add(layer);
              }

              const entityBound = DxfAnalyzer.calculateBoundsFromEntities([entity]);
              if (entityBound) {
                if (!entityBounds) {
                  entityBounds = entityBound;
                } else {
                  entityBounds = {
                    minX: Math.min(entityBounds.minX, entityBound.minX),
                    minY: Math.min(entityBounds.minY, entityBound.minY),
                    maxX: Math.max(entityBounds.maxX, entityBound.maxX),
                    maxY: Math.max(entityBounds.maxY, entityBound.maxY)
                  };
                }
              }
            }
          }
        }
      }

      // Add layers from structure, excluding system properties
      structure.layers.forEach((layer: DxfLayer) => {
        if (!this.isSystemProperty(layer.name)) {
          validLayerNames.add(layer.name);
        }
      });

      console.log('[DEBUG] Valid layers identified:', Array.from(validLayerNames));
      
      const layerNames = Array.from(validLayerNames);
      console.log('[DEBUG] Found layers:', {
        fromStructure: structure.layers
          .filter((l: DxfLayer) => !this.isSystemProperty(l.name))
          .map((l: DxfLayer) => ({
            name: l.name,
            color: l.color,
            lineType: l.lineType,
            state: { frozen: l.frozen, locked: l.locked, off: l.off }
          })),
        fromEntities: Array.from(new Set(this.state.features
          .map(e => this.getLayerName(e))
          .filter(layer => !this.isSystemProperty(layer)))),
        combined: layerNames
      });

      // Use header bounds if available, otherwise use calculated entity bounds
      const headerBounds = structure.extents ? {
        minX: structure.extents.min[0],
        minY: structure.extents.min[1],
        maxX: structure.extents.max[0],
        maxY: structure.extents.max[1]
      } : null;
      const rawBounds = headerBounds || entityBounds;

      // Detect coordinate system
      let detectedSystem = this.options.coordinateSystem;
      if (!detectedSystem && rawBounds) {
        const system = DxfAnalyzer.detectCoordinateSystem(rawBounds, structure);
        detectedSystem = system as CoordinateSystem;
        if (detectedSystem) {
          this.options.coordinateSystem = detectedSystem;
        }
      }

      // Initialize and verify coordinate system
      await DxfCoordinateHandler.initializeCoordinateSystem(detectedSystem || 'EPSG:4326');

      // Convert a sample of entities for preview
      const features: Feature[] = [];
      const maxPreviewEntities = 1000;
      
      // Sample and process main entities
      if (structure.entities) {
        const sampleStep = Math.max(1, Math.floor(structure.entities.length / maxPreviewEntities));
        const sampledEntities = structure.entities.filter((_, index) => index % sampleStep === 0);
        
        // Process entities with coordinate transformation
        const mainFeatures = await DxfCoordinateHandler.processEntities(
          sampledEntities,
          detectedSystem || 'EPSG:4326'
        );
        features.push(...mainFeatures);
      }
      
      // Sample and process block entities if space remains
      if (structure.blocks && features.length < maxPreviewEntities) {
        const remainingSlots = maxPreviewEntities - features.length;
        for (const block of structure.blocks) {
          if (block.entities) {
            const sampleStep = Math.max(1, Math.floor(block.entities.length / remainingSlots));
            const sampledEntities = block.entities.filter((_, index) => index % sampleStep === 0);
            
            // Process block entities with coordinate transformation
            const blockFeatures = await DxfCoordinateHandler.processEntities(
              sampledEntities,
              detectedSystem || 'EPSG:4326'
            );
            features.push(...blockFeatures.slice(0, remainingSlots));
            if (features.length >= maxPreviewEntities) break;
          }
        }
      }

      // Transform bounds to WGS84 for preview
      const previewBounds = await DxfCoordinateHandler.transformBounds(
        entityBounds || DxfAnalyzer.getDefaultBounds(detectedSystem),
        detectedSystem || 'EPSG:4326'
      );

      console.debug('[DEBUG] Creating preview manager:', {
        layerCount: layerNames.length,
        layers: layerNames,
        sourceBounds: entityBounds,
        transformedBounds: previewBounds,
        coordinateSystem: 'EPSG:4326', // Always WGS84 for preview
        featureCount: features.length
      });

      // Create preview manager with transformed coordinates
      const previewManager = createPreviewManager({
        maxFeatures: (this.options as DxfProcessorOptions).previewEntities || 1000,
        visibleLayers: [], // Empty array means all layers visible
        coordinateSystem: 'EPSG:4326', // Always WGS84 for preview
        enableCaching: true,
        bounds: previewBounds,
        analysis: {
          warnings: this.errorReporter.getWarnings().map(w => ({
            type: 'warning',
            message: w.message
          }))
        }
      });

      // Set features in preview manager
      previewManager.setFeatures(features);

      // Get categorized collections
      const collections = await previewManager.getPreviewCollections();
      console.log('[DEBUG] Preview collections:', {
        points: collections.points.features.length,
        lines: collections.lines.features.length,
        polygons: collections.polygons.features.length,
        total: collections.totalCount
      });

      // Create preview feature collection
      const previewFeatures: FeatureCollection = {
        type: 'FeatureCollection',
        features: [
          ...collections.points.features,
          ...collections.lines.features,
          ...collections.polygons.features
        ]
      };

      // Return AnalyzeResult with transformed preview features
      return {
        layers: layerNames,
        coordinateSystem: detectedSystem || 'EPSG:4326',
        bounds: entityBounds || undefined,
        preview: previewFeatures,
        dxfData: structure
      };
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
