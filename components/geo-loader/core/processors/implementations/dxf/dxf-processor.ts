import { Feature, FeatureCollection, Geometry, GeoJsonProperties, Point, LineString, Polygon } from 'geojson';
import { StreamProcessor } from '../../stream/stream-processor';
import { AnalyzeResult, ProcessorResult, DatabaseImportResult } from '../../base/types';
import { PostGISClient } from '../../../database/client';
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
import { CompressedFile } from '../../../compression/compression-handler';

type RequiredBounds = Required<NonNullable<ProcessorResult['bounds']>>;

const DEFAULT_BOUNDS: RequiredBounds = {
  minX: 0,
  minY: 0,
  maxX: 0,
  maxY: 0
};

/**
 * Processor for DXF files
 */
export class DxfProcessor extends StreamProcessor {
  private parser: DxfParserWrapper;
  protected state: StreamProcessorState & { features: DxfEntity[] };
  private dbClient: PostGISClient | null = null;
  private databaseResult: DatabaseImportResult | null = null;

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
   * Calculate bounds from processed features
   */
  protected calculateBounds(): RequiredBounds {
    if (this.state.features.length === 0) return DEFAULT_BOUNDS;
    return DxfAnalyzer.calculateBoundsFromEntities(this.state.features) || DEFAULT_BOUNDS;
  }

  /**
   * Get bounds for a specific feature
   */
  protected getFeatureBounds(feature: Feature): RequiredBounds {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    const updateBounds = (x: number, y: number) => {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    };

    try {
      if (feature.geometry.type === 'Point') {
        const point = feature.geometry as Point;
        updateBounds(point.coordinates[0], point.coordinates[1]);
      } else if (feature.geometry.type === 'LineString') {
        const line = feature.geometry as LineString;
        line.coordinates.forEach(([x, y]) => updateBounds(x, y));
      } else if (feature.geometry.type === 'Polygon') {
        const polygon = feature.geometry as Polygon;
        polygon.coordinates[0].forEach(([x, y]) => updateBounds(x, y));
      }
    } catch (error) {
      console.warn('Error calculating feature bounds:', error);
      return DEFAULT_BOUNDS;
    }

    return minX === Infinity ? DEFAULT_BOUNDS : {
      minX,
      minY,
      maxX,
      maxY
    };
  }

  /**
   * Process a group of related files
   */
  protected async processFileGroup(files: CompressedFile[]): Promise<Feature<Geometry, GeoJsonProperties>[]> {
    // DXF files don't have related files to process
    // Just process the first file if any
    if (files.length === 0) return [];

    const file = files[0].data as File;
    const text = await file.text();
    const parseOptions: DxfParseOptions = {
      parseBlocks: (this.options as DxfProcessorOptions).importBlocks,
      parseText: (this.options as DxfProcessorOptions).importText,
      parseDimensions: (this.options as DxfProcessorOptions).importDimensions,
      validate: (this.options as DxfProcessorOptions).validateGeometry
    };

    const structure = await this.parser.parse(text, parseOptions) as DxfStructure;
    const entities = await DxfEntityProcessor.extractEntities(structure);
    return this.convertToFeatures(entities);
  }

  /**
   * Process stream of features
   */
  protected async processStream(file: File): Promise<StreamProcessorResult> {
    try {
      this.state.isProcessing = true;
      const text = await file.text();
      
      const parseOptions: DxfParseOptions = {
        parseBlocks: (this.options as DxfProcessorOptions).importBlocks,
        parseText: (this.options as DxfProcessorOptions).importText,
        parseDimensions: (this.options as DxfProcessorOptions).importDimensions,
        validate: (this.options as DxfProcessorOptions).validateGeometry
      };

      const structure = await this.parser.parse(text, parseOptions) as DxfStructure;
      const entities = await DxfEntityProcessor.extractEntities(structure);
      this.state.features = entities;

      // Process in chunks if needed
      const chunkSize = this.options.chunkSize || 1000;
      const chunks = [];
      for (let i = 0; i < entities.length; i += chunkSize) {
        const chunk = entities.slice(i, i + chunkSize);
        const features = await this.processChunk(await this.convertToFeatures(chunk), chunks.length);
        chunks.push(features);
        this.updateProgress(i / entities.length);
      }

      // Import to database if client is available
      if (this.dbClient) {
        this.databaseResult = await this.importToDatabase(entities, this.dbClient);
      }

      this.state.isProcessing = false;
      this.updateProgress(1);

      return {
        success: true,
        statistics: this.state.statistics
      };
    } catch (error) {
      this.state.isProcessing = false;
      const err = error instanceof Error ? error : new ValidationError(
        String(error),
        'STREAM_PROCESSING_ERROR',
        undefined,
        { originalError: error }
      );
      this.events.onError?.(err);
      return {
        success: false,
        error: err.message,
        statistics: this.state.statistics
      };
    }
  }

