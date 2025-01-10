import { StreamProcessor } from '../../../processors/stream/stream-processor';
import { AnalyzeResult, ProcessorResult, ProcessorStats, DatabaseImportResult } from '../../../processors/base/types';
import { StreamProcessorResult, StreamProcessorEvents } from '../../../processors/stream/types';
import { Feature } from 'geojson';
import { ShapefileParser } from './parser';
import { ShapefileProcessorOptions, ShapefileParseOptions, ShapeType, PostGISConversionResult } from './types';
import { ValidationError } from '../../../errors/types';
import { CompressedFile } from '../../../compression/compression-handler';
import { PostGISClient } from '../../../../database/client';
import { PostGISGeometry, PostGISFeature } from '../../../../types/postgis';
import EventEmitter from 'events';

/**
 * Processor for Shapefile files with PostGIS support
 */
export class ShapefileProcessor extends StreamProcessor {
  private parser: ShapefileParser;
  protected dbClient: PostGISClient | null = null;
  private bounds: ProcessorResult['bounds'] = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity
  };
  private layers: string[] = [];
  private records: any[] = [];
  private transactionActive = false;
  private eventEmitter: EventEmitter;
  private warnings: string[] = [];

  constructor(options: ShapefileProcessorOptions = {}, events: StreamProcessorEvents = {}) {
    super(options, events);
    this.parser = new ShapefileParser(options);
    this.eventEmitter = new EventEmitter();
  }

  /**
   * Get accumulated warnings
   */
  getWarnings(): string[] {
    return this.warnings;
  }

  /**
   * Add a warning message
   */
  protected addWarning(message: string): void {
    this.warnings.push(message);
    if (this.events.onWarning) {
      this.events.onWarning(message);
    }
  }

  /**
   * Check if file can be processed
   */
  async canProcess(file: File): Promise<boolean> {
    return file.name.toLowerCase().endsWith('.shp');
  }

  /**
   * Analyze Shapefile
   */
  async analyze(file: File): Promise<AnalyzeResult> {
    try {
      const result = await this.parser.analyzeStructure(file, {
        previewRecords: (this.options as ShapefileProcessorOptions).previewRecords,
        parseDbf: (this.options as ShapefileProcessorOptions).importAttributes
      });

      // Report any issues found during analysis
      result.issues?.forEach(issue => {
        if (issue.type === 'WARNING') {
          this.addWarning(issue.message);
        } else {
          super.handleError(new ValidationError(
            issue.message,
            issue.type,
            undefined,
            issue.details
          ));
        }
      });

      // Determine coordinate system from options or default to WGS84
      const coordinateSystem = this.options.coordinateSystem || 'EPSG:4326';

      // Convert preview records to PostGIS format
      const previewFeatures = await this.convertToPostGIS(result.preview);

      // Update layers (in shapefile case, it's just one layer)
      this.layers = ['shapes'];

      // Calculate preview bounds
      const bounds = this.calculateBoundsFromRecords(result.preview);

      return {
        layers: this.layers,
        coordinateSystem,
        bounds,
        preview: {
          type: 'PostGISFeatureCollection',
          features: previewFeatures
        }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ValidationError(
        `Failed to analyze Shapefile: ${message}`,
        'SHAPEFILE_ANALYSIS_ERROR',
        undefined,
        { error: message }
      );
    }
  }

  /**
   * Process Shapefile with PostGIS support
   */
  protected async processStream(file: File): Promise<StreamProcessorResult> {
    try {
      this.resetState();

      // Get PostGIS options
      const postgisOptions = (this.options as ShapefileProcessorOptions).postgis;
      if (!postgisOptions?.tableName) {
        throw new Error('PostGIS table name is required');
      }

      // Configure parsing options
      const parseOptions: ShapefileParseOptions = {
        parseDbf: (this.options as ShapefileProcessorOptions).importAttributes,
        validate: (this.options as ShapefileProcessorOptions).validateGeometry,
        repair: (this.options as ShapefileProcessorOptions).repairGeometry,
        simplify: (this.options as ShapefileProcessorOptions).simplifyGeometry,
        tolerance: (this.options as ShapefileProcessorOptions).simplifyTolerance,
        postgis: {
          directConversion: true,
          targetSrid: postgisOptions.srid,
          force2D: true
        }
      };

      // Parse records
      this.records = await this.parser.parseFeatures(file, parseOptions);

      // Process records in batches
      const batchSize = postgisOptions.batchSize || 1000;
      const useTransaction = postgisOptions.useTransaction ?? true;
      const importResult: DatabaseImportResult = {
        importedFeatures: 0,
        collectionId: '',
        layerIds: [],
        failedFeatures: [],
        statistics: {
          importTime: 0,
          validatedCount: 0,
          transformedCount: 0,
          batchesProcessed: 0,
          transactionsCommitted: 0,
          transactionRollbacks: 0
        },
        postgis: {
          tableName: postgisOptions.tableName,
          schemaName: postgisOptions.schemaName || 'public',
          srid: postgisOptions.srid || 4326,
          geometryTypes: []
        }
      };

      const startTime = Date.now();

      try {
        if (useTransaction) {
          await this.dbClient?.beginTransaction();
          this.transactionActive = true;
          this.handleTransactionStatus('begin');
        }

        for (let i = 0; i < this.records.length; i += batchSize) {
          const batch = this.records.slice(i, i + batchSize);
          const features = await this.convertToPostGIS(batch);
          
          try {
            const result = await this.dbClient?.insertFeatures(
              postgisOptions.tableName,
              features,
              {
                batchSize,
                useTransaction,
                onProgress: (progress) => this.updateProgress((i + batch.length * progress) / this.records.length),
                onBatchComplete: (batchNumber, totalBatches) => {
                  if (importResult.statistics) {
                    importResult.statistics.batchesProcessed = batchNumber;
                  }
                  this.handleBatchComplete(batchNumber, totalBatches);
                }
              }
            );

            if (result) {
              importResult.importedFeatures += result.inserted;
              importResult.failedFeatures.push(...batch
                .slice(result.inserted)
                .map(record => ({
                  entity: record,
                  error: 'Failed to insert into PostGIS'
                }))
              );
            }
          } catch (error) {
            if (useTransaction) {
              throw error; // Will trigger rollback
            }
            // If not using transaction, log error and continue
            console.error('Batch insert failed:', error);
            importResult.failedFeatures.push(...batch.map(record => ({
              entity: record,
              error: error instanceof Error ? error.message : String(error)
            })));
          }

          // Update bounds and statistics
          this.updateBounds(batch);
          this.updateStats(this.state.statistics, batch);
        }

        if (useTransaction) {
          await this.dbClient?.commitTransaction();
          this.transactionActive = false;
          if (importResult.statistics) {
            importResult.statistics.transactionsCommitted = 
              (importResult.statistics.transactionsCommitted || 0) + 1;
          }
          this.handleTransactionStatus('commit');
        }

        // Create spatial index if requested
        if (postgisOptions.createSpatialIndex) {
          await this.createSpatialIndex(postgisOptions.tableName);
        }

      } catch (error) {
        if (this.transactionActive) {
          await this.dbClient?.rollbackTransaction();
          this.transactionActive = false;
          if (importResult.statistics) {
            importResult.statistics.transactionRollbacks = 
              (importResult.statistics.transactionRollbacks || 0) + 1;
          }
          this.handleTransactionStatus('rollback');
        }
        throw error;
      }

      importResult.statistics.importTime = Date.now() - startTime;

      return {
        statistics: this.state.statistics,
        success: true,
        databaseResult: importResult
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        statistics: this.state.statistics,
        success: false,
        error: `Failed to process Shapefile: ${message}`
      };
    }
  }

  /**
   * Convert shapefile records to PostGIS format
   */
  private async convertToPostGIS(records: any[]): Promise<PostGISFeature[]> {
    return Promise.all(records.map(async (record): Promise<PostGISFeature> => {
      const geometry = await this.convertGeometryToPostGIS(record);
      return {
        geometry,
        properties: record.attributes || {},
        srid: (this.options as ShapefileProcessorOptions).postgis?.srid || 4326
      };
    }));
  }

  /**
   * Convert shapefile geometry to PostGIS format
   */
  private async convertGeometryToPostGIS(record: any): Promise<PostGISGeometry> {
    const { shapeType, data } = record;
    const coordinates = data.coordinates;
    
    let type: string;
    switch (shapeType) {
      case ShapeType.POINT:
      case ShapeType.POINTZ:
      case ShapeType.POINTM:
        type = 'POINT';
        break;
      case ShapeType.POLYLINE:
      case ShapeType.POLYLINEZ:
      case ShapeType.POLYLINEM:
        type = 'LINESTRING';
        break;
      case ShapeType.POLYGON:
      case ShapeType.POLYGONZ:
      case ShapeType.POLYGONM:
        type = 'POLYGON';
        break;
      case ShapeType.MULTIPOINT:
      case ShapeType.MULTIPOINTZ:
      case ShapeType.MULTIPOINTM:
        type = 'MULTIPOINT';
        break;
      default:
        throw new Error(`Unsupported shape type: ${shapeType}`);
    }

    return {
      type: type as any,
      coordinates,
      srid: (this.options as ShapefileProcessorOptions).postgis?.srid || 4326
    };
  }

  /**
   * Create spatial index for imported data
   */
  private async createSpatialIndex(tableName: string): Promise<void> {
    if (!this.dbClient) return;

    const schemaName = (this.options as ShapefileProcessorOptions).postgis?.schemaName || 'public';
    const indexName = `${tableName}_geometry_idx`;
    
    await this.dbClient.executeQuery(
      `CREATE INDEX IF NOT EXISTS ${indexName} ON ${schemaName}.${tableName} USING GIST (geometry)`
    );
  }

  /**
   * Process a chunk of features
   */
  protected async processChunk(features: Feature[], chunkIndex: number): Promise<Feature[]> {
    // Update statistics
    features.forEach(feature => {
      if (feature.geometry) {
        this.updateStats(this.state.statistics, feature.geometry.type.toLowerCase());
      }
    });

    // Emit chunk
    this.handleChunk(features, chunkIndex);

    return features;
  }

  /**
   * Calculate bounds from processed features
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
   * Get bounds for a specific feature
   */
  protected getFeatureBounds(feature: Feature): Required<ProcessorResult>['bounds'] {
    const defaultBounds = {
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0
    };

    if (!feature.geometry) {
      return defaultBounds;
    }

    const bounds = {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity
    };

    // Try to use bbox if available
    if (feature.bbox && feature.bbox.length >= 4) {
      bounds.minX = feature.bbox[0];
      bounds.minY = feature.bbox[1];
      bounds.maxX = feature.bbox[2];
      bounds.maxY = feature.bbox[3];
      return bounds;
    }

    // Calculate from coordinates
    switch (feature.geometry.type) {
      case 'Point': {
        const coords = feature.geometry.coordinates as [number, number];
        bounds.minX = bounds.maxX = coords[0];
        bounds.minY = bounds.maxY = coords[1];
        break;
      }

      case 'LineString': {
        const coords = feature.geometry.coordinates as [number, number][];
        coords.forEach(([x, y]) => {
          bounds.minX = Math.min(bounds.minX, x);
          bounds.minY = Math.min(bounds.minY, y);
          bounds.maxX = Math.max(bounds.maxX, x);
          bounds.maxY = Math.max(bounds.maxY, y);
        });
        break;
      }

      case 'Polygon': {
        const coords = feature.geometry.coordinates as [number, number][][];
        coords[0].forEach(([x, y]) => {
          bounds.minX = Math.min(bounds.minX, x);
          bounds.minY = Math.min(bounds.minY, y);
          bounds.maxX = Math.max(bounds.maxX, x);
          bounds.maxY = Math.max(bounds.maxY, y);
        });
        break;
      }

      case 'MultiPoint': {
        const coords = feature.geometry.coordinates as [number, number][];
        coords.forEach(([x, y]) => {
          bounds.minX = Math.min(bounds.minX, x);
          bounds.minY = Math.min(bounds.minY, y);
          bounds.maxX = Math.max(bounds.maxX, x);
          bounds.maxY = Math.max(bounds.maxY, y);
        });
        break;
      }

      case 'MultiLineString': {
        const coords = feature.geometry.coordinates as [number, number][][];
        coords.forEach(line => {
          line.forEach(([x, y]) => {
            bounds.minX = Math.min(bounds.minX, x);
            bounds.minY = Math.min(bounds.minY, y);
            bounds.maxX = Math.max(bounds.maxX, x);
            bounds.maxY = Math.max(bounds.maxY, y);
          });
        });
        break;
      }

      case 'MultiPolygon': {
        const coords = feature.geometry.coordinates as [number, number][][][];
        coords.forEach(polygon => {
          polygon[0].forEach(([x, y]) => {
            bounds.minX = Math.min(bounds.minX, x);
            bounds.minY = Math.min(bounds.minY, y);
            bounds.maxX = Math.max(bounds.maxX, x);
            bounds.maxY = Math.max(bounds.maxY, y);
          });
        });
        break;
      }

      case 'GeometryCollection': {
        feature.geometry.geometries.forEach(geom => {
          const geomBounds = this.getFeatureBounds({
            type: 'Feature',
            geometry: geom,
            properties: null
          });
          if (geomBounds) {
            bounds.minX = Math.min(bounds.minX, geomBounds.minX);
            bounds.minY = Math.min(bounds.minY, geomBounds.minY);
            bounds.maxX = Math.max(bounds.maxX, geomBounds.maxX);
            bounds.maxY = Math.max(bounds.maxY, geomBounds.maxY);
          }
        });
        break;
      }
    }

    return isFinite(bounds.minX) ? bounds : defaultBounds;
  }

  /**
   * Process a group of files
   */
  protected async processFileGroup(files: CompressedFile[]): Promise<Feature[]> {
    // Not used for shapefiles as we handle related files internally
    return [];
  }

  /**
   * Calculate bounds from records
   */
  private calculateBoundsFromRecords(records: any[]): Required<ProcessorResult>['bounds'] {
    const bounds = {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity
    };

    records.forEach(record => {
      const bbox = record?.data?.bbox;
      if (bbox && 
          typeof bbox.xMin === 'number' && !isNaN(bbox.xMin) &&
          typeof bbox.yMin === 'number' && !isNaN(bbox.yMin) &&
          typeof bbox.xMax === 'number' && !isNaN(bbox.xMax) &&
          typeof bbox.yMax === 'number' && !isNaN(bbox.yMax)) {
        bounds.minX = Math.min(bounds.minX, bbox.xMin);
        bounds.minY = Math.min(bounds.minY, bbox.yMin);
        bounds.maxX = Math.max(bounds.maxX, bbox.xMax);
        bounds.maxY = Math.max(bounds.maxY, bbox.yMax);
      }
    });

    // Return default bounds if no valid coordinates were found
    if (!isFinite(bounds.minX)) {
      return {
        minX: 0,
        minY: 0,
        maxX: 0,
        maxY: 0
      };
    }

    return bounds;
  }

  /**
   * Update bounds with new records
   */
  private updateBounds(records: any[]): void {
    const currentBounds = this.bounds ?? {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity
    };

    records.forEach(record => {
      const bbox = record?.data?.bbox;
      if (bbox && 
          typeof bbox.xMin === 'number' && !isNaN(bbox.xMin) &&
          typeof bbox.yMin === 'number' && !isNaN(bbox.yMin) &&
          typeof bbox.xMax === 'number' && !isNaN(bbox.xMax) &&
          typeof bbox.yMax === 'number' && !isNaN(bbox.yMax)) {
        currentBounds.minX = Math.min(currentBounds.minX, bbox.xMin);
        currentBounds.minY = Math.min(currentBounds.minY, bbox.yMin);
        currentBounds.maxX = Math.max(currentBounds.maxX, bbox.xMax);
        currentBounds.maxY = Math.max(currentBounds.maxY, bbox.yMax);
      }
    });

    // Ensure valid bounds
    this.bounds = isFinite(currentBounds.minX) ? currentBounds : {
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0
    };
  }

  /**
   * Update statistics with batch of records
   */
  private updateStats(stats: ProcessorStats, records: any[] | string): void {
    if (typeof records === 'string') {
      // Handle string input (geometry type)
      const type = records.toLowerCase();
      if (!stats.featureTypes[type]) {
        stats.featureTypes[type] = 0;
      }
      stats.featureTypes[type]++;
      stats.featureCount++;
    } else {
      // Handle array input (batch of records)
      records.forEach(record => {
        const type = ShapeType[record.shapeType].toLowerCase();
        if (!stats.featureTypes[type]) {
          stats.featureTypes[type] = 0;
        }
        stats.featureTypes[type]++;
        stats.featureCount++;
      });
    }
  }

  /**
   * Handle batch completion
   */
  private handleBatchComplete(batchNumber: number, totalBatches: number): void {
    if (this.events.onBatchComplete) {
      this.events.onBatchComplete(batchNumber, totalBatches);
    }
  }

  /**
   * Handle transaction status changes
   */
  private handleTransactionStatus(status: 'begin' | 'commit' | 'rollback'): void {
    if (this.events.onTransactionStatus) {
      this.events.onTransactionStatus(status);
    }
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
    this.layers = ['shapes'];
    this.records = [];
    this.warnings = [];
    this.state.statistics = this.createDefaultStats();
  }

  /**
   * Create default statistics
   */
  protected createDefaultStats(): ProcessorStats {
    return {
      featureCount: 0,
      layerCount: 0,
      featureTypes: {},
      failedTransformations: 0,
      errors: []
    };
  }

  /**
   * Set PostGIS client
   */
  setPostGISClient(client: PostGISClient): void {
    this.dbClient = client;
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    if (this.transactionActive) {
      await this.dbClient?.rollbackTransaction();
    }
    this.dbClient = null;
    this.resetState();
  }
}
