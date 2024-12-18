// components/geo-loader/processors/dxf-processor.ts

import { BaseProcessor, ProcessorOptions, AnalyzeResult, ProcessorResult } from './base-processor';
import { DxfData, DxfEntity, Vector3, isDxfPointEntity, isDxfLineEntity, isDxfPolylineEntity, isDxfCircleEntity } from '../utils/dxf/types';
import { createDxfParser } from '../utils/dxf/core-parser';
import { createDxfAnalyzer } from '../utils/dxf/analyzer';
import { DxfConverter } from '../utils/dxf/converter';
import { CoordinateTransformer, suggestCoordinateSystem } from '../utils/coordinate-utils';
import { COORDINATE_SYSTEMS, CoordinateSystem } from '../types/coordinates';
import { Feature } from 'geojson';
import { entityToGeoFeature } from '../utils/dxf/geo-converter';

const PREVIEW_CHUNK_SIZE = 1000;
const SAMPLE_RATE = 5;
const PROCESS_CHUNK_SIZE = 500; // For chunked processing

export class DxfProcessor extends BaseProcessor {
  private parser = createDxfParser();
  private analyzer = createDxfAnalyzer();
  private converter = new DxfConverter();
  private rawDxfData: DxfData | undefined = undefined;

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
      const dxfData = await this.parser.parse(content, {
        validate: true,
        onProgress: progress => this.emitProgress(progress * 0.3) // Reduced to 30% for parsing
      });
      this.rawDxfData = dxfData;
      return dxfData;
    } catch (error) {
      throw new Error(`DXF parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private getEntityCoordinates(entity: DxfEntity): Vector3[] {
    if (isDxfPointEntity(entity)) {
      return [entity.position];
    } else if (isDxfLineEntity(entity)) {
      return [entity.start, entity.end];
    } else if (isDxfPolylineEntity(entity)) {
      return entity.vertices;
    } else if (isDxfCircleEntity(entity)) {
      return [entity.center];
    }
    return [];
  }

  private detectCoordinateSystem(entities: DxfEntity[]): CoordinateSystem {
    // Sample coordinates from different entity types
    const sampleCoords: Vector3[] = [];
    for (let i = 0; i < Math.min(entities.length, 100); i++) {
      const coords = this.getEntityCoordinates(entities[i]);
      sampleCoords.push(...coords);
      if (sampleCoords.length >= 100) break;
    }

    if (sampleCoords.length === 0) return COORDINATE_SYSTEMS.WGS84;

    // Check for common Swiss coordinate ranges
    const isInSwissRange = sampleCoords.every(coord => 
      coord.x >= 2000000 && coord.x <= 3000000 && 
      coord.y >= 1000000 && coord.y <= 2000000
    );

    if (isInSwissRange) return COORDINATE_SYSTEMS.SWISS_LV95;

    // Check for WGS84 range
    const isInWGS84Range = sampleCoords.every(coord => 
      Math.abs(coord.x) <= 180 && Math.abs(coord.y) <= 90
    );

    return isInWGS84Range ? COORDINATE_SYSTEMS.WGS84 : COORDINATE_SYSTEMS.SWISS_LV95;
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
      
      // Detect coordinate system
      const detectedSystem = this.detectCoordinateSystem(expandedEntities);
      
      // Convert to GeoJSON features for preview with progress updates
      const previewFeatures: Feature[] = [];
      let processedCount = 0;
      const totalEntities = expandedEntities.length;
      
      for (const entity of expandedEntities) {
        if (processedCount % SAMPLE_RATE === 0) {
          const feature = entityToGeoFeature(entity, {}, detectedSystem);
          if (feature) {
            previewFeatures.push(feature);
          }
        }
        processedCount++;
        
        // Update progress (30-50%)
        this.emitProgress(0.3 + (processedCount / totalEntities) * 0.2);
        
        if (previewFeatures.length >= PREVIEW_CHUNK_SIZE) {
          break;
        }
      }

      // Calculate bounds from preview features with padding
      const bounds = this.calculateBounds(previewFeatures, 0.1); // 10% padding

      // Get all available layers
      const layers = this.parser.getLayers();

      return {
        layers,
        coordinateSystem: detectedSystem,
        bounds,
        preview: {
          type: 'FeatureCollection',
          features: previewFeatures
        },
        warnings,
        dxfData: this.rawDxfData
      };

    } catch (error) {
      throw new Error(`DXF analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async processChunk(entities: DxfEntity[], options: ProcessorOptions, startProgress: number, endProgress: number): Promise<Feature[]> {
    const features: Feature[] = [];
    const totalEntities = entities.length;

    for (let i = 0; i < totalEntities; i++) {
      const entity = entities[i];
      
      // Filter by layer and type if specified
      if (options.selectedLayers?.length && !options.selectedLayers.includes(entity.layer || '0')) {
        continue;
      }
      if (options.selectedTypes?.length && !options.selectedTypes.includes(entity.type)) {
        continue;
      }

      try {
        const feature = entityToGeoFeature(entity, {}, options.coordinateSystem || COORDINATE_SYSTEMS.SWISS_LV95);
        if (feature) {
          features.push(feature);
        }
      } catch (error) {
        this.emitWarning(`Failed to convert ${entity.type} entity: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      // Update progress
      const progress = startProgress + ((i / totalEntities) * (endProgress - startProgress));
      this.emitProgress(progress);
    }

    return features;
  }

  async process(file: File): Promise<ProcessorResult> {
    try {
      const content = await this.readFileContent(file);
      const dxf = await this.parseDxf(content);
      
      const statistics = this.createDefaultStats();
      const warnings: string[] = [];
      
      // Expand all block references
      const expandedEntities = this.parser.expandBlockReferences(dxf);
      
      // Process entities in chunks
      const chunks: DxfEntity[][] = [];
      for (let i = 0; i < expandedEntities.length; i += PROCESS_CHUNK_SIZE) {
        chunks.push(expandedEntities.slice(i, i + PROCESS_CHUNK_SIZE));
      }

      const features: Feature[] = [];
      for (let i = 0; i < chunks.length; i++) {
        const startProgress = 0.5 + (i / chunks.length) * 0.5;
        const endProgress = 0.5 + ((i + 1) / chunks.length) * 0.5;
        
        const chunkFeatures = await this.processChunk(
          chunks[i],
          this.options,
          startProgress,
          endProgress
        );
        
        features.push(...chunkFeatures);
        
        // Update statistics
        chunkFeatures.forEach(feature => {
          if (feature.properties?.entityType) {
            this.updateStats(statistics, feature.properties.entityType);
          }
        });
      }

      // Calculate final bounds with padding
      const bounds = this.calculateBounds(features, 0.1); // 10% padding

      statistics.layerCount = this.options.selectedLayers?.length || this.parser.getLayers().length;

      return {
        features: {
          type: 'FeatureCollection',
          features
        },
        bounds,
        layers: this.parser.getLayers(),
        coordinateSystem: this.options.coordinateSystem || COORDINATE_SYSTEMS.SWISS_LV95,
        statistics,
        warnings,
        dxfData: this.rawDxfData
      };

    } catch (error) {
      throw new Error(`DXF processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private calculateBounds(features: Feature[], padding: number = 0): ProcessorResult['bounds'] {
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

    if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
      return {
        minX: 0,
        minY: 0,
        maxX: 1,
        maxY: 1
      };
    }

    // Add padding
    const width = maxX - minX;
    const height = maxY - minY;
    const paddingX = width * padding;
    const paddingY = height * padding;

    return {
      minX: minX - paddingX,
      minY: minY - paddingY,
      maxX: maxX + paddingX,
      maxY: maxY + paddingY
    };
  }
}