  /**
   * Process a chunk of features
   */
  protected async processChunk(features: Feature[], chunkIndex: number): Promise<Feature[]> {
    this.handleChunk(features, chunkIndex);
    features.forEach(feature => this.handleFeature(feature));
    return features;
  }

  /**
   * Analyze DXF file
   */
  async analyze(file: File): Promise<AnalyzeResult> {
    try {
      console.debug('[DXF_DEBUG] Starting DXF analysis for:', file.name);
      
      const text = await file.text();
      console.debug('[DXF_DEBUG] File content length:', text.length);

      const parseOptions: DxfParseOptions = {
        entityTypes: (this.options as DxfProcessorOptions).entityTypes,
        parseBlocks: (this.options as DxfProcessorOptions).importBlocks,
        parseText: (this.options as DxfProcessorOptions).importText,
        parseDimensions: (this.options as DxfProcessorOptions).importDimensions,
        validate: (this.options as DxfProcessorOptions).validateGeometry
      };

      const structure = await this.parser.parse(text, parseOptions) as DxfStructure;
      const entities = await DxfEntityProcessor.extractEntities(structure);
      const layers = DxfLayerProcessor.extractLayerNames(structure.layers || []);
      const bounds = DxfAnalyzer.calculateBoundsFromEntities(entities) || DEFAULT_BOUNDS;
      
      const detection = DxfAnalyzer.detectCoordinateSystem(bounds, structure);
      const coordinateSystem = detection.system ?? COORDINATE_SYSTEMS.SWISS_LV95;
      
      if (detection.confidence === 'low') {
        const err = new ValidationError(
          `Low confidence in coordinate system detection: ${detection.reason}`,
          'COORDINATE_SYSTEM_DETECTION',
          undefined,
          { confidence: detection.confidence }
        );
        this.events.onError?.(err);
      }

      const features = await DxfEntityProcessor.entitiesToFeatures(entities);
      const preview: FeatureCollection = {
        type: 'FeatureCollection',
        features: features.slice(0, 100) // Limit preview to first 100 features
      };

      return {
        layers,
        coordinateSystem,
        bounds,
        preview
      };

    } catch (error) {
      const err = error instanceof Error ? error : new ValidationError(
        String(error),
        'ANALYSIS_ERROR',
        undefined,
        { originalError: error }
      );
      this.events.onError?.(err);
      throw err;
    }
  }

  /**
   * Validate DXF entities before import
   */
  async validateData(entities: DxfEntity[]): Promise<boolean> {
    try {
      if (!entities || entities.length === 0) {
        throw new ValidationError('No entities to validate', 'VALIDATION_ERROR');
      }

      for (const entity of entities) {
        if (!entity.type) {
          throw new ValidationError('Entity missing required type property', 'VALIDATION_ERROR');
        }
        if (!entity.attributes) {
          throw new ValidationError('Entity missing required attributes', 'VALIDATION_ERROR');
        }

        switch (entity.type) {
          case 'LINE':
            if (!entity.data.x || !entity.data.y || !entity.data.x2 || !entity.data.y2) {
              throw new ValidationError('Line entity requires start and end points', 'VALIDATION_ERROR');
            }
            break;
          case 'POLYLINE':
          case 'LWPOLYLINE':
            if (!entity.data.vertices || entity.data.vertices.length < 2) {
              throw new ValidationError('Polyline entity requires at least 2 vertices', 'VALIDATION_ERROR');
            }
            break;
          case 'CIRCLE':
            if (!entity.data.x || !entity.data.y || typeof entity.data.radius !== 'number') {
              throw new ValidationError('Circle entity requires center point and radius', 'VALIDATION_ERROR');
            }
            break;
        }
      }

      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new ValidationError(
        String(error),
        'VALIDATION_ERROR',
        undefined,
        { originalError: error }
      );
      this.events.onError?.(err);
      return false;
    }
  }

