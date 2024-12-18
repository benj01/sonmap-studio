// components/geo-loader/processors/dxf-processor.ts

import { BaseProcessor, ProcessorOptions, AnalyzeResult, ProcessorResult } from './base-processor';
import { DxfData, DxfEntity } from '../utils/dxf/types';
import { createDxfParser } from '../utils/dxf/core-parser';
import { createDxfAnalyzer } from '../utils/dxf/analyzer';
import { DxfConverter } from '../utils/dxf/converter';
import { CoordinateTransformer } from '../utils/coordinate-utils';
import { COORDINATE_SYSTEMS } from '../types/coordinates';
import { Feature } from 'geojson';

const PREVIEW_CHUNK_SIZE = 1000;
const SAMPLE_RATE = 5;

export class DxfProcessor extends BaseProcessor {
  private parser = createDxfParser();
  private analyzer = createDxfAnalyzer();
  private converter = new DxfConverter();

  constructor(options: ProcessorOptions = {}) {
    super(options);
  }

  async canProcess(file: File): Promise<boolean> {
    return file.name.toLowerCase().endsWith('.dxf');
  }

  private async readFileContent(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read DXF file'));
      reader.readAsText(file);
    });
  }

  private async parseDxf(content: string): Promise<DxfData> {
    try {
      return await this.parser.parse(content, {
        validate: true,
        onProgress: progress => this.emitProgress(progress * 0.5)
      });
    } catch (error) {
      throw new Error(`DXF parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async analyze(file: File): Promise<AnalyzeResult> {
    try {
      const content = await this.readFileContent(file);
      const dxf = await this.parseDxf(content);

      if (!dxf || !Array.isArray(dxf.entities)) {
        throw new Error('Invalid DXF file structure');
      }

      // Run comprehensive analysis
      const analysisResult = this.analyzer.analyze(dxf);
      
      // Process warnings and non-critical errors
      const warnings: string[] = [
        ...analysisResult.warnings.map(w => w.message),
        ...analysisResult.errors.filter(e => !e.isCritical).map(e => e.message)
      ];

      // Handle critical errors
      const criticalErrors = analysisResult.errors.filter(e => e.isCritical);
      if (criticalErrors.length > 0) {
        throw new Error(
          'Critical errors found in DXF file:\n' +
          criticalErrors.map(e => `- ${e.message}`).join('\n')
        );
      }

      // Expand block references for preview
      const expandedEntities = this.parser.expandBlockReferences(dxf);
      
      // Convert to GeoJSON features for preview
      const previewFeatures: Feature[] = [];
      let processedCount = 0;
      
      for (const entity of expandedEntities) {
        if (processedCount % SAMPLE_RATE === 0) {
          const feature = this.parser.entityToGeoFeature(entity);
          if (feature) {
            previewFeatures.push(feature);
          }
        }
        processedCount++;
        
        if (previewFeatures.length >= PREVIEW_CHUNK_SIZE) {
          break;
        }
      }

      // Calculate bounds from preview features
      const bounds = this.calculateBounds(previewFeatures);

      // Get all available layers
      const layers = this.parser.getLayers();

      return {
        layers,
        coordinateSystem: this.options.coordinateSystem || COORDINATE_SYSTEMS.SWISS_LV95,
        bounds,
        preview: {
          type: 'FeatureCollection',
          features: previewFeatures
        },
        warnings
      };

    } catch (error) {
      throw new Error(`DXF analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async process(file: File): Promise<ProcessorResult> {
    try {
      const content = await this.readFileContent(file);
      const dxf = await this.parseDxf(content);
      
      const statistics = this.createDefaultStats();
      const warnings: string[] = [];
      const selectedLayers = this.options.selectedLayers || [];
      const selectedTypes = this.options.selectedTypes || [];
      
      // Expand all block references
      const expandedEntities = this.parser.expandBlockReferences(dxf);
      
      // Convert entities to GeoJSON features
      const features: Feature[] = [];
      let failedConversions = 0;
      
      for (const entity of expandedEntities) {
        // Filter by layer and type if specified
        if (selectedLayers.length > 0 && !selectedLayers.includes(entity.layer || '0')) {
          continue;
        }
        if (selectedTypes.length > 0 && !selectedTypes.includes(entity.type)) {
          continue;
        }

        try {
          const feature = this.parser.entityToGeoFeature(entity);
          if (feature) {
            features.push(feature);
            this.updateStats(statistics, entity.type);
          } else {
            failedConversions++;
            this.recordError(statistics, 'conversion', `Failed to convert ${entity.type} entity`);
          }
        } catch (error) {
          failedConversions++;
          this.recordError(
            statistics,
            'conversion',
            `Error converting ${entity.type} entity: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }

        // Update progress
        this.emitProgress(0.5 + (features.length / expandedEntities.length) * 0.5);
      }

      if (failedConversions > 0) {
        warnings.push(`Failed to convert ${failedConversions} entities`);
      }

      // Calculate final bounds
      const bounds = this.calculateBounds(features);

      statistics.layerCount = selectedLayers.length || this.parser.getLayers().length;

      return {
        features: {
          type: 'FeatureCollection',
          features
        },
        bounds,
        layers: this.parser.getLayers(),
        coordinateSystem: this.options.coordinateSystem || COORDINATE_SYSTEMS.SWISS_LV95,
        statistics,
        warnings
      };

    } catch (error) {
      throw new Error(`DXF processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private calculateBounds(features: Feature[]): ProcessorResult['bounds'] {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    features.forEach(feature => {
      if (feature.bbox) {
        minX = Math.min(minX, feature.bbox[0]);
        minY = Math.min(minY, feature.bbox[1]);
        maxX = Math.max(maxX, feature.bbox[2]);
        maxY = Math.max(maxY, feature.bbox[3]);
      }
    });

    return {
      minX: isFinite(minX) ? minX : 0,
      minY: isFinite(minY) ? minY : 0,
      maxX: isFinite(maxX) ? maxX : 1,
      maxY: isFinite(maxY) ? maxY : 1
    };
  }
}

// Register the DXF processor
ProcessorRegistry.register('dxf', DxfProcessor);