import { BaseProcessor, ProcessorOptions, AnalyzeResult, ProcessorResult } from './base-processor';
import { createShapefileParser } from '../utils/shapefile-parser';
import { CoordinateTransformer } from '../utils/coordinate-utils';
import { COORDINATE_SYSTEMS, CoordinateSystem } from '../types/coordinates';
import { suggestCoordinateSystem } from '../utils/coordinate-utils';
import { Feature, Geometry, Position } from 'geojson';
import { 
  ParseError, 
  ValidationError, 
  CoordinateTransformationError 
} from '../utils/errors';

/**
 * Extended File interface for shapefiles with related component files
 */
interface ShapeFile extends File {
  relatedFiles?: Record<string, File>;
}

/**
 * Result of shapefile component validation
 */
interface ComponentValidation {
  /** Whether all required components are present */
  isValid: boolean;
  /** List of missing required components */
  missingRequired: string[];
  /** List of missing optional components */
  missingOptional: string[];
  /** Map of available component files */
  availableComponents: Record<string, File>;
}

/**
 * Processor for ESRI Shapefiles
 */
export class ShapefileProcessor extends BaseProcessor {
  private parser = createShapefileParser();
  private readonly REQUIRED_COMPONENTS = ['.dbf', '.shx'];
  private readonly OPTIONAL_COMPONENTS = ['.prj'];
  private readonly MAX_PREVIEW_FEATURES = 1000;

  constructor(options: ProcessorOptions = {}) {
    super(options);
  }

  async canProcess(file: File): Promise<boolean> {
    return file.name.toLowerCase().endsWith('.shp');
  }

  private validateComponents(file: File): ComponentValidation {
    const shapeFile = file as ShapeFile;
    const relatedFiles = shapeFile.relatedFiles || {};
    
    const missingRequired = this.REQUIRED_COMPONENTS.filter(ext => !relatedFiles[ext]);
    const missingOptional = this.OPTIONAL_COMPONENTS.filter(ext => !relatedFiles[ext]);
    
    if (missingRequired.length > 0) {
      this.errorReporter.addError(
        'Missing required shapefile components',
        'SHAPEFILE_MISSING_COMPONENTS',
        { missingRequired }
      );
    }

    missingOptional.forEach(component => {
      this.errorReporter.addWarning(
        `Missing optional component: ${component}`,
        'SHAPEFILE_MISSING_OPTIONAL',
        { component }
      );
    });

    return {
      isValid: missingRequired.length === 0,
      missingRequired,
      missingOptional,
      availableComponents: relatedFiles
    };
  }

  private async detectCoordinateSystem(
    file: File, 
    validation: ComponentValidation,
    sampleFeatures: Feature[]
  ): Promise<CoordinateSystem> {
    // Try to read from PRJ file first
    if (validation.availableComponents['.prj']) {
      try {
        const text = await validation.availableComponents['.prj'].text();
        const detectedSystem = this.detectFromPrj(text);
        if (detectedSystem) {
          this.errorReporter.addInfo(
            'Using coordinate system from PRJ file',
            'SHAPEFILE_PRJ_SYSTEM',
            { system: detectedSystem }
          );
          return detectedSystem;
        }
      } catch (error) {
        this.errorReporter.addWarning(
          'Failed to read PRJ file',
          'SHAPEFILE_PRJ_READ_ERROR',
          { error: error instanceof Error ? error.message : String(error) }
        );
      }
    }

    // Try to detect from coordinates
    if (sampleFeatures.length > 0) {
      const points = this.extractPoints(sampleFeatures);
      if (points.length > 0) {
        const detectedSystem = suggestCoordinateSystem(points);
        this.errorReporter.addInfo(
          'Detected coordinate system from coordinates',
          'SHAPEFILE_COORDINATE_SYSTEM',
          { system: detectedSystem, sampleCount: points.length }
        );
        return detectedSystem;
      }
    }

    // Default to Swiss LV95 if no other system detected
    this.errorReporter.addWarning(
      'Using default coordinate system (Swiss LV95)',
      'SHAPEFILE_DEFAULT_SYSTEM',
      { reason: sampleFeatures.length === 0 ? 'no_features' : 'no_points' }
    );
    return COORDINATE_SYSTEMS.SWISS_LV95;
  }

  private detectFromPrj(content: string): CoordinateSystem | null {
    const projectionMap: Record<string, CoordinateSystem> = {
      'CH1903+': COORDINATE_SYSTEMS.SWISS_LV95,
      'CH1903': COORDINATE_SYSTEMS.SWISS_LV03,
      'EPSG:2056': COORDINATE_SYSTEMS.SWISS_LV95,
      'EPSG:21781': COORDINATE_SYSTEMS.SWISS_LV03,
      'PROJCS["CH1903+': COORDINATE_SYSTEMS.SWISS_LV95,
      'PROJCS["CH1903': COORDINATE_SYSTEMS.SWISS_LV03
    };

    for (const [key, value] of Object.entries(projectionMap)) {
      if (content.includes(key)) {
        this.errorReporter.addInfo(
          'Found coordinate system in PRJ file',
          'SHAPEFILE_PRJ_MATCH',
          { key, system: value }
        );
        return value;
      }
    }

    this.errorReporter.addWarning(
      'No known coordinate system found in PRJ file',
      'SHAPEFILE_PRJ_NO_MATCH',
      { content }
    );
    return null;
  }

