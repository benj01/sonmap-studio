import { Feature, FeatureCollection } from 'geojson';
import { StreamProcessor } from '../../stream/stream-processor';
import { AnalyzeResult, ProcessorResult } from '../../base/types';
import { CoordinateSystem, COORDINATE_SYSTEMS } from '../../../../types/coordinates';
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
      console.debug('[DEBUG] Starting DXF analysis for:', file.name);
      
      // Read file content with progress monitoring
      const text = await file.text();
      console.debug('[DEBUG] File content length:', text.length);

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
      
      console.debug('[DEBUG] Starting entity processing');
      
      // Extract entities from structure
      const entities = await DxfEntityProcessor.extractEntities(structure);
      console.debug('[DEBUG] Extracted entities:', entities.length);

      // Calculate bounds from entities
      const bounds = DxfAnalyzer.calculateBoundsFromEntities(entities);
      console.debug('[DEBUG] Calculated bounds:', bounds);

      // Detect coordinate system with enhanced validation
      const detection = DxfAnalyzer.detectCoordinateSystem(bounds, structure);
      console.debug('[DEBUG] Coordinate system detection:', {
        system: detection.system,
        confidence: detection.confidence,
        reason: detection.reason
      });

      // Determine coordinate system with fallback logic
      const coordinateSystem = detection.system ?? COORDINATE_SYSTEMS.SWISS_LV95;
      
      // Log coordinate system decision
      console.debug('[DEBUG] Using coordinate system:', {
        system: coordinateSystem,
        fallback: detection.system === null,
        confidence: detection.confidence,
        reason: detection.reason
      });

      // Add warning if confidence is low
      if (detection.confidence === 'low') {
        console.warn('[DEBUG] Low confidence in coordinate system detection:', detection.reason);
      }

      // Extract layers from structure
      const layers = DxfLayerProcessor.extractLayerNames(structure.layers || []);
      console.debug('[DEBUG] Extracted layers:', layers);

      // Convert DXF entities to GeoJSON features
      const features = await DxfEntityProcessor.entitiesToFeatures(entities);
      console.debug('[DEBUG] Converted entities to features:', features.length);

      // Create feature collection for preview
      const preview: FeatureCollection = {
        type: 'FeatureCollection',
        features: features
      };

      return {
        layers,
        coordinateSystem,
        bounds,
        preview,
        dxfData: {
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
    console.debug('[DEBUG] Processing chunk:', { chunkIndex, featureCount: features.length });
    return features;
  }

  /**
   * Convert entities to GeoJSON features
   */
  private async convertToFeatures(entities: DxfEntity[]): Promise<Feature[]> {
    console.debug('[DEBUG] Converting entities to features:', { count: entities.length });
    const features = await DxfEntityProcessor.entitiesToFeatures(entities);

    // Update feature type statistics
    features.forEach(feature => {
      const type = feature.geometry.type.toLowerCase();
      this.state.statistics.featureTypes[type] = (this.state.statistics.featureTypes[type] || 0) + 1;
    });

    return features;
  }

  /**
   * Process DXF file
   */
  async process(file: File): Promise<ProcessorResult> {
    try {
      console.debug('[DEBUG] Starting DXF processing');
      
      // Parse file content
      const text = await file.text();
      console.debug('[DEBUG] File content loaded');

      // Parse options
      const parseOptions: DxfParseOptions = {
        parseBlocks: (this.options as DxfProcessorOptions).importBlocks,
        parseText: (this.options as DxfProcessorOptions).importText,
        parseDimensions: (this.options as DxfProcessorOptions).importDimensions,
        validate: (this.options as DxfProcessorOptions).validateGeometry
      };

      // Parse DXF structure
      const structure = await this.parser.parse(text, parseOptions) as DxfStructure;
      console.debug('[DEBUG] DXF structure parsed');

      // Extract and process entities
      const entities = await DxfEntityProcessor.extractEntities(structure);
      console.debug('[DEBUG] Entities extracted:', { count: entities.length });

      // Convert to features
      const features = await this.convertToFeatures(entities);
      console.debug('[DEBUG] Features converted:', { count: features.length });

      // Create feature collection
      const featureCollection: FeatureCollection = {
        type: 'FeatureCollection',
        features
      };

      // Extract layers
      const layers = DxfLayerProcessor.extractLayerNames(structure.layers || []);
      console.debug('[DEBUG] Layers extracted:', { count: layers.length });

      // Calculate bounds
      const bounds = DxfAnalyzer.calculateBoundsFromEntities(entities);
      console.debug('[DEBUG] Bounds calculated:', bounds);

      // Update statistics
      this.state.statistics.featureCount = features.length;
      this.state.statistics.layerCount = layers.length;

      return {
        features: featureCollection,
        bounds,
        layers,
        coordinateSystem: this.options.coordinateSystem,
        statistics: this.state.statistics
      };
    } catch (error) {
      console.error('[ERROR] DXF processing failed:', error);
      throw error;
    }
  }
}
