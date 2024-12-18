// components/geo-loader/processors/shapefile-processor.ts

import { BaseProcessor, ProcessorOptions, AnalyzeResult, ProcessorResult } from './base-processor';
import { createShapefileParser } from '../utils/shapefile-parser';
import { CoordinateTransformer } from '../utils/coordinate-utils';
import { COORDINATE_SYSTEMS, CoordinateSystem } from '../types/coordinates';
import { suggestCoordinateSystem } from '../utils/coordinate-utils';
import { Feature, Geometry, Position } from 'geojson';

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
  private REQUIRED_COMPONENTS = ['.dbf', '.shx'];
  private OPTIONAL_COMPONENTS = ['.prj'];
  private MAX_PREVIEW_FEATURES = 1000;

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
          this.emitWarning('Using coordinate system from PRJ file');
          return detectedSystem;
        }
      } catch (error) {
        this.emitWarning('Failed to read PRJ file');
      }
    }

    // Try to detect from coordinates
    if (sampleFeatures.length > 0) {
      const points = this.extractPoints(sampleFeatures);
      if (points.length > 0) {
        const detectedSystem = suggestCoordinateSystem(points);
        this.emitWarning(`Detected coordinate system from coordinates: ${detectedSystem}`);
        return detectedSystem;
      }
    }

    // Default to Swiss LV95 if no other system detected
    this.emitWarning('Using default coordinate system (Swiss LV95)');
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

  async analyze(file: File): Promise<AnalyzeResult> {
    try {
      // Validate components
      const validation = this.validateComponents(file);
      
      if (!validation.isValid) {
        throw new Error(
          `Missing required shapefile components: ${validation.missingRequired.join(', ')}`
        );
      }

      validation.missingOptional.forEach(component => {
        this.emitWarning(`Missing optional component: ${component}`);
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

      // Calculate bounds
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
      throw new Error(
        `Shapefile analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async process(file: File): Promise<ProcessorResult> {
    try {
      const validation = this.validateComponents(file);
      
      if (!validation.isValid) {
        throw new Error(
          `Missing required shapefile components: ${validation.missingRequired.join(', ')}`
        );
      }

      const statistics = this.createDefaultStats();
      const features: Feature[] = [];
      
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
        } catch (error) {
          this.emitWarning('Failed to read attribute data');
        }
      }

      // Process features
      let processedCount = 0;
      for await (const feature of this.parser.streamFeatures(shpBuffer, header)) {
        try {
          // Add attributes if available
          if (attributeData[processedCount + 1]) {
            feature.properties = { 
              ...feature.properties, 
              ...attributeData[processedCount + 1] 
            };
          }

          features.push(feature);
          this.updateStats(statistics, feature.geometry.type);
          processedCount++;
          
          this.emitProgress(processedCount / header.recordCount);
        } catch (error) {
          this.recordError(
            statistics,
            'feature_processing',
            `Failed to process feature ${processedCount}`
          );
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
        coordinateSystem: this.options.coordinateSystem || COORDINATE_SYSTEMS.SWISS_LV95,
        statistics
      };

    } catch (error) {
      throw new Error(
        `Shapefile processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}

// Register the shapefile processor
ProcessorRegistry.register('shp', ShapefileProcessor);