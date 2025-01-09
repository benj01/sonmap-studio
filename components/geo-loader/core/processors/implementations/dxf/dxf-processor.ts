import { StreamProcessor } from '../../stream/stream-processor';
import { AnalyzeResult, ProcessorResult } from '../../base/types';
import { ValidationError } from '../../../errors/types';
import { COORDINATE_SYSTEMS, CoordinateSystem } from '../../../../types/coordinates';
import { StreamProcessorResult, StreamProcessorOptions } from '../../stream/types';
import { 
  DxfProcessorOptions, 
  DxfProcessorBaseOptions,
  DxfPreview, 
  DxfAnalyzeResult 
} from './types';
import { PostGISFeature, PostGISFeatureCollection } from './types/postgis';
import { DatabaseManager } from './modules/database-manager';
import { StateManager } from './modules/state-manager';
import { FileProcessor } from './modules/file-processor';
import { PostGISConverter } from './modules/postgis-converter';
import { RequiredBounds, CompressedDxfFile } from './types/bounds';
import { PostGISClient } from '../../../database/client';
import { TypeAdapter } from './utils/type-adapter';
import { Feature, Geometry, GeoJsonProperties } from 'geojson';
import { 
  createPostGISCoordinateSystem, 
  PostGISCoordinateSystem,
  toBaseCoordinateSystem,
  toPostGISCoordinateSystem
} from './types/coordinate-system';

const DEFAULT_BOUNDS: RequiredBounds = {
  minX: 0,
  minY: 0,
  maxX: 0,
  maxY: 0
};

/**
 * Processor for DXF files with direct PostGIS integration
 */
export class DxfProcessor extends StreamProcessor {
  private readonly fileProcessor: FileProcessor;
  private readonly stateManager: StateManager;
  private dbManager: DatabaseManager | null = null;
  private lastImportResult: ProcessorResult | null = null;
  private dxfOptions: DxfProcessorOptions;

  constructor(options: DxfProcessorOptions = {}) {
    // Create base options for StreamProcessor with all required properties
    const baseOptions: StreamProcessorOptions = {
      // StreamProcessor specific options
      chunkSize: options.chunkSize,
      parallel: options.parallel,
      maxParallel: options.maxParallel,
      bufferSize: options.bufferSize,
      // Base processor options
      coordinateSystem: toBaseCoordinateSystem(options.coordinateSystem),
      selectedLayers: options.selectedLayers,
      selectedTypes: options.selectedTypes,
      importAttributes: options.importAttributes,
      errorReporter: options.errorReporter,
      onProgress: options.onProgress,
      relatedFiles: options.relatedFiles
    };
    super(baseOptions);

    // Initialize instance properties
    this.dxfOptions = options;
    this.fileProcessor = new FileProcessor();
    this.stateManager = new StateManager();
  }

  /**
   * Get DXF-specific options
   */
  protected getDxfOptions(): DxfProcessorOptions {
    return this.dxfOptions;
  }

  /**
   * Process a chunk of features
   */
  protected async processChunk(
    features: Feature<Geometry, GeoJsonProperties>[],
    chunkIndex: number
  ): Promise<Feature<Geometry, GeoJsonProperties>[]> {
    this.stateManager.updateChunksProcessed(chunkIndex + 1);
    const postgisFeatures = TypeAdapter.toPostGISArray(features);
    postgisFeatures.forEach(feature => {
      const type = feature.geometry.type.toLowerCase();
      this.stateManager.incrementFeatureType(type);
    });
    return features;
  }

  /**
   * Calculate bounds from processed features
   */
  protected calculateBounds(): RequiredBounds {
    return this.fileProcessor.calculateBounds(this.stateManager.getFeatures());
  }

  /**
   * Get available layers
   */
  protected getLayers(): string[] {
    return this.stateManager.getLayers();
  }

  /**
   * Get bounds for a specific feature
   */
  protected getFeatureBounds(
    feature: Feature<Geometry, GeoJsonProperties>
  ): RequiredBounds {
    if (!this.dbManager) {
      throw new ValidationError('Database client not initialized', 'IMPORT_ERROR');
    }
    const postgisFeature = TypeAdapter.toPostGIS(feature);
    
    // Since we can't make this async, we'll return default bounds
    // and update them asynchronously through the database
    this.dbManager.getFeatureBounds(postgisFeature).then(bounds => {
      return bounds;
    }).catch(error => {
      this.events.onError?.(new ValidationError(
        'Failed to get feature bounds',
        'GEOMETRY_ERROR',
        undefined,
        { originalError: error }
      ));
      return DEFAULT_BOUNDS;
    });

    return DEFAULT_BOUNDS;
  }

