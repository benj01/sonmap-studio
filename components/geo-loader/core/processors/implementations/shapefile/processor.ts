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
    // Update statistics
    features.forEach(feature => {
      if (feature.geometry) {
        updateStats(this.state.statistics, feature.geometry.type.toLowerCase());
      }
    });

    // Emit chunk
    if (this.events.onBatchComplete) {
      this.events.onBatchComplete(chunkIndex, features.length);
    }

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
    return getFeatureBounds(feature);
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

      // Try to detect coordinate system
      let coordinateSystem = this.options.coordinateSystem;
      
      if (!coordinateSystem) {
        try {
          // First try PRJ file
          const prjFileName = file.name.replace(/\.shp$/i, '.prj');
          const prjFile = await this.findAssociatedFile(file, prjFileName);
          
          if (prjFile) {
            console.debug('[ShapefileProcessor] Found PRJ file:', prjFileName);
            const prjContent = await prjReader.readPrjContent(prjFile);
            const detectedSystem = await prjReader.detectCoordinateSystem(prjContent);
            
            if (detectedSystem) {
              console.debug('[ShapefileProcessor] Detected coordinate system from PRJ:', detectedSystem);
              coordinateSystem = detectedSystem;
            } else {
              console.debug('[ShapefileProcessor] Could not detect coordinate system from PRJ');
            }
          } else {
            console.debug('[ShapefileProcessor] No PRJ file found');
          }
        } catch (error) {
          console.warn('[ShapefileProcessor] Error reading PRJ file:', error);
          this.addWarning(`Failed to read PRJ file: ${error instanceof Error ? error.message : String(error)}`);
        }

        // If no coordinate system from PRJ, try to detect from features
        if (!coordinateSystem) {
          console.debug('[ShapefileProcessor] Attempting to detect coordinate system from features');
          const previewFeatures = convertToGeoJSON(result.preview);
          const detectedSystem = await coordinateSystemManager.detect(previewFeatures);
          
          if (detectedSystem) {
            console.debug('[ShapefileProcessor] Detected coordinate system from features:', detectedSystem);
            coordinateSystem = detectedSystem;
          } else {
            console.debug('[ShapefileProcessor] Could not detect coordinate system from features');
          }
        }

        // Default to Swiss LV95 if still no coordinate system detected
        if (!coordinateSystem) {
          console.debug('[ShapefileProcessor] No coordinate system detected, defaulting to Swiss LV95');
          coordinateSystem = COORDINATE_SYSTEMS.SWISS_LV95;
        }
      }

      // Convert preview records to GeoJSON features and ensure coordinate transformation
      let previewFeatures = convertToGeoJSON(result.preview);

      // Always transform coordinates to WGS84 for preview
      console.debug('[ShapefileProcessor] Transforming coordinates:', {
        from: coordinateSystem,
        to: COORDINATE_SYSTEMS.WGS84,
        featureCount: previewFeatures.length,
        sampleCoords: previewFeatures[0]?.geometry ? getCoordinates(previewFeatures[0].geometry) : undefined
      });

      try {
        // Validate coordinates before transformation
        previewFeatures = previewFeatures.filter(feature => {
          if (!feature.geometry) {
            console.warn('[ShapefileProcessor] Feature missing geometry');
            return false;
          }

          const validateCoord = (coord: number): boolean => 
            typeof coord === 'number' && isFinite(coord) && !isNaN(coord);

          const validatePositions = (positions: any): boolean => {
            if (!Array.isArray(positions)) return false;
            
            if (typeof positions[0] === 'number') {
              // Single position [x, y]
              return positions.length >= 2 && positions.every(validateCoord);
            } else if (Array.isArray(positions[0])) {
              // Array of positions [[x, y], ...]
              return positions.every(pos => validatePositions(pos));
            }
            return false;
          };

          try {
            const coordinates = getCoordinates(feature.geometry);
            const isValid = validatePositions(coordinates);
            
            if (!isValid) {
              console.warn('[ShapefileProcessor] Invalid coordinates in feature:', {
                type: feature.geometry.type,
                coordinates
              });
            }
            return isValid;
          } catch (error) {
            console.warn('[ShapefileProcessor] Error validating coordinates:', error);
            return false;
          }
        });

        console.debug('[ShapefileProcessor] Validated features before transformation:', {
          originalCount: previewFeatures.length,
          validFeatures: previewFeatures.length,
          firstFeature: previewFeatures[0] ? {
            type: previewFeatures[0].geometry.type,
            coordinates: previewFeatures[0].geometry ? getCoordinates(previewFeatures[0].geometry) : undefined
          } : null
        });

        // Transform coordinates
        previewFeatures = await coordinateSystemManager.transform(
          previewFeatures,
          coordinateSystem || COORDINATE_SYSTEMS.SWISS_LV95,
          COORDINATE_SYSTEMS.WGS84
        );

        // Validate transformed coordinates
        previewFeatures = previewFeatures.filter(feature => {
          if (!feature.geometry) return false;

          try {
            const coordinates = getCoordinates(feature.geometry);
            const coordStr = JSON.stringify(coordinates);
            const isValid = coordStr.indexOf('null') === -1 &&
                          coordStr.indexOf('NaN') === -1 &&
                          coordStr.indexOf('Infinity') === -1;
            
            if (!isValid) {
              console.warn('[ShapefileProcessor] Invalid transformed coordinates:', {
                type: feature.geometry.type,
                coordinates
              });
            }
            return isValid;
          } catch (error) {
            console.warn('[ShapefileProcessor] Error validating transformed coordinates:', error);
            return false;
          }
        });

        console.debug('[ShapefileProcessor] Transformed coordinates:', {
          featureCount: previewFeatures.length,
          firstFeature: previewFeatures[0] ? {
            type: previewFeatures[0].geometry.type,
            coordinates: previewFeatures[0].geometry ? getCoordinates(previewFeatures[0].geometry) : undefined
          } : null
        });
      } catch (error) {
        console.error('[ShapefileProcessor] Coordinate transformation failed:', error);
        this.addWarning(`Coordinate transformation failed: ${error instanceof Error ? error.message : String(error)}`);
      }

      // Create feature collection for preview manager
      const featureCollection: FeatureCollection = {
        type: 'FeatureCollection',
        features: previewFeatures
      };

      // Update layers (in shapefile case, it's just one layer)
      this.layers = ['shapes'];

      // Calculate preview bounds from transformed features
      const bounds = {
        minX: Math.min(...previewFeatures.map(f => {
          if (!f.geometry) return Infinity;
          try {
            const coords = getCoordinates(f.geometry);
            if (Array.isArray(coords)) {
              if (typeof coords[0] === 'number') {
                return coords[0];
              } else {
                return Math.min(...coords.flat(2).filter((n): n is number => typeof n === 'number' && n % 2 === 0));
              }
            }
            return Infinity;
          } catch (error) {
            return Infinity;
          }
        })),
        minY: Math.min(...previewFeatures.map(f => {
          if (!f.geometry) return Infinity;
          try {
            const coords = getCoordinates(f.geometry);
            if (Array.isArray(coords)) {
              if (typeof coords[1] === 'number') {
                return coords[1];
              } else {
                return Math.min(...coords.flat(2).filter((n): n is number => typeof n === 'number' && n % 2 === 1));
              }
            }
            return Infinity;
          } catch (error) {
            return Infinity;
          }
        })),
        maxX: Math.max(...previewFeatures.map(f => {
          if (!f.geometry) return -Infinity;
          try {
            const coords = getCoordinates(f.geometry);
            if (Array.isArray(coords)) {
              if (typeof coords[0] === 'number') {
                return coords[0];
              } else {
                return Math.max(...coords.flat(2).filter((n): n is number => typeof n === 'number' && n % 2 === 0));
              }
            }
            return -Infinity;
          } catch (error) {
            return -Infinity;
          }
        })),
        maxY: Math.max(...previewFeatures.map(f => {
          if (!f.geometry) return -Infinity;
          try {
            const coords = getCoordinates(f.geometry);
            if (Array.isArray(coords)) {
              if (typeof coords[1] === 'number') {
                return coords[1];
              } else {
                return Math.max(...coords.flat(2).filter((n): n is number => typeof n === 'number' && n % 2 === 1));
              }
            }
            return -Infinity;
          } catch (error) {
            return -Infinity;
          }
        }))
      };

      // Create preview data structure
      const preview: ShapefilePreviewData = {
        records: result.preview,
        features: previewFeatures
      };

      // Log preview data for debugging
      console.debug('[ShapefileProcessor] Preview data:', {
        recordCount: result.preview.length,
        featureCount: previewFeatures.length,
        bounds,
        layers: this.layers,
        firstFeature: previewFeatures[0] ? {
          type: previewFeatures[0].geometry.type,
          coordinates: previewFeatures[0].geometry ? getCoordinates(previewFeatures[0].geometry) : undefined,
          properties: previewFeatures[0].properties
        } : null
      });

      return {
        layers: this.layers,
        coordinateSystem,
        bounds,
        preview
      };
    } catch (error) {
      throw new ValidationError(
        `Failed to analyze Shapefile: ${error instanceof Error ? error.message : String(error)}`,
        'SHAPEFILE_ANALYSIS_ERROR',
        error instanceof Error ? error : undefined,
        createErrorDetails(error)
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
