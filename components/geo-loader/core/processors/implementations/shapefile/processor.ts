 import { StreamProcessor } from '../../stream/stream-processor';
import { StreamProcessorResult, StreamProcessorEvents } from '../../stream/types';
import { AnalyzeResult, ProcessorResult } from '../../base/types';
import { Feature, FeatureCollection, Point, LineString, Polygon, MultiPoint, MultiLineString, MultiPolygon, Geometry, Position } from 'geojson';
import { ShapefileParser } from './parser';
import { COORDINATE_SYSTEMS } from '../../../../types/coordinates';
import { coordinateSystemManager } from '../../../coordinate-systems/coordinate-system-manager';
import { 
  ShapefileProcessorOptions, 
  ShapefileRecord, 
  ShapefilePreviewData,
  AnalysisIssue,
  ShapefileAnalyzeResult
} from './types';
import { ValidationError, createErrorDetails } from '../../../errors/types';
import { CompressedFile } from '../../../compression/compression-handler';
import { PostGISClient } from '../../../../database/client';
import EventEmitter from 'events';

// Import modular components
import { convertToGeoJSON, convertToPostGIS } from './converters';
import { calculateBoundsFromRecords, updateBounds, getFeatureBounds } from './utils/bounds';
import { createDefaultStats, updateStats, addError, resetStats } from './utils/stats';
import { TransactionManager } from './database';
import { prjReader } from './utils/prj-reader';

// Type guards for geometry types
const isPoint = (geom: Geometry): geom is Point => geom.type === 'Point';
const isLineString = (geom: Geometry): geom is LineString => geom.type === 'LineString';
const isPolygon = (geom: Geometry): geom is Polygon => geom.type === 'Polygon';
const isMultiPoint = (geom: Geometry): geom is MultiPoint => geom.type === 'MultiPoint';
const isMultiLineString = (geom: Geometry): geom is MultiLineString => geom.type === 'MultiLineString';
const isMultiPolygon = (geom: Geometry): geom is MultiPolygon => geom.type === 'MultiPolygon';

// Helper function to get coordinates from any geometry type
function getCoordinates(geometry: Geometry): Position | Position[] | Position[][] | Position[][][] {
  if (isPoint(geometry)) return geometry.coordinates;
  if (isLineString(geometry)) return geometry.coordinates;
  if (isPolygon(geometry)) return geometry.coordinates;
  if (isMultiPoint(geometry)) return geometry.coordinates;
  if (isMultiLineString(geometry)) return geometry.coordinates;
  if (isMultiPolygon(geometry)) return geometry.coordinates;
  throw new Error(`Unsupported geometry type: ${geometry.type}`);
}

/**
 * Processor for Shapefile files with PostGIS support
 */
export class ShapefileProcessor extends StreamProcessor<ShapefileRecord, Feature> {
  private parser: ShapefileParser;
  private transactionManager: TransactionManager | null = null;
  private bounds = createDefaultBounds();
  private layers: string[] = [];
  private records: ShapefileRecord[] = [];
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
   * Process a chunk of features
   */
  protected async processChunk(features: Feature[], chunkIndex: number): Promise<Feature[]> {
    console.debug('[ShapefileProcessor] Processing chunk:', {
      chunkIndex,
      featureCount: features.length,
      sample: features[0] ? {
        type: features[0].geometry?.type,
        coordinates: features[0].geometry?.coordinates,
        bbox: features[0].bbox,
        properties: features[0].properties
      } : null
    });

    return features;
  }

