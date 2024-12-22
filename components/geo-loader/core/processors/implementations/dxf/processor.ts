import { Feature, FeatureCollection } from 'geojson';
import { StreamProcessor } from '../../stream/stream-processor';
import { AnalyzeResult, ProcessorResult } from '../../base/types';
import { StreamProcessorResult } from '../../stream/types';
import { DxfParser } from './parser';
import { coordinateSystemManager } from '../../../coordinate-system-manager';
import { createPreviewManager } from '../../../../preview/preview-manager';
import { DxfProcessorOptions, DxfParseOptions, DxfEntity, DxfBlock, DxfLayer } from './types';
import { ValidationError } from '../../../errors/types';
import { StreamReader } from './utils/stream-reader';
import { BlockManager } from './utils/block-manager';
import { LayerManager } from './utils/layer-manager';
import { EntityParser } from './utils/entity-parser';
import { DxfParserWrapper } from './parsers/dxf-parser-wrapper';

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
   * Calculate bounds from raw DXF entities
   */
  private calculateBoundsFromEntities(entities: DxfEntity[]): ProcessorResult['bounds'] {
    const bounds = {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity
    };

    const updateBoundsWithCoord = (x: number, y: number) => {
      bounds.minX = Math.min(bounds.minX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.maxY = Math.max(bounds.maxY, y);
    };

    entities.forEach(entity => {
      if (entity.type === 'LWPOLYLINE' && entity.data?.vertices) {
        entity.data.vertices.forEach(vertex => {
          if ('x' in vertex && 'y' in vertex) {
            updateBoundsWithCoord(vertex.x, vertex.y);
          }
        });
      } else if (entity.data) {
        // Handle other entity types with x,y coordinates
        if ('x' in entity.data && 'y' in entity.data) {
          updateBoundsWithCoord(entity.data.x, entity.data.y);
        }
        // Handle entities with end points (like LINE)
        if ('x2' in entity.data && 'y2' in entity.data) {
          updateBoundsWithCoord(entity.data.x2, entity.data.y2);
        }
      }
    });

    // Check if we found any valid coordinates
    if (bounds.minX === Infinity) {
      console.warn('[DEBUG] No valid coordinates found in raw entities');
      return this.getDefaultBounds(this.options.coordinateSystem);
    }

    console.log('[DEBUG] Calculated raw bounds:', bounds);
    return bounds;
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
      // Ensure entities is an array and log its contents
      const entityArray = Array.isArray(entities) ? entities : [];
      console.log('[DEBUG] Entity array:', {
        length: entityArray.length,
        sample: entityArray[0],
        allEntities: entityArray
      });

      // More lenient entity validation
      const validEntities = entityArray.filter((entity): entity is DxfEntity => {
        // Basic structure check
        if (!entity || typeof entity !== 'object') {
          console.warn('[DEBUG] Invalid entity (not an object):', entity);
          return false;
        }

        // Type check
        if (!('type' in entity)) {
          console.warn('[DEBUG] Entity missing type:', entity);
          return false;
        }

        // Initialize missing properties with defaults
        if (!('attributes' in entity) || !entity.attributes) {
          console.log('[DEBUG] Adding default attributes to entity');
          entity.attributes = { layer: '0' };
        }

        if (!('data' in entity) || !entity.data) {
          console.log('[DEBUG] Adding empty data object to entity');
          entity.data = {};
        }

        // Special handling for LWPOLYLINE
        if (entity.type === 'LWPOLYLINE' && (!entity.data.vertices || !Array.isArray(entity.data.vertices))) {
          console.warn('[DEBUG] LWPOLYLINE missing vertices array:', entity);
          return false;
        }

        // Log entity details
        console.log('[DEBUG] Valid entity:', {
          type: entity.type,
          hasAttributes: 'attributes' in entity,
          hasData: 'data' in entity,
          dataKeys: entity.data ? Object.keys(entity.data) : [],
          vertexCount: entity.type === 'LWPOLYLINE' ? entity.data.vertices?.length : undefined
        });
        
        return true;
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
      
      // Read file content
      const text = await file.text();
      console.log('[DEBUG] File content length:', text.length);

      let parseResult;
      let features: Feature[] = [];
      let layerNames: string[] = [];

      // Try dxf-parser library first
      try {
        console.log('[DEBUG] Attempting to use dxf-parser library...');
        const wrapper = DxfParserWrapper.getInstance();
        const structure = await wrapper.parse(text);
        
        // If successful, use the dxf-parser result
        console.log('[DEBUG] Successfully parsed with dxf-parser');
        features = await wrapper.convertToFeatures(
          structure.entityTypes.flatMap((type: string) => 
            structure.blocks.flatMap((block: DxfBlock) => 
              block.entities.filter((e: DxfEntity) => e.type === type)
            )
          )
        );

        parseResult = {
          structure,
          preview: features,
          issues: []
        };
        layerNames = structure.layers.map((l: DxfLayer) => l.name);
      } catch (error: unknown) {
        console.warn('[DEBUG] dxf-parser failed, falling back to custom parser:', error);
        this.errorReporter.addWarning(
          'DXF Parser library failed, using fallback parser',
          'DXF_PARSER_FALLBACK',
          { error: error instanceof Error ? error.message : String(error) }
        );

        // Parse layers first
        const parsedLayers = await this.layerManager.parseLayers(text);
        layerNames = parsedLayers.map(layer => layer.name);
        console.log('[DEBUG] Parsed layers:', {
          count: layerNames.length,
          names: layerNames
        });

        // Parse DXF structure and features with custom parser
        parseResult = await this.parser.analyzeStructure(file, {
          previewEntities: (this.options as DxfProcessorOptions).previewEntities || 1000,
          parseBlocks: (this.options as DxfProcessorOptions).importBlocks,
          parseText: (this.options as DxfProcessorOptions).importText,
          parseDimensions: (this.options as DxfProcessorOptions).importDimensions
        });

        // Convert preview entities to features
        console.log('[DEBUG] Converting preview entities...');
        if (!Array.isArray(parseResult.preview)) {
          console.error('[DEBUG] Preview entities is not an array:', parseResult.preview);
          parseResult.preview = [];
        }
        
        features = await this.convertToFeatures(parseResult.preview);
      }

      // Update layer manager with parsed layers
      parseResult.structure.layers.forEach(layer => {
        this.layerManager.addLayer(layer);
      });
      
      console.log('[DEBUG] Analysis structure:', {
        layers: parseResult.structure.layers.length,
        blocks: parseResult.structure.blocks.length,
        entityTypes: parseResult.structure.entityTypes,
        previewEntities: parseResult.preview.length,
        parsedLayers: layerNames.length
      });

      // Report any issues found during analysis
      parseResult.issues?.forEach(issue => {
        this.errorReporter.addWarning(
          issue.message,
          issue.type,
          issue.details
        );
      });

      if (features.length === 0) {
        console.warn('[DEBUG] No preview features generated from entities');
        this.errorReporter.addWarning(
          'No preview features could be generated',
          'PREVIEW_GENERATION',
          { entityCount: parseResult.preview.length }
        );
      }

      // Update layers
      this.layers = layerNames;
      console.log('[DEBUG] Detected layers:', this.layers);

      // Calculate initial bounds from raw coordinates
      const rawBounds = this.calculateBoundsFromEntities(parseResult.preview);
      console.log('[DEBUG] Raw coordinate bounds:', rawBounds);

      // Ensure coordinate system manager is initialized
      if (!coordinateSystemManager.isInitialized()) {
        await coordinateSystemManager.initialize();
      }

      // Detect coordinate system based on raw bounds
      let detectedSystem = this.options.coordinateSystem;
      if (!detectedSystem && rawBounds) {
        // Check for Swiss LV95 coordinates (typical range around 2.6M, 1.2M)
        if (rawBounds.minX > 2000000 && rawBounds.minX < 3000000 &&
            rawBounds.minY > 1000000 && rawBounds.minY < 1400000) {
          const lv95Def = coordinateSystemManager.getSystemDefinition('EPSG:2056');
          if (lv95Def && coordinateSystemManager.validateBounds({ x: rawBounds.minX, y: rawBounds.minY }, 'EPSG:2056')) {
            detectedSystem = 'EPSG:2056'; // Swiss LV95
            console.log('[DEBUG] Detected Swiss LV95 coordinates');
            // Update processor options with detected system
            this.options.coordinateSystem = detectedSystem;
          }
        }
        // Check for Swiss LV03 coordinates (typical range around 600k, 200k)
        else if (rawBounds.minX > 400000 && rawBounds.minX < 900000 &&
                rawBounds.minY > 0 && rawBounds.minY < 400000) {
          detectedSystem = 'EPSG:21781'; // Swiss LV03
          console.log('[DEBUG] Detected Swiss LV03 coordinates');
        }
        // Check for WGS84 coordinates
        else if (Math.abs(rawBounds.minX) <= 180 && Math.abs(rawBounds.maxX) <= 180 &&
                Math.abs(rawBounds.minY) <= 90 && Math.abs(rawBounds.maxY) <= 90) {
          detectedSystem = 'EPSG:4326'; // WGS84
          console.log('[DEBUG] Detected WGS84 coordinates');
        } else {
          console.warn('[DEBUG] Could not detect coordinate system from bounds:', rawBounds);
        }
      }

      // Create preview manager to properly categorize features
      const previewManager = createPreviewManager({
        maxFeatures: (this.options as DxfProcessorOptions).previewEntities || 1000,
        visibleLayers: this.layers,
        coordinateSystem: detectedSystem,
        enableCaching: true
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
      const finalBounds = this.calculateBoundsFromFeatures(features);

      const analyzeResult: AnalyzeResult = {
        layers: this.layers,
        coordinateSystem: detectedSystem,
        bounds: finalBounds,
        preview: previewFeatures,
        dxfData: parseResult.structure
      };

      // Log analysis results
      console.log('[DEBUG] Analysis complete:', {
        layers: this.layers.length,
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

      // Process entire file at once since streaming isn't working well with DXF
      const fileContent = await file.text();
      try {
        // Parse features
        const features = await this.parser.parseFeatures(file, parseOptions);

        if (features.length > 0) {
          // Process features
          const processedFeatures = await this.processChunk(features, 0);
          
          // Update bounds
          this.updateBounds(processedFeatures);
          
          // Emit chunk
          this.handleChunk(processedFeatures, 0);
        }

        // Update progress
        this.updateProgress(1);
      } catch (error) {
        console.warn('Failed to process file:', error);
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

    // Check if we found any valid coordinates
    if (bounds.minX === Infinity) {
      console.warn('[DEBUG] No valid coordinates found for bounds calculation');
      // Use more appropriate default bounds based on coordinate system
      const defaultBounds = this.getDefaultBounds(this.options.coordinateSystem);
      console.log('[DEBUG] Using default bounds:', defaultBounds);
      return defaultBounds;
    }

    console.log('[DEBUG] Calculated bounds:', bounds);
    return bounds;
  }

  /**
   * Get default bounds based on coordinate system
   */
  private getDefaultBounds(coordinateSystem?: string): ProcessorResult['bounds'] {
    // Default bounds based on common coordinate systems
    switch (coordinateSystem) {
      case 'EPSG:2056': // Swiss LV95
        return {
          minX: 2485000,
          minY: 1075000,
          maxX: 2835000,
          maxY: 1295000
        };
      case 'EPSG:21781': // Swiss LV03
        return {
          minX: 485000,
          minY: 75000,
          maxX: 835000,
          maxY: 295000
        };
      case 'EPSG:4326': // WGS84
        return {
          minX: 5.9,
          minY: 45.8,
          maxX: 10.5,
          maxY: 47.8
        };
      default:
        // Generic bounds that work for most cases
        return {
          minX: -1,
          minY: -1,
          maxX: 1,
          maxY: 1
        };
    }
  }
}
