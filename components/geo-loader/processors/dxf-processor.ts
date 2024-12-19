import { BaseProcessor, ProcessorOptions, AnalyzeResult, ProcessorResult } from './base-processor';
import { DxfData, DxfEntity, Vector3 } from '../utils/dxf/types';
import { DxfParser } from '../utils/dxf/parser';
import { DxfConverter } from '../utils/dxf/converter';
import { CoordinateTransformer, suggestCoordinateSystem } from '../utils/coordinate-utils';
import { COORDINATE_SYSTEMS, CoordinateSystem } from '../types/coordinates';
import { Feature, Geometry, GeometryCollection } from 'geojson';
import { ErrorReport, Severity } from '../utils/errors';
import proj4 from 'proj4';

const PREVIEW_CHUNK_SIZE = 1000;
const SAMPLE_RATE = 5;
const PROCESS_CHUNK_SIZE = 500;

// Progress phases
const PROGRESS = {
  PARSE: { START: 0, END: 0.3 },     // 0-30%
  ANALYZE: { START: 0.3, END: 0.4 },  // 30-40%
  CONVERT: { START: 0.4, END: 1.0 }   // 40-100%
} as const;

function hasCoordinates(geometry: Geometry): geometry is Exclude<Geometry, GeometryCollection> {
  return 'coordinates' in geometry;
}

export class DxfProcessor extends BaseProcessor {
  private parser: DxfParser;
  private converter: DxfConverter;
  private rawDxfData: DxfData | undefined = undefined;

  constructor(options: ProcessorOptions) {
    super(options);
    this.parser = new DxfParser(this.options.errorReporter);
    this.converter = new DxfConverter(this.options.errorReporter);
  }

  async canProcess(file: File): Promise<boolean> {
    return file.name.toLowerCase().endsWith('.dxf');
  }

