import { BaseProcessor, ProcessorOptions, AnalyzeResult, ProcessorResult } from './base-processor';
import { createShapefileParser } from '../utils/shapefile-parser';
import { CoordinateTransformer } from '../utils/coordinate-utils';
import { COORDINATE_SYSTEMS, CoordinateSystem } from '../types/coordinates';
import { suggestCoordinateSystem } from '../utils/coordinate-utils';
import { Feature, Geometry, Position } from 'geojson';
import { ErrorReport, Severity } from '../utils/errors';

interface ShapeFile extends File {
  relatedFiles?: {
    [key: string]: File
  }
}

interface ComponentValidation {
  isValid: boolean;
  missingRequired: string[];
  missingOptional: string[];
  availableComponents: { [key: string]: File };
}

export class ShapefileProcessor extends BaseProcessor {
  private parser = createShapefileParser();
  private readonly REQUIRED_COMPONENTS = ['.dbf', '.shx'] as const;
  private readonly OPTIONAL_COMPONENTS = ['.prj'] as const;
  private readonly MAX_PREVIEW_FEATURES = 1000;

  async canProcess(file: File): Promise<boolean> {
    return file.name.toLowerCase().endsWith('.shp');
  }

  private validateComponents(file: File): ComponentValidation {
    const shapeFile = file as ShapeFile;
    const relatedFiles = shapeFile.relatedFiles || {};
    
    const missingRequired = this.REQUIRED_COMPONENTS.filter(ext => !relatedFiles[ext]);
    const missingOptional = this.OPTIONAL_COMPONENTS.filter(ext => !relatedFiles[ext]);
    
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
          this.reportInfo('COORDINATE_SYSTEM', 'Using coordinate system from PRJ file', {
            system: detectedSystem,
            source: 'prj',
            prjContent: text.slice(0, 100) // First 100 chars for context
          });
          return detectedSystem;
        }
      } catch (error) {
        this.reportWarning('PRJ_ERROR', 'Failed to read PRJ file', {
          error: error instanceof Error ? error.message : 'Unknown error',
          fileName: validation.availableComponents['.prj'].name
        });
      }
    }

    // Try to detect from coordinates
    if (sampleFeatures.length > 0) {
      const points = this.extractPoints(sampleFeatures);
      if (points.length > 0) {
        const detectedSystem = suggestCoordinateSystem(points, this.options.errorReporter);
        this.reportInfo('COORDINATE_SYSTEM', 'Detected coordinate system from coordinates', {
          system: detectedSystem,
          source: 'coordinates',
          sampleCount: points.length,
          samplePoints: points.slice(0, 5) // First 5 points for context
        });
        return detectedSystem;
      }
    }

    // No system detected
    this.reportWarning('COORDINATE_SYSTEM', 'No coordinate system could be detected', {
      hasPrj: '.prj' in validation.availableComponents,
      sampleFeatureCount: sampleFeatures.length,
      pointCount: this.extractPoints(sampleFeatures).length
    });
    return COORDINATE_SYSTEMS.NONE;
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
        return value;
      }
    }

    return null;
  }

  private extractPoints(features: Feature[]): { x: number; y: number }[] {
    const points: { x: number; y: number }[] = [];
    
    features.forEach(feature => {
      if (feature.geometry.type === 'Point') {
        const coords = feature.geometry.coordinates;
        points.push({ x: coords[0], y: coords[1] });
      }
    });

    return points;
  }

  private convertErrorReports(reports: ErrorReport[]): AnalyzeResult['errors'] {
    return reports.map(report => ({
      type: report.type,
      message: report.message,
      context: report.context
    }));
  }

  async analyze(file: File): Promise<AnalyzeResult> {
    try {
      // Validate components
      const validation = this.validateComponents(file);
      
      if (!validation.isValid) {
        const message = `Missing required shapefile components: ${validation.missingRequired.join(', ')}`;
        this.reportError('MISSING_COMPONENTS', message, { 
          missingComponents: validation.missingRequired,
          fileName: file.name,
          availableComponents: Object.keys(validation.availableComponents)
        });
        throw new Error(message);
      }

      validation.missingOptional.forEach(component => {
        this.reportWarning('MISSING_OPTIONAL', `Missing optional component: ${component}`, {
          component,
          impact: component === '.prj' ? 'Coordinate system detection may be less accurate' : 'Some features may be limited',
          fileName: file.name
        });
      });

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

      // Get errors and warnings from the error reporter
      const reports = this.options.errorReporter.getReports();
      const errors = this.convertErrorReports(
        reports.filter(r => r.severity === Severity.ERROR)
      );
      const warnings = this.convertErrorReports(
        reports.filter(r => r.severity === Severity.WARNING)
      );

      return {
        layers: ['default'],
        coordinateSystem,
        bounds: {
          minX: header.bounds.xMin,
          minY: header.bounds.yMin,
          maxX: header.bounds.xMax,
          maxY: header.bounds.yMax
        },
        preview: {
          type: 'FeatureCollection',
          features: previewFeatures
        },
        warnings,
        errors
      };

    } catch (error) {
      this.reportError('ANALYSIS_ERROR', 'Shapefile analysis failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        fileName: file.name
      });
      throw error;
    }
  }

  async process(file: File): Promise<ProcessorResult> {
    try {
      const validation = this.validateComponents(file);
      
      if (!validation.isValid) {
        const message = `Missing required shapefile components: ${validation.missingRequired.join(', ')}`;
        this.reportError('MISSING_COMPONENTS', message, { 
          missingComponents: validation.missingRequired,
          fileName: file.name,
          availableComponents: Object.keys(validation.availableComponents)
        });
        throw new Error(message);
      }

      const features: Feature[] = [];
      const featureTypes: Record<string, number> = {};
      
      // Read the main shapefile
      const shpBuffer = await file.arrayBuffer();
      const header = await this.parser.readShapefileHeader(shpBuffer);

      // Read DBF data if available
      let attributeData: Record<number, Record<string, any>> = {};
      if (this.options.importAttributes && validation.availableComponents['.dbf']) {
        try {
          const dbfBuffer = await validation.availableComponents['.dbf'].arrayBuffer();
          const dbfHeader = await this.parser.readDBFHeader(dbfBuffer);
          attributeData = await this.parser.readDBFRecords(dbfBuffer, dbfHeader);

          this.reportInfo('DBF_READ', 'Successfully read DBF data', {
            fileName: validation.availableComponents['.dbf'].name,
            recordCount: Object.keys(attributeData).length,
            fields: dbfHeader.fields.map(f => f.name)
          });
        } catch (error) {
          this.reportWarning('DBF_ERROR', 'Failed to read attribute data', {
            error: error instanceof Error ? error.message : 'Unknown error',
            fileName: validation.availableComponents['.dbf'].name
          });
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
          
          // Update feature type counts
          const type = feature.geometry.type;
          featureTypes[type] = (featureTypes[type] || 0) + 1;
          
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
          this.reportError('FEATURE_ERROR', 'Failed to process feature', {
            error: error instanceof Error ? error.message : 'Unknown error',
            featureIndex: features.length,
            type: feature?.geometry?.type,
            properties: feature?.properties
          });
        }
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
        coordinateSystem: this.options.coordinateSystem || COORDINATE_SYSTEMS.NONE,
        statistics: {
          featureCount: features.length,
          layerCount: 1,
          featureTypes
        }
      };

    } catch (error) {
      this.reportError('PROCESSING_ERROR', 'Shapefile processing failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        fileName: file.name
      });
      throw error;
    }
  }
}
