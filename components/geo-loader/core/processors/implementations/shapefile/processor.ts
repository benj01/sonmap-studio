import { Feature, FeatureCollection, Position, Geometry, Point, LineString, Polygon, MultiPoint, MultiLineString, MultiPolygon, GeometryCollection } from 'geojson';
import { StreamProcessor } from '../../../processors/stream/stream-processor';
import { AnalyzeResult, ProcessorResult, ProcessorStats } from '../../../processors/base/types';
import { StreamProcessorResult } from '../../../processors/stream/types';
import { ShapefileParser } from './parser';
import { ShapefileProcessorOptions, ShapefileParseOptions } from './types';
import { ValidationError } from '../../../errors/types';
import { CompressedFile } from '../../../compression/compression-handler';

/**
 * Processor for Shapefile files
 */
export class ShapefileProcessor extends StreamProcessor {
  private parser: ShapefileParser;
  private bounds: ProcessorResult['bounds'] = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity
  };
  private layers: string[] = [];
  private features: Feature[] = [];

  /**
   * Get bounds for a specific feature
   */
  protected getFeatureBounds(feature: Feature<Geometry, any>): { minX: number; minY: number; maxX: number; maxY: number } {
    // Initialize bounds with infinity values
    const bounds: ProcessorResult['bounds'] = {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity
    };

    // Helper function to update bounds from coordinates
    const updateBounds = (coords: number[]): void => {
      const [x, y] = coords;
      bounds.minX = Math.min(bounds.minX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.maxY = Math.max(bounds.maxY, y);
    };

    if (feature.geometry) {
      const geometry = feature.geometry;
      
      switch (geometry.type) {
        case 'Point':
          updateBounds(geometry.coordinates);
          break;

        case 'LineString':
          geometry.coordinates.forEach(updateBounds);
          break;

        case 'Polygon':
          geometry.coordinates.forEach((ring: number[][]) => ring.forEach(updateBounds));
          break;

        case 'MultiPoint':
          geometry.coordinates.forEach(updateBounds);
          break;

        case 'MultiLineString':
          geometry.coordinates.forEach((line: number[][]) => line.forEach(updateBounds));
          break;

        case 'MultiPolygon':
          geometry.coordinates.forEach((polygon: number[][][]) => 
            polygon.forEach(ring => ring.forEach(updateBounds))
          );
          break;

        case 'GeometryCollection': {
          // Process each non-collection geometry
          const nonCollectionGeometries = geometry.geometries.filter(
            (g): g is Exclude<Geometry, GeometryCollection> => g.type !== 'GeometryCollection'
          );

          // Process each geometry
          nonCollectionGeometries.forEach(g => {
            // Create a new feature with the geometry
            const subFeature: Feature<Exclude<Geometry, GeometryCollection>, null> = {
              type: 'Feature',
              geometry: g,
              properties: null
            };

            // Get bounds for this geometry (we know it will return a valid bounds object)
            const subBounds = this.getFeatureBounds(subFeature) as { minX: number; minY: number; maxX: number; maxY: number };

            // Update main bounds
            bounds.minX = Math.min(bounds.minX, subBounds.minX);
            bounds.minY = Math.min(bounds.minY, subBounds.minY);
            bounds.maxX = Math.max(bounds.maxX, subBounds.maxX);
            bounds.maxY = Math.max(bounds.maxY, subBounds.maxY);
          });
          break;
        }
      }
    }

    // Always return a valid bounds object
    return {
      minX: bounds.minX,
      minY: bounds.minY,
      maxX: bounds.maxX,
      maxY: bounds.maxY
    };
  }

  /**
   * Process a group of files (not used for shapefiles as we handle related files internally)
   */
  protected async processFileGroup(files: CompressedFile[]): Promise<Feature[]> {
    // Not used for shapefiles as we handle related files internally
    return [];
  }

  /**
   * Update statistics for a feature type
   */
  protected updateStats(stats: ProcessorStats, type: string): void {
    if (!stats.featureTypes[type]) {
      stats.featureTypes[type] = 0;
    }
    stats.featureTypes[type]++;
    stats.featureCount++;
  }

  constructor(options: ShapefileProcessorOptions = {}) {
    super(options);
    this.parser = new ShapefileParser(options);
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
        super.handleError(new ValidationError(
          issue.message,
          issue.type,
          undefined,
          issue.details
        ));
      });

      // Determine coordinate system from options or default to WGS84
      const coordinateSystem = this.options.coordinateSystem || 'EPSG:4326';

      // Convert preview records to features
      const previewFeatures = await this.parser.parseFeatures(file, {
        parseDbf: (this.options as ShapefileProcessorOptions).importAttributes,
        validate: (this.options as ShapefileProcessorOptions).validateGeometry,
        repair: (this.options as ShapefileProcessorOptions).repairGeometry,
        simplify: (this.options as ShapefileProcessorOptions).simplifyGeometry,
        tolerance: (this.options as ShapefileProcessorOptions).simplifyTolerance,
        maxRecords: 100
      });

      // Update layers (in shapefile case, it's just one layer)
      this.layers = ['shapes'];

      // Calculate preview bounds
      const bounds = this.calculateBoundsFromFeatures(previewFeatures);

      return {
        layers: this.layers,
        coordinateSystem,
        bounds,
        preview: {
          type: 'FeatureCollection',
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
   * Process Shapefile in streaming mode
   */
  /**
   * Get any warnings from processing
   */
  getWarnings(): string[] {
    return this.state.statistics.errors
      .map(error => error.message)
      .filter((message): message is string => message !== undefined);
  }

  protected async processStream(file: File): Promise<StreamProcessorResult> {
    try {
      this.resetState();

      // Configure parsing options
      const parseOptions: ShapefileParseOptions = {
        parseDbf: (this.options as ShapefileProcessorOptions).importAttributes,
        validate: (this.options as ShapefileProcessorOptions).validateGeometry,
        repair: (this.options as ShapefileProcessorOptions).repairGeometry,
        simplify: (this.options as ShapefileProcessorOptions).simplifyGeometry,
        tolerance: (this.options as ShapefileProcessorOptions).simplifyTolerance
      };

      // Parse features
      this.features = await this.parser.parseFeatures(file, parseOptions);

      // Process features in chunks
      const chunkSize = 1000;
      for (let i = 0; i < this.features.length; i += chunkSize) {
        const chunk = this.features.slice(i, i + chunkSize);
        const processedChunk = await this.processChunk(chunk, i / chunkSize);
        
        // Update bounds
        this.updateBounds(processedChunk);
        
        // Update progress
        this.updateProgress(i / this.features.length);
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
        error: `Failed to process Shapefile: ${message}`
      };
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
    this.layers = ['shapes'];
    this.features = [];
    this.state.statistics = {
      featureCount: 0,
      layerCount: 0,
      featureTypes: {},
      failedTransformations: 0,
      errors: []
    };
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
   * Update bounds with new features
   */
  private updateBounds(features: Feature[]): void {
    features.forEach(feature => {
      if (!feature.geometry) return;

      const updateCoords = (coords: Position) => {
        if (!this.bounds) return;
        const [x, y] = coords;
        if (typeof x === 'number' && typeof y === 'number') {
          this.bounds.minX = Math.min(this.bounds.minX, x);
          this.bounds.minY = Math.min(this.bounds.minY, y);
          this.bounds.maxX = Math.max(this.bounds.maxX, x);
          this.bounds.maxY = Math.max(this.bounds.maxY, y);
        }
      };

      switch (feature.geometry.type) {
        case 'Point':
          updateCoords(feature.geometry.coordinates as Position);
          break;
        case 'LineString':
          (feature.geometry.coordinates as Position[]).forEach(updateCoords);
          break;
        case 'Polygon':
          (feature.geometry.coordinates as Position[][]).forEach(ring => {
            ring.forEach(updateCoords);
          });
          break;
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

    features.forEach(feature => {
      if (feature.geometry.type === 'Point') {
        const coords = feature.geometry.coordinates as Position;
        bounds.minX = Math.min(bounds.minX, coords[0] as number);
        bounds.minY = Math.min(bounds.minY, coords[1] as number);
        bounds.maxX = Math.max(bounds.maxX, coords[0] as number);
        bounds.maxY = Math.max(bounds.maxY, coords[1] as number);
      } else if (feature.geometry.type === 'LineString') {
        (feature.geometry.coordinates as Position[]).forEach(coords => {
          bounds.minX = Math.min(bounds.minX, coords[0] as number);
          bounds.minY = Math.min(bounds.minY, coords[1] as number);
          bounds.maxX = Math.max(bounds.maxX, coords[0] as number);
          bounds.maxY = Math.max(bounds.maxY, coords[1] as number);
        });
      } else if (feature.geometry.type === 'Polygon') {
        (feature.geometry.coordinates as Position[][]).forEach(ring => {
          ring.forEach(coords => {
            bounds.minX = Math.min(bounds.minX, coords[0] as number);
            bounds.minY = Math.min(bounds.minY, coords[1] as number);
            bounds.maxX = Math.max(bounds.maxX, coords[0] as number);
            bounds.maxY = Math.max(bounds.maxY, coords[1] as number);
          });
        });
      }
    });

    return bounds;
  }
}