  /**
   * Check if file can be processed
   */
  async canProcess(file: File): Promise<boolean> {
    return this.fileProcessor.canProcess(file);
  }

  /**
   * Set database client for import operations
   */
  setDatabaseClient(client: PostGISClient): void {
    this.dbManager = new DatabaseManager(client);
  }

  /**
   * Process a group of related files
   */
  protected async processFileGroup(
    files: CompressedDxfFile[]
  ): Promise<Feature<Geometry, GeoJsonProperties>[]> {
    if (files.length === 0) return [];

    const file = files[0].data;
    const { entities, layers } = await this.fileProcessor.parseFile(file, {
      parseBlocks: this.dxfOptions.importBlocks,
      parseText: this.dxfOptions.importText,
      parseDimensions: this.dxfOptions.importDimensions,
      validate: this.dxfOptions.validateGeometry
    });

    if (!this.dbManager) {
      throw new ValidationError('Database client not initialized', 'IMPORT_ERROR');
    }

    const postgisSystem = toPostGISCoordinateSystem(this.dxfOptions.coordinateSystem) || 
      createPostGISCoordinateSystem(COORDINATE_SYSTEMS.WGS84);
    if (!this.dxfOptions.projectFileId) {
      throw new ValidationError('Project file ID is required for PostGIS import', 'IMPORT_ERROR');
    }

    const importResult = await this.dbManager.importEntities(
      this.dxfOptions.projectFileId,
      entities,
      layers,
      {
        validateGeometry: this.dxfOptions.validateGeometry,
        transformCoordinates: true,
        sourceSrid: this.dxfOptions.postgis?.sourceSrid || postgisSystem.srid,
        targetSrid: this.dxfOptions.postgis?.targetSrid || postgisSystem.srid,
        chunkSize: this.dxfOptions.chunkSize || 1000
      }
    );

    this.stateManager.updateStatistics({
      featureCount: importResult.importedFeatures,
      layerCount: layers.length
    });

    this.lastImportResult = {
      databaseResult: importResult,
      statistics: this.stateManager.getStatistics(),
      coordinateSystem: toBaseCoordinateSystem(this.dxfOptions.coordinateSystem),
      layers,
      bounds: this.calculateBounds(),
      preview: TypeAdapter.createPreview(importResult.features)
    };

    return TypeAdapter.toGeoJSONArray(importResult.features);
  }

