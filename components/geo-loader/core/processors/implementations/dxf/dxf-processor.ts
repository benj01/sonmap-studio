import { Feature, FeatureCollection } from 'geojson';
import { StreamProcessor } from '../../stream/stream-processor';
import { AnalyzeResult, ProcessorResult } from '../../base/types';
import { StreamProcessorResult } from '../../stream/types';
import { DxfProcessorOptions, DxfParseOptions } from './types';
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

  constructor(options: DxfProcessorOptions = {}) {
    super(options);
    this.parser = DxfParserWrapper.getInstance();
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
      const structure = await this.parser.parse(text, parseOptions);
      
      // Get all entities from structure (already converted by parser)
      const convertedEntities = [
        ...(structure.entities || []),
        ...structure.blocks.flatMap(block => block.entities || [])
      ];
      
      console.log('[DEBUG] Using converted entities:', {
        total: convertedEntities.length,
        types: Array.from(new Set(convertedEntities.map(e => e.type)))
      });

      // Extract and process layers
      const layerNames = DxfLayerProcessor.extractLayerNames(structure.tables?.layer || {});
      console.log('[DEBUG] Found layers:', layerNames);

      // Calculate bounds from raw coordinates
      const entityBounds = DxfAnalyzer.calculateBoundsFromEntities(convertedEntities);
      const headerBounds = structure.header?.$EXTMIN && structure.header?.$EXTMAX ? {
        minX: structure.header.$EXTMIN.x,
        minY: structure.header.$EXTMIN.y,
        maxX: structure.header.$EXTMAX.x,
        maxY: structure.header.$EXTMAX.y
      } : null;
      const rawBounds = headerBounds || entityBounds;

      // Detect coordinate system
      let detectedSystem = this.options.coordinateSystem;
      if (!detectedSystem && rawBounds) {
        detectedSystem = DxfAnalyzer.detectCoordinateSystem(rawBounds, structure.header);
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
      if (detectedSystem && detectedSystem !== 'EPSG:4326') {
        console.log('[DEBUG] Transforming coordinates from', detectedSystem, 'to WGS84');
        const transformedEntities = await DxfTransformer.transformEntities(
          convertedEntities,
          detectedSystem,
          'EPSG:4326'
        );
        features = DxfEntityProcessor.entitiesToFeatures(transformedEntities);
      } else {
        features = DxfEntityProcessor.entitiesToFeatures(convertedEntities);
      }

      // Create preview manager
      const previewManager = createPreviewManager({
        maxFeatures: (this.options as DxfProcessorOptions).previewEntities || 1000,
        visibleLayers: layerNames,
        coordinateSystem: detectedSystem,
        enableCaching: true,
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

      // Calculate final bounds from features
      const finalBounds = DxfAnalyzer.calculateBoundsFromEntities(convertedEntities);

      const analyzeResult: AnalyzeResult = {
        layers: layerNames,
        coordinateSystem: detectedSystem,
        bounds: finalBounds,
        preview: previewFeatures,
        dxfData: structure
      };

      // Log analysis results
      console.log('[DEBUG] Analysis complete:', {
        layers: layerNames.length,
        features: features.length,
        featureTypes: Array.from(new Set(features.map(f => f.geometry.type))),
        coordinateSystem: detectedSystem,
        hasBounds: !!finalBounds
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
      const structure = await this.parser.parse(text, parseOptions);
      const entities = structure.entities || [];
      const features = DxfEntityProcessor.entitiesToFeatures(entities);

      // Update statistics
      features.forEach(feature => {
        this.updateStats(this.state.statistics, feature.geometry.type.toLowerCase());
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
