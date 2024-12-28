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
import { coordinateSystemManager } from '../../../coordinate-system-manager';
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

  /**
   * Get available layers from current state, excluding system properties
   */
  protected getLayers(): string[] {
    const layerSet = new Set<string>();
    this.state.features.forEach(entity => {
      const layer = entity.attributes.layer || '0';
      // Filter out system properties that might appear as layers
      if (layer !== 'handle' && layer !== 'ownerHandle' && layer !== 'layers') {
        layerSet.add(layer);
      }
    });
    return Array.from(layerSet);
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
      console.log('[DEBUG] Starting DXF analysis for:', file.name);
      
      // Read file content
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
      
      // Get and store all entities from structure
      this.state.features = [
        ...(structure.entities || []),
        ...structure.blocks.flatMap(block => block.entities || [])
      ];
      
      console.log('[DEBUG] Using converted entities:', {
        total: this.state.features.length,
        types: Array.from(new Set(this.state.features.map(e => e.type)))
      });

      // Extract and process layers (excluding system properties)
      const validLayerNames = new Set<string>();
      
      // Add layers from structure
      structure.layers.forEach((layer: DxfLayer) => {
        if (layer.name !== 'handle' && layer.name !== 'ownerHandle' && layer.name !== 'layers') {
          validLayerNames.add(layer.name);
        }
      });
      
      // Add layers from entities
      this.state.features.forEach((entity: DxfEntity) => {
        const layer = entity.attributes.layer || '0';
        if (layer !== 'handle' && layer !== 'ownerHandle' && layer !== 'layers') {
          validLayerNames.add(layer);
        }
      });
      
      const layerNames = Array.from(validLayerNames);
      console.log('[DEBUG] Found layers:', {
        fromStructure: structure.layers
          .filter((l: DxfLayer) => l.name !== 'handle' && l.name !== 'ownerHandle' && l.name !== 'layers')
          .map((l: DxfLayer) => ({
            name: l.name,
            color: l.color,
            lineType: l.lineType,
            state: { frozen: l.frozen, locked: l.locked, off: l.off }
          })),
        fromEntities: Array.from(new Set(this.state.features
          .map((e: DxfEntity) => e.attributes.layer)
          .filter(layer => layer !== 'handle' && layer !== 'ownerHandle' && layer !== 'layers'))),
        combined: layerNames
      });

      // Calculate bounds from raw coordinates
      const entityBounds = DxfAnalyzer.calculateBoundsFromEntities(this.state.features);
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

      // Initialize coordinate system manager if needed
      if (!coordinateSystemManager.isInitialized()) {
        await coordinateSystemManager.initialize();
      }

      // Transform coordinates if needed
      let features: Feature[] = [];
      let transformedBounds = entityBounds;
      
      if (detectedSystem && detectedSystem !== 'EPSG:4326') {
        console.log('[DEBUG] Transforming coordinates from', detectedSystem, 'to WGS84');
        
        // Transform bounds first
        if (entityBounds) {
          transformedBounds = await DxfTransformer.transformBounds(
            entityBounds,
            detectedSystem,
            'EPSG:4326'
          );
          console.log('[DEBUG] Transformed bounds:', {
            original: entityBounds,
            transformed: transformedBounds
          });
        }

        // Then transform entities
        const transformedEntities = await DxfTransformer.transformEntities(
          this.state.features,
          detectedSystem,
          'EPSG:4326'
        );
        
        // Update state with transformed entities
        this.state.features = transformedEntities;
        features = DxfEntityProcessor.entitiesToFeatures(transformedEntities);
      } else {
        features = DxfEntityProcessor.entitiesToFeatures(this.state.features);
      }

      // Create preview manager with transformed bounds
      const previewManager = createPreviewManager({
        maxFeatures: (this.options as DxfProcessorOptions).previewEntities || 1000,
        visibleLayers: layerNames,
        coordinateSystem: 'EPSG:4326', // Always use WGS84 for preview
        enableCaching: true,
        bounds: transformedBounds,
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

      const analyzeResult: AnalyzeResult = {
        layers: layerNames,
        coordinateSystem: 'EPSG:4326', // Always return WGS84
        bounds: transformedBounds,
        preview: previewFeatures,
        dxfData: structure
      };

      // Log analysis results
      console.log('[DEBUG] Analysis complete:', {
        layers: layerNames.length,
        features: features.length,
        featureTypes: Array.from(new Set(features.map(f => f.geometry.type))),
        coordinateSystem: 'EPSG:4326',
        hasBounds: !!transformedBounds
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
  protected async processChunk(features: Feature[], chunkIndex: number): Promise<Feature[]> {
    // Process features in chunks
    return features;
  }

  /**
   * Convert entities to GeoJSON features
   */
  async convertToFeatures(entities: any[]): Promise<Feature[]> {
    return DxfEntityProcessor.entitiesToFeatures(entities);
  }

  /**
   * Calculate bounds for processor result
   */
  protected calculateBounds(): ProcessorResult['bounds'] {
    if (this.state.features.length === 0) {
      return DxfAnalyzer.getDefaultBounds(this.options.coordinateSystem);
    }
    return DxfAnalyzer.calculateBoundsFromEntities(this.state.features);
  }

  protected async processStream(file: File): Promise<StreamProcessorResult> {
    try {
      // Configure parsing options
      const parseOptions: DxfParseOptions = {
        entityTypes: (this.options as DxfProcessorOptions).entityTypes,
        parseBlocks: (this.options as DxfProcessorOptions).importBlocks,
        parseText: (this.options as DxfProcessorOptions).importText,
        parseDimensions: (this.options as DxfProcessorOptions).importDimensions,
        validate: (this.options as DxfProcessorOptions).validateGeometry
      };

      // Process entire file at once since streaming isn't working well with DXF
      const text = await file.text();
      const structure = await this.parser.parse(text, parseOptions) as DxfStructure;
      // Store all entities including blocks in state for bounds calculation
      this.state.features = [
        ...(structure.entities || []),
        ...structure.blocks.flatMap(block => block.entities || [])
      ];
      
      // Convert to GeoJSON features
      const features = DxfEntityProcessor.entitiesToFeatures(this.state.features);

      // Update statistics and state
      let validFeatureCount = 0;
      features.forEach(feature => {
        // Only count features from valid layers
        const layer = feature.properties?.layer || '0';
        if (layer !== 'handle' && layer !== 'ownerHandle' && layer !== 'layers') {
          validFeatureCount++;
          this.updateStats(this.state.statistics, feature.geometry.type.toLowerCase());
        }
      });

      // Update layer count in statistics
      this.state.statistics.layerCount = Array.from(new Set(
        this.state.features
          .map(e => e.attributes.layer || '0')
          .filter(layer => layer !== 'handle' && layer !== 'ownerHandle' && layer !== 'layers')
      )).length;

      console.log('[DEBUG] Processing complete:', {
        totalFeatures: features.length,
        validFeatures: validFeatureCount,
        layerCount: this.state.statistics.layerCount
      });

      // Update progress
      this.updateProgress(1);

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