  /**
   * Process stream of features
   */
  protected async processStream(file: File): Promise<StreamProcessorResult> {
    try {
      this.stateManager.setProcessing(true);
      
      const { entities, layers } = await this.fileProcessor.parseFile(file, {
        parseBlocks: this.dxfOptions.importBlocks,
        parseText: this.dxfOptions.importText,
        parseDimensions: this.dxfOptions.importDimensions,
        validate: this.dxfOptions.validateGeometry
      });

      this.stateManager.setFeatures(entities);

      // Process in chunks if needed
      const chunkSize = this.dxfOptions.chunkSize || 1000;
      const postgisSystem = toPostGISCoordinateSystem(this.dxfOptions.coordinateSystem) || 
        createPostGISCoordinateSystem(COORDINATE_SYSTEMS.WGS84);

      await this.fileProcessor.processInChunks(entities, chunkSize, async (chunk, index) => {
        if (!this.dbManager) return;
        
        if (!this.dxfOptions.projectFileId) {
          throw new ValidationError('Project file ID is required for PostGIS import', 'IMPORT_ERROR');
        }

        const { features } = await this.dbManager.importEntities(
          this.dxfOptions.projectFileId,
          chunk,
          layers,
          {
            validateGeometry: this.dxfOptions.validateGeometry,
            transformCoordinates: true,
            sourceSrid: this.dxfOptions.postgis?.sourceSrid || postgisSystem.srid,
            targetSrid: this.dxfOptions.postgis?.targetSrid || postgisSystem.srid,
            chunkSize
          }
        );

        const geoJsonFeatures = TypeAdapter.toGeoJSONArray(features);
        await this.processChunk(geoJsonFeatures, index);
        this.stateManager.updateProgress((index + 1) * chunkSize / entities.length);
      });

      this.stateManager.setProcessing(false);
      this.stateManager.updateProgress(1);

      return {
        success: true,
        statistics: this.stateManager.getStatistics()
      };
    } catch (error) {
      this.stateManager.setProcessing(false);
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
        statistics: this.stateManager.getStatistics()
      };
    }
  }

  /**
   * Analyze DXF file
   */
  async analyze(file: File): Promise<DxfAnalyzeResult> {
    try {
      const { structure, entities, layers } = await this.fileProcessor.parseFile(file, {
        entityTypes: this.dxfOptions.entityTypes,
        parseBlocks: this.dxfOptions.importBlocks,
        parseText: this.dxfOptions.importText,
        parseDimensions: this.dxfOptions.importDimensions,
        validate: this.dxfOptions.validateGeometry
      });

      const bounds = this.fileProcessor.calculateBounds(entities);
      // Detect coordinate system from bounds
      const detection = this.fileProcessor.detectCoordinateSystem(bounds, structure);
      
      // Default to WGS84 if no system detected or detection confidence is low
      const detectedSystem = detection.confidence === 'high' 
        ? detection.system 
        : COORDINATE_SYSTEMS.WGS84;

      // Create PostGIS system - this will never return undefined for valid systems
      const postgisSystem = createPostGISCoordinateSystem(detectedSystem);
      
      // Get base system for internal use
      const baseSystem = toBaseCoordinateSystem(postgisSystem);

      // Update processor options with detected coordinate system
      this.options = {
        ...this.options,
        coordinateSystem: baseSystem,
      };

      // Update DXF-specific options with PostGIS configuration
      this.dxfOptions = {
        ...this.dxfOptions,
        coordinateSystem: postgisSystem,
        postgis: {
          ...this.dxfOptions.postgis,
          sourceSrid: postgisSystem.srid,
          targetSrid: postgisSystem.srid
        }
      };

      // Log warning for low confidence detection
      if (detection.confidence === 'low') {
        console.warn(
          `Low confidence in coordinate system detection: ${detection.reason}`,
          { confidence: detection.confidence }
        );
      }

      // Generate preview
      const previewEntities = entities.slice(0, 100);
      const previewFeatures = await Promise.all(
        previewEntities.map(async entity => {
          if (!this.dbManager) {
            throw new ValidationError('Database client not initialized', 'IMPORT_ERROR');
          }
          const wkt = PostGISConverter.entityToWKT(entity);
          const geometry = await this.dbManager.createGeometry(
            wkt, 
            postgisSystem.srid
          );
          return PostGISConverter.createFeature(
            entity,
            geometry,
            postgisSystem.srid
          );
        })
      );

      const preview: DxfPreview = {
        type: 'DXF',
        features: previewEntities,
        postgisFeatures: previewFeatures.map(f => f.geometry)
      };

      const result: DxfAnalyzeResult = {
        layers,
        coordinateSystem: postgisSystem,
        bounds,
        preview,
        structure,
        issues: detection.confidence === 'low' ? [{
          type: 'COORDINATE_SYSTEM_DETECTION',
          message: `Low confidence in coordinate system detection: ${detection.reason}`,
          details: { confidence: detection.confidence }
        }] : undefined
      };

      return result;
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
   * Process DXF file
   */
  async process(file: File): Promise<ProcessorResult> {
    try {
      const { structure, entities, layers } = await this.fileProcessor.parseFile(file, {
        parseBlocks: this.dxfOptions.importBlocks,
        parseText: this.dxfOptions.importText,
        parseDimensions: this.dxfOptions.importDimensions,
        validate: this.dxfOptions.validateGeometry
      });

      const bounds = this.fileProcessor.calculateBounds(entities);
      
      // Ensure coordinate system is properly set
      const detection = this.fileProcessor.detectCoordinateSystem(bounds, structure);
      const detectedSystem = detection.confidence === 'high' 
        ? detection.system 
        : COORDINATE_SYSTEMS.WGS84;
      
      // Update coordinate system if not already set
      if (!this.dxfOptions.coordinateSystem) {
        const postgisSystem = createPostGISCoordinateSystem(detectedSystem);
        this.dxfOptions.coordinateSystem = postgisSystem;
        this.options.coordinateSystem = toBaseCoordinateSystem(postgisSystem);
      }

      const features = await this.processFileGroup([{
        data: file,
        name: file.name,
        path: file.name,
        size: file.size
      }]);

      this.stateManager.updateStatistics({
        featureCount: features.length,
        layerCount: layers.length
      });

      // Create preview collection
      const preview = TypeAdapter.createPreview(TypeAdapter.toPostGISArray(features.slice(0, 100)));

      return {
        databaseResult: this.lastImportResult?.databaseResult || {
          importedFeatures: 0,
          collectionId: '',
          layerIds: [],
          failedFeatures: [],
          statistics: {
            importTime: 0,
            validatedCount: 0,
            transformedCount: 0
          }
        },
        statistics: this.stateManager.getStatistics(),
        coordinateSystem: toBaseCoordinateSystem(this.dxfOptions.coordinateSystem),
        layers,
        bounds,
        preview
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
}