  private async readFileContent(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => {
        this.reportError('FILE_READ_ERROR', 'Failed to read DXF file', {
          fileName: file.name,
          error: reader.error?.message
        });
        reject(new Error('Failed to read DXF file'));
      };
      reader.readAsText(file);
    });
  }

  private getEntityCoordinates(entity: DxfEntity): Vector3[] {
    switch (entity.type) {
      case 'POINT':
        return [entity.position];
      case 'LINE':
        return [entity.start, entity.end];
      case 'POLYLINE':
      case 'LWPOLYLINE':
        return entity.vertices;
      case 'CIRCLE':
        return [entity.center];
      default:
        return [];
    }
  }

  private detectCoordinateSystem(entities: DxfEntity[]): CoordinateSystem {
    // Sample coordinates from different entity types
    const sampleCoords: { x: number, y: number }[] = [];
    
    // Collect coordinates from entities
    for (let i = 0; i < Math.min(entities.length, 100); i++) {
      const coords = this.getEntityCoordinates(entities[i]);
      sampleCoords.push(...coords.map(coord => ({ x: coord.x, y: coord.y })));
      if (sampleCoords.length >= 100) break;
    }

    if (sampleCoords.length === 0) {
      this.reportWarning('NO_COORDINATES', 'No coordinates found for detection', { entityCount: entities.length });
      return COORDINATE_SYSTEMS.NONE;
    }

    // Use the suggestCoordinateSystem function from coordinate-utils
    const suggestedSystem = suggestCoordinateSystem(sampleCoords, this.options.errorReporter);

    // Test transformation if Swiss LV95 is detected
    if (suggestedSystem === COORDINATE_SYSTEMS.SWISS_LV95) {
      try {
        const transformer = new CoordinateTransformer(
          COORDINATE_SYSTEMS.SWISS_LV95,
          COORDINATE_SYSTEMS.WGS84,
          this.options.errorReporter,
          proj4
        );
        const testPoint = sampleCoords[0];
        transformer.transform(testPoint);
      } catch (error) {
        this.reportError('TRANSFORM_ERROR', 'Test transformation failed', {
          error: error instanceof Error ? error.message : 'Unknown error',
          suggestedSystem,
          testPoint: sampleCoords[0]
        });
      }
    }
    
    return suggestedSystem;
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
      const content = await this.readFileContent(file);
      
      // Parse DXF content with progress updates
      this.rawDxfData = await this.parser.parse(content, {
        onProgress: progress => {
          const scaledProgress = PROGRESS.PARSE.START + 
            (progress * (PROGRESS.PARSE.END - PROGRESS.PARSE.START));
          this.emitProgress(scaledProgress);
        }
      });

      // Expand block references for preview
      const expandedEntities = this.parser.expandBlockReferences(this.rawDxfData);
      
      // Detect coordinate system
      const detectedSystem = this.detectCoordinateSystem(expandedEntities);
      
      // Convert to GeoJSON features for preview with progress updates
      const previewFeatures: Feature[] = [];
      let processedCount = 0;
      const totalEntities = expandedEntities.length;
      
      for (const entity of expandedEntities) {
        if (processedCount % SAMPLE_RATE === 0) {
          const feature = this.converter.entityToGeoFeature(entity);
          if (feature && hasCoordinates(feature.geometry)) {
            previewFeatures.push(feature);
          }
        }
        processedCount++;
        
        // Update progress (30-40%)
        const progress = PROGRESS.ANALYZE.START + 
          (processedCount / totalEntities) * (PROGRESS.ANALYZE.END - PROGRESS.ANALYZE.START);
        this.emitProgress(progress);
        
        if (previewFeatures.length >= PREVIEW_CHUNK_SIZE) {
          break;
        }
      }

      // Get all available layers
      const layers = this.parser.getLayers();

      // Calculate bounds from preview features
      const bounds = this.getBounds(previewFeatures);

      // Get errors and warnings from the error reporter
      const reports = this.options.errorReporter.getReports();
      const errors = this.convertErrorReports(
        reports.filter(r => r.severity === Severity.ERROR)
      );
      const warnings = this.convertErrorReports(
        reports.filter(r => r.severity === Severity.WARNING)
      );

      return {
        layers,
        coordinateSystem: detectedSystem,
        bounds,
        preview: {
          type: 'FeatureCollection',
          features: previewFeatures
        },
        errors,
        warnings,
        dxfData: this.rawDxfData
      };

    } catch (error) {
      this.reportError('ANALYSIS_ERROR', 'DXF analysis failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
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

      const feature = this.converter.entityToGeoFeature(entity);
      if (feature) {
        features.push(feature);
      }

      // Update progress for this chunk
      const chunkProgress = startProgress + ((i / totalEntities) * (endProgress - startProgress));
      this.emitProgress(chunkProgress);
    }

    return features;
  }

  async process(file: File): Promise<ProcessorResult> {
    try {
      const content = await this.readFileContent(file);
      
      // Parse DXF content
      const dxf = await this.parser.parse(content, {
        onProgress: progress => {
          const scaledProgress = PROGRESS.PARSE.START + 
            (progress * (PROGRESS.PARSE.END - PROGRESS.PARSE.START));
          this.emitProgress(scaledProgress);
        }
      });
      
      // Expand all block references
      const expandedEntities = this.parser.expandBlockReferences(dxf);
      
      // Process entities in chunks
      const chunks: DxfEntity[][] = [];
      for (let i = 0; i < expandedEntities.length; i += PROCESS_CHUNK_SIZE) {
        chunks.push(expandedEntities.slice(i, i + PROCESS_CHUNK_SIZE));
      }

      const features: Feature[] = [];
      const featureTypes: Record<string, number> = {};

      for (let i = 0; i < chunks.length; i++) {
        const chunkStartProgress = PROGRESS.CONVERT.START + 
          (i / chunks.length) * (PROGRESS.CONVERT.END - PROGRESS.CONVERT.START);
        const chunkEndProgress = PROGRESS.CONVERT.START + 
          ((i + 1) / chunks.length) * (PROGRESS.CONVERT.END - PROGRESS.CONVERT.START);
        
        const chunkFeatures = await this.processChunk(
          chunks[i],
          this.options,
          chunkStartProgress,
          chunkEndProgress
        );
        
        features.push(...chunkFeatures);
        
        // Update feature type counts
        chunkFeatures.forEach(feature => {
          if (feature.properties?.type) {
            const type = feature.properties.type;
            featureTypes[type] = (featureTypes[type] || 0) + 1;
          }
        });
      }

      // Calculate bounds from features
      const bounds = this.getBounds(features);

      // Ensure we reach 100%
      this.emitProgress(1.0);

      return {
        features: {
          type: 'FeatureCollection',
          features
        },
        bounds,
        layers: this.parser.getLayers(),
        coordinateSystem: this.options.coordinateSystem || COORDINATE_SYSTEMS.NONE,
        statistics: {
          featureCount: features.length,
          layerCount: this.options.selectedLayers?.length || this.parser.getLayers().length,
          featureTypes
        }
      };

    } catch (error) {
      this.reportError('PROCESSING_ERROR', 'DXF processing failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  private getBounds(features: Feature[]): ProcessorResult['bounds'] {
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

    // Add 10% padding
    const width = maxX - minX;
    const height = maxY - minY;
    const paddingX = width * 0.1;
    const paddingY = height * 0.1;

    return {
      minX: minX - paddingX,
      minY: minY - paddingY,
      maxX: maxX + paddingX,
      maxY: maxY + paddingY
    };
  }
}