  private extractPoints(features: Feature[]): { x: number; y: number }[] {
    const points: { x: number; y: number }[] = [];
    
    features.forEach(feature => {
      if (feature.geometry.type === 'Point') {
        const coords = feature.geometry.coordinates;
        if (Array.isArray(coords) && coords.length >= 2 && 
            typeof coords[0] === 'number' && typeof coords[1] === 'number' &&
            isFinite(coords[0]) && isFinite(coords[1])) {
          points.push({ x: coords[0], y: coords[1] });
        } else {
          this.errorReporter.addWarning(
            'Invalid point coordinates',
            'SHAPEFILE_INVALID_POINT',
            { coordinates: coords }
          );
        }
      }
    });

    return points;
  }

  async analyze(file: File): Promise<AnalyzeResult> {
    try {
      // Validate components
      const validation = this.validateComponents(file);
      
      if (!validation.isValid) {
        throw new ValidationError(
          'Missing required shapefile components',
          'shapefile_components',
          file.name,
          { missingComponents: validation.missingRequired }
        );
      }

      // Read the main shapefile
      const shpBuffer = await file.arrayBuffer();
      const header = await this.parser.readShapefileHeader(shpBuffer);
      
      // Generate preview features with progress tracking
      const previewFeatures: Feature[] = [];
      let processedCount = 0;
      
      for await (const feature of this.parser.streamFeatures(shpBuffer, header)) {
        previewFeatures.push(feature);
        processedCount++;
        
        this.emitProgress(processedCount / this.MAX_PREVIEW_FEATURES);
        
        if (previewFeatures.length >= this.MAX_PREVIEW_FEATURES) break;
      }

      // Detect coordinate system
      const coordinateSystem = await this.detectCoordinateSystem(
        file,
        validation,
        previewFeatures
      );

      // Validate bounds
      if (!isFinite(header.bounds.xMin) || !isFinite(header.bounds.yMin) ||
          !isFinite(header.bounds.xMax) || !isFinite(header.bounds.yMax)) {
        throw new ValidationError(
          'Invalid shapefile bounds',
          'shapefile_bounds',
          file.name,
          { bounds: header.bounds }
        );
      }

      const bounds = {
        minX: header.bounds.xMin,
        minY: header.bounds.yMin,
        maxX: header.bounds.xMax,
        maxY: header.bounds.yMax
      };

      return {
        layers: ['default'],
        coordinateSystem,
        bounds,
        preview: {
          type: 'FeatureCollection',
          features: previewFeatures
        }
      };

    } catch (error) {
      if (error instanceof ValidationError || error instanceof ParseError) {
        throw error;
      }
      throw new ParseError(
        `Shapefile analysis failed: ${error instanceof Error ? error.message : String(error)}`,
        'shapefile',
        file.name,
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  async process(file: File): Promise<ProcessorResult> {
    try {
      const validation = this.validateComponents(file);
      
      if (!validation.isValid) {
        throw new ValidationError(
          'Missing required shapefile components',
          'shapefile_components',
          file.name,
          { missingComponents: validation.missingRequired }
        );
      }

      const statistics = this.createDefaultStats();
      const features: Feature[] = [];
      
      // Read the main shapefile
      const shpBuffer = await file.arrayBuffer();
      const header = await this.parser.readShapefileHeader(shpBuffer);

      // Read DBF data if available
      let attributeData: Record<number, Record<string, unknown>> = {};
      if (this.options.importAttributes && validation.availableComponents['.dbf']) {
        try {
          const dbfBuffer = await validation.availableComponents['.dbf'].arrayBuffer();
          const dbfHeader = await this.parser.readDBFHeader(dbfBuffer);
          attributeData = await this.parser.readDBFRecords(dbfBuffer, dbfHeader);
          
          this.errorReporter.addInfo(
            'Successfully read attribute data',
            'SHAPEFILE_DBF_READ',
            { recordCount: Object.keys(attributeData).length }
          );
        } catch (error) {
          this.errorReporter.addWarning(
            'Failed to read attribute data',
            'SHAPEFILE_DBF_ERROR',
            { error: error instanceof Error ? error.message : String(error) }
          );
        }
      }

      // Process features
      let processedBytes = 100; // Start after header
      for await (const feature of this.parser.streamFeatures(shpBuffer, header)) {
        try {
          // Add attributes if available
          if (attributeData[features.length + 1]) {
            feature.properties = { 
              ...feature.properties, 
              ...attributeData[features.length + 1] 
            };
          }

          features.push(feature);
          this.updateStats(statistics, feature.geometry.type);
          
          // Update progress based on processed bytes vs total file length
          processedBytes += 8; // Record header
          if (feature.geometry.type === 'Point') {
            processedBytes += 20; // Point record size
          } else {
            // For other types, estimate progress based on current position
            processedBytes = Math.min(processedBytes + 100, header.fileLength);
          }
          
          this.emitProgress(processedBytes / header.fileLength);
        } catch (error) {
          this.recordError(
            statistics,
            'feature_processing',
            'SHAPEFILE_FEATURE_ERROR',
            'Failed to process feature',
            {
              featureIndex: features.length,
              error: error instanceof Error ? error.message : String(error)
            }
          );
        }
      }

      if (features.length === 0) {
        throw new ValidationError(
          'No valid features found in shapefile',
          'shapefile_empty',
          file.name,
          { statistics }
        );
      }

      return {
        features: {
          type: 'FeatureCollection',
          features
        },
        bounds: {
          minX: header.bounds.xMin,
          minY: header.bounds.yMin,
          maxX: header.bounds.xMax,
          maxY: header.bounds.yMax
        },
        layers: ['default'],
        coordinateSystem: this.options.coordinateSystem || COORDINATE_SYSTEMS.SWISS_LV95,
        statistics
      };

    } catch (error) {
      if (error instanceof ValidationError || error instanceof ParseError) {
        throw error;
      }
      throw new ParseError(
        `Shapefile processing failed: ${error instanceof Error ? error.message : String(error)}`,
        'shapefile',
        file.name,
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }
}