  /**
   * Import entities to database
   */
  async importToDatabase(entities: DxfEntity[], dbClient: PostGISClient): Promise<DatabaseImportResult> {
    console.debug('[DEBUG] Starting database import');
    const startTime = Date.now();

    try {
      const isValid = await this.validateData(entities);
      if (!isValid) {
        throw new ValidationError('Data validation failed', 'IMPORT_ERROR');
      }

      const collectionId = await dbClient.createFeatureCollection(
        'DXF Import',
        `Imported from DXF file at ${new Date().toISOString()}`
      );

      const layers = this.getLayers();
      const layerIds: string[] = [];
      const layerMap = new Map<string, string>();

      for (const layerName of layers) {
        const layerId = await dbClient.createLayer(collectionId, layerName, 'dxf');
        layerIds.push(layerId);
        layerMap.set(layerName, layerId);
      }

      const features = await this.convertToFeatures(entities);
      
      let importedFeatures = 0;
      const failedFeatures: Array<{ entity: DxfEntity; error: string }> = [];

      for (const feature of features) {
        try {
          const layerName = feature.properties?.layer || '0';
          const layerId = layerMap.get(layerName);
          
          if (!layerId) {
            throw new ValidationError(`Layer not found: ${layerName}`, 'IMPORT_ERROR');
          }

          await dbClient.importFeatures(layerId, [feature]);
          importedFeatures++;
        } catch (error: any) {
          failedFeatures.push({
            entity: entities[features.indexOf(feature)],
            error: error?.message || 'Unknown error'
          });
        }
      }

      const result: DatabaseImportResult = {
        importedFeatures,
        collectionId,
        layerIds,
        failedFeatures,
        statistics: {
          importTime: Date.now() - startTime,
          validatedCount: entities.length,
          transformedCount: importedFeatures
        }
      };

      this.databaseResult = result;
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new ValidationError(
        String(error),
        'IMPORT_ERROR',
        undefined,
        { originalError: error }
      );
      this.events.onError?.(err);
      throw err;
    }
  }

  /**
   * Convert entities to GeoJSON features
   * @deprecated Use importToDatabase instead
   */
  private async convertToFeatures(entities: DxfEntity[]): Promise<Feature[]> {
    console.debug('[DEBUG] Converting entities to features:', { count: entities.length });
    const features = await DxfEntityProcessor.entitiesToFeatures(entities);

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
      
      const text = await file.text();
      const parseOptions: DxfParseOptions = {
        parseBlocks: (this.options as DxfProcessorOptions).importBlocks,
        parseText: (this.options as DxfProcessorOptions).importText,
        parseDimensions: (this.options as DxfProcessorOptions).importDimensions,
        validate: (this.options as DxfProcessorOptions).validateGeometry
      };

      const structure = await this.parser.parse(text, parseOptions) as DxfStructure;
      const entities = await DxfEntityProcessor.extractEntities(structure);
      const features = await this.convertToFeatures(entities);
      const layers = DxfLayerProcessor.extractLayerNames(structure.layers || []);
      const bounds = DxfAnalyzer.calculateBoundsFromEntities(entities) || DEFAULT_BOUNDS;

      this.state.statistics.featureCount = features.length;
      this.state.statistics.layerCount = layers.length;

      // Store entities for potential database import
      this.state.features = entities;

      // Create empty database result if none exists
      if (!this.databaseResult) {
        this.databaseResult = {
          importedFeatures: 0,
          collectionId: '',
          layerIds: [],
          failedFeatures: [],
          statistics: {
            importTime: 0,
            validatedCount: 0,
            transformedCount: 0
          }
        };
      }

      return {
        databaseResult: this.databaseResult,
        statistics: this.state.statistics,
        coordinateSystem: this.options.coordinateSystem,
        layers,
        bounds,
        preview: {
          type: 'FeatureCollection',
          features: features.slice(0, 100)
        }
      };
    } catch (error) {
      const err = error instanceof Error ? error : new ValidationError(
        String(error),
        'PROCESSING_ERROR',
        undefined,
        { originalError: error }
      );
      this.events.onError?.(err);
      throw err;
    }
  }

  /**
   * Set database client for import operations
   */
  setDatabaseClient(client: PostGISClient) {
    this.dbClient = client;
  }
}