  /**
   * Analyze Shapefile
   */
  async analyze(file: File): Promise<AnalyzeResult<ShapefileRecord, Feature>> {
    try {
      const result = await this.parser.analyzeStructure(file, {
        previewRecords: (this.options as ShapefileProcessorOptions).previewRecords,
        parseDbf: (this.options as ShapefileProcessorOptions).importAttributes
      });

      // Report any issues found during analysis
      result.issues?.forEach((issue: AnalysisIssue) => {
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

      // Force Swiss LV95 coordinate system
      const coordinateSystem = COORDINATE_SYSTEMS.SWISS_LV95;
      console.debug('[ShapefileProcessor] Forcing coordinate system to Swiss LV95');

      // Convert preview features
      const preview = result.preview || [];
      const previewFeatures = convertToGeoJSON(preview).map(feature => {
        if (!feature) return null;
        return {
          type: 'Feature',
          geometry: feature.geometry,
          properties: {
            ...feature.properties,
            layer: 'shapes',
            type: feature.geometry?.type || 'unknown'
          }
        };
      }).filter(Boolean) as Feature[];

      console.debug('[ShapefileProcessor] Converted preview features:', {
        inputCount: preview.length,
        outputCount: previewFeatures.length,
        sample: previewFeatures[0] || null
      });

      // Calculate bounds from preview features
      const bounds = preview.reduce((acc, record) => {
        const bbox = record?.data?.bbox;
        if (bbox && 
            typeof bbox.xMin === 'number' && !isNaN(bbox.xMin) &&
            typeof bbox.yMin === 'number' && !isNaN(bbox.yMin) &&
            typeof bbox.xMax === 'number' && !isNaN(bbox.xMax) &&
            typeof bbox.yMax === 'number' && !isNaN(bbox.yMax)) {
          acc.minX = Math.min(acc.minX, bbox.xMin);
          acc.minY = Math.min(acc.minY, bbox.yMin);
          acc.maxX = Math.max(acc.maxX, bbox.xMax);
          acc.maxY = Math.max(acc.maxY, bbox.yMax);
        }
        return acc;
      }, {
        minX: Infinity,
        minY: Infinity,
        maxX: -Infinity,
        maxY: -Infinity
      });

      // Validate bounds are within Swiss range
      const validBounds = {
        minX: Math.max(bounds.minX, 2485000),
        minY: Math.max(bounds.minY, 1075000),
        maxX: Math.min(bounds.maxX, 2834000),
        maxY: Math.min(bounds.maxY, 1299000)
      };

      console.debug('[ShapefileProcessor] Calculated bounds:', {
        original: bounds,
        validated: validBounds,
        isValid: isFinite(bounds.minX) && isFinite(bounds.minY) && 
                isFinite(bounds.maxX) && isFinite(bounds.maxY)
      });

      // Create feature collection
      const previewCollection: FeatureCollection = {
        type: 'FeatureCollection',
        features: previewFeatures
      };

      return {
        ...result,
        preview: previewCollection,
        coordinateSystem,
        bounds: validBounds,
        structure: {
          fields: result.structure?.fields || [],
          recordCount: result.structure?.recordCount || 0,
          shapeHeader: result.structure?.shapeHeader || null
        }
      };
    } catch (error) {
      console.error('[ShapefileProcessor] Analysis failed:', error);
      throw error;
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
      const parseOptions = {
        parseDbf: (this.options as ShapefileProcessorOptions).importAttributes,
        validate: (this.options as ShapefileProcessorOptions).validateGeometry,
        repair: (this.options as ShapefileProcessorOptions).repairGeometry,
        simplify: (this.options as ShapefileProcessorOptions).simplifyGeometry,
        tolerance: (this.options as ShapefileProcessorOptions).simplifyTolerance,
        convertToPostGIS: true,
        postgis: {
          targetSrid: postgisOptions.srid,
          force2D: true
        }
      };

      // Parse records
      this.records = await this.parser.parseFeatures(file, parseOptions);

      // Process records in batches
      const batchSize = postgisOptions.batchSize || 1000;
      const useTransaction = postgisOptions.useTransaction ?? true;

      // Convert to PostGIS features
      const features = await convertToPostGIS(this.records, postgisOptions.srid);

      if (!this.transactionManager) {
        throw new Error('PostGIS client not set');
      }

      // Process using transaction manager
      const result = await this.transactionManager.insertFeatures(
        postgisOptions.tableName,
        features,
        {
          batchSize,
          useTransaction,
          onProgress: progress => this.updateProgress(progress),
          onBatchComplete: (batchNumber, totalBatches) => {
            if (this.events.onBatchComplete) {
              this.events.onBatchComplete(batchNumber, totalBatches);
            }
          }
        }
      );

      // Create spatial index if requested
      if (postgisOptions.createSpatialIndex) {
        await this.transactionManager.createSpatialIndex(
          postgisOptions.tableName,
          postgisOptions.schemaName
        );
      }

      // Update bounds and statistics
      this.bounds = updateBounds(this.bounds, this.records);
      updateStats(this.state.statistics, this.records);

      return {
        statistics: this.state.statistics,
        success: true,
        databaseResult: result
      };

    } catch (error) {
      return {
        statistics: this.state.statistics,
        success: false,
        error: `Failed to process Shapefile: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Process a group of files
   */
  protected async processFileGroup(files: CompressedFile[]): Promise<Feature[]> {
    // Not used for shapefiles as we handle related files internally
    return [];
  }

  /**
   * Set PostGIS client
   */
  setPostGISClient(client: PostGISClient): void {
    this.transactionManager = new TransactionManager(client);
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    if (this.transactionManager?.isTransactionActive()) {
      await this.transactionManager.rollbackTransaction();
    }
    this.transactionManager = null;
    this.resetState();
  }

  /**
   * Reset processor state
   */
  private resetState(): void {
    this.bounds = createDefaultBounds();
    this.layers = ['shapes'];
    this.records = [];
    this.warnings = [];
    resetStats(this.state.statistics);
  }

  /**
   * Find an associated file with the same name but different extension
   */
  private async findAssociatedFile(mainFile: File, targetFileName: string): Promise<File | null> {
    // If the file is from a FileList (e.g., drag-and-drop or file input)
    if (mainFile.webkitRelativePath) {
      const directory = mainFile.webkitRelativePath.split('/').slice(0, -1).join('/');
      // TODO: Implement directory scanning if needed
      return null;
    }

    // If we have access to the file system
    try {
      const directory = (mainFile as any).path?.split(/[\\/]/).slice(0, -1).join('/');
      if (directory) {
        const files = await (mainFile as any).directory?.getFiles();
        return files?.find((f: File) => f.name.toLowerCase() === targetFileName.toLowerCase()) || null;
      }
    } catch (error) {
      console.debug('[ShapefileProcessor] Error finding associated file:', error);
    }

    return null;
  }

  /**
   * Validate coordinates based on potential coordinate systems
   */
  protected validateCoordinates(coords: any[]): boolean {
    if (!Array.isArray(coords) || coords.length < 2) {
      console.debug('[ShapefileProcessor] Invalid coordinate array:', coords);
      return false;
    }

    const [x, y] = coords;
    if (!isFinite(x) || !isFinite(y)) {
      console.debug('[ShapefileProcessor] Non-finite coordinates:', { x, y });
      return false;
    }

    // Check Swiss LV95 bounds (adjusted for real-world data)
    if (x >= 2450000 && x <= 2850000 && y >= 1050000 && y <= 1350000) {
      console.debug('[ShapefileProcessor] Valid Swiss LV95 coordinates:', { x, y });
      return true;
    }

    // Check Swiss LV03 bounds (adjusted for real-world data)
    if (x >= 450000 && x <= 850000 && y >= 50000 && y <= 350000) {
      console.debug('[ShapefileProcessor] Valid Swiss LV03 coordinates:', { x, y });
      return true;
    }

    // Check WGS84 bounds
    if (x >= -180 && x <= 180 && y >= -90 && y <= 90) {
      console.debug('[ShapefileProcessor] Valid WGS84 coordinates:', { x, y });
      return true;
    }

    console.debug('[ShapefileProcessor] Coordinates outside known bounds:', { x, y });
    return false;
  }

  /**
   * Helper to validate a single coordinate pair
   */
  protected isValidPair(x: number, y: number): boolean {
    return this.validateCoordinates([x, y]);
  }
}

/**
 * Create default bounds object
 */
function createDefaultBounds(): Required<ProcessorResult>['bounds'] {
  return {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity
  };
}

/**
 * Calculate initial bounds from features
 */
function calculateInitialBounds(features: Feature[]): Required<ProcessorResult>['bounds'] {
  console.debug('[ShapefileProcessor] Calculating initial bounds');
  
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let hasValidCoords = false;

  const processCoords = (coords: any) => {
    if (!Array.isArray(coords)) return;
    
    // Handle flat arrays [x1,y1,x2,y2,...]
    if (typeof coords[0] === 'number' && coords.length >= 2) {
      const x = coords[0];
      const y = coords[1];
      if (isFinite(x) && isFinite(y)) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        hasValidCoords = true;
      }
    } else {
      // Handle nested arrays [[x1,y1], [x2,y2], ...]
      coords.forEach(processCoords);
    }
  };

  features.forEach(feature => {
    if (feature?.geometry?.coordinates) {
      processCoords(feature.geometry.coordinates);
    }
  });

  console.debug('[ShapefileProcessor] Initial bounds calculated:', {
    hasValidCoords,
    bounds: { minX, minY, maxX, maxY }
  });

  if (!hasValidCoords) {
    // Default to Swiss bounds if no valid coordinates
    return {
      minX: 2485000,  // Min X for Switzerland in LV95
      minY: 1075000,  // Min Y for Switzerland in LV95
      maxX: 2834000,  // Max X for Switzerland in LV95
      maxY: 1299000   // Max Y for Switzerland in LV95
    };
  }

  return { minX, minY, maxX, maxY };
}
