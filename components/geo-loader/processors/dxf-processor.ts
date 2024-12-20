import { BaseProcessor, ProcessorOptions, AnalyzeResult, ProcessorResult } from './base-processor';
import { 
  DxfData, 
  DxfEntity, 
  Vector3, 
  isDxfPointEntity, 
  isDxfLineEntity, 
  isDxfPolylineEntity, 
  isDxfCircleEntity 
} from '../utils/dxf/types';
import { createDxfParser } from '../utils/dxf/core-parser';
import createDxfAnalyzer from '../utils/dxf/analyzer';
import { DxfErrorReporter } from '../utils/dxf/error-collector';
import { DxfConverter } from '../utils/dxf/converter';
import { CoordinateTransformer, suggestCoordinateSystem } from '../utils/coordinate-utils';
import { COORDINATE_SYSTEMS, CoordinateSystem } from '../types/coordinates';
import { Feature, Geometry, GeometryCollection } from 'geojson';
import { entityToGeoFeature } from '../utils/dxf/geo-converter';
import { 
  ParseError, 
  ValidationError, 
  CoordinateTransformationError 
} from '../utils/errors';

const PREVIEW_CHUNK_SIZE = 1000;
const SAMPLE_RATE = 5;
const PROCESS_CHUNK_SIZE = 500;

// Progress phases
const PROGRESS = {
  PARSE: { START: 0, END: 0.3 },     // 0-30%
  ANALYZE: { START: 0.3, END: 0.4 },  // 30-40%
  CONVERT: { START: 0.4, END: 1.0 }   // 40-100%
} as const;

/**
 * Type guard for geometries with coordinates
 */
function hasCoordinates(geometry: Geometry): geometry is Exclude<Geometry, GeometryCollection> {
  return 'coordinates' in geometry;
}

/**
 * Processor for DXF (Drawing Exchange Format) files
 */
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
    try {
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Failed to read DXF file'));
        reader.readAsText(file);
      });
    } catch (error) {
      throw new ParseError(
        `Failed to read DXF file: ${error instanceof Error ? error.message : String(error)}`,
        'dxf',
        file.name,
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  private async parseDxf(content: string): Promise<DxfData> {
    try {
      const dxfData = await this.parser.parse(content, {
        validate: true,
        onProgress: progress => {
          const scaledProgress = PROGRESS.PARSE.START + 
            (progress * (PROGRESS.PARSE.END - PROGRESS.PARSE.START));
          this.emitProgress(scaledProgress);
        }
      });
      this.rawDxfData = dxfData;
      return dxfData;
    } catch (error) {
      throw new ParseError(
        `DXF parsing failed: ${error instanceof Error ? error.message : String(error)}`,
        'dxf',
        'parse',
        { error: error instanceof Error ? error.message : String(error) }
      );
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
    const sampleCoords: { x: number, y: number }[] = [];
    
    // Collect coordinates from entities
    for (let i = 0; i < Math.min(entities.length, 100); i++) {
      const coords = this.getEntityCoordinates(entities[i]);
      sampleCoords.push(...coords.map(coord => ({ x: coord.x, y: coord.y })));
      if (sampleCoords.length >= 100) break;
    }

    if (sampleCoords.length === 0) {
      this.errorReporter.addWarning(
        'No coordinates found for detection',
        'DXF_NO_COORDINATES',
        { entityCount: entities.length }
      );
      return COORDINATE_SYSTEMS.NONE;
    }

    // Log sample coordinates for debugging
    this.errorReporter.addInfo(
      'Sample coordinates for detection',
      'DXF_COORDINATE_SAMPLES',
      { samples: sampleCoords.slice(0, 2) }
    );

    // Use the suggestCoordinateSystem function from coordinate-utils
    const suggestedSystem = suggestCoordinateSystem(sampleCoords);
    this.errorReporter.addInfo(
      'Detected coordinate system',
      'DXF_COORDINATE_SYSTEM',
      { system: suggestedSystem }
    );

    // Test transformation if Swiss LV95
    if (suggestedSystem === COORDINATE_SYSTEMS.SWISS_LV95) {
      try {
        const transformer = new CoordinateTransformer(
          COORDINATE_SYSTEMS.SWISS_LV95,
          COORDINATE_SYSTEMS.WGS84,
          this.errorReporter
        );
        const testPoint = sampleCoords[0];
        const transformed = transformer.transform(testPoint);
        this.errorReporter.addInfo(
          'Test transformation successful',
          'DXF_TRANSFORM_TEST',
          { input: testPoint, output: transformed }
        );
      } catch (error) {
        this.errorReporter.addWarning(
          'Test transformation failed',
          'DXF_TRANSFORM_TEST_FAILED',
          { error: error instanceof Error ? error.message : String(error) }
        );
      }
    }
    
    return suggestedSystem;
  }

  async analyze(file: File): Promise<AnalyzeResult> {
    try {
      const content = await this.readFileContent(file);
      const dxf = await this.parseDxf(content);

      if (!dxf || !Array.isArray(dxf.entities)) {
        throw new ValidationError(
          'Invalid DXF file structure',
          'dxf_structure',
          undefined,
          { dxf }
        );
      }

      // Run comprehensive analysis
      const analysisResult = await this.analyzer.analyze(dxf);
      
      // Process analysis messages
      const messages = analysisResult.errorReporter.getMessages();
      
      // Handle warnings and non-critical errors
      messages.forEach(message => {
        if (!message.details?.isCritical) {
          this.errorReporter.addWarning(
            message.message,
            'DXF_ANALYSIS_WARNING',
            { 
              type: message.details?.type,
              entity: message.details?.handle ? {
                type: message.details.entityType,
                handle: message.details.handle,
                layer: message.details.layer
              } : undefined
            }
          );
        }
      });

      // Handle critical errors
      const criticalErrors = messages.filter(m => m.details?.isCritical);
      if (criticalErrors.length > 0) {
        throw new ValidationError(
          'Critical errors found in DXF file',
          'dxf_critical_errors',
          undefined,
          { errors: criticalErrors.map(e => ({ 
            message: e.message,
            type: e.details?.type
          }))}
        );
      }

      // Check if analysis was successful
      if (!analysisResult.isValid) {
        throw new ValidationError(
          'DXF analysis failed',
          'dxf_analysis_failed',
          undefined,
          { stats: analysisResult.stats }
        );
      }

      // Expand block references for preview
      const expandedEntities = this.parser.expandBlockReferences(dxf);
      
      // Detect coordinate system
      const detectedSystem = this.detectCoordinateSystem(expandedEntities);
      
      // Create transformer if needed
      let transformer: CoordinateTransformer | undefined;
      if (detectedSystem !== COORDINATE_SYSTEMS.NONE && detectedSystem !== COORDINATE_SYSTEMS.WGS84) {
        try {
          transformer = new CoordinateTransformer(
            detectedSystem,
            COORDINATE_SYSTEMS.WGS84,
            this.errorReporter
          );
        } catch (error) {
          this.errorReporter.addWarning(
            'Failed to create transformer',
            'DXF_TRANSFORMER_CREATION_FAILED',
            { 
              fromSystem: detectedSystem,
              toSystem: COORDINATE_SYSTEMS.WGS84,
              error: error instanceof Error ? error.message : String(error)
            }
          );
        }
      }
      
      // Convert to GeoJSON features for preview with progress updates
      const previewFeatures: Feature[] = [];
      let processedCount = 0;
      const totalEntities = expandedEntities.length;
      
      for (const entity of expandedEntities) {
        if (processedCount % SAMPLE_RATE === 0) {
          try {
            const feature = entityToGeoFeature(entity, {}, detectedSystem);
            if (feature && hasCoordinates(feature.geometry)) {
              previewFeatures.push(feature);
            }
          } catch (error) {
            this.errorReporter.addWarning(
              'Failed to convert entity to feature',
              'DXF_PREVIEW_CONVERSION_FAILED',
              {
                entityType: entity.type,
                layer: entity.layer,
                error: error instanceof Error ? error.message : String(error)
              }
            );
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
        dxfData: this.rawDxfData
      };

    } catch (error) {
      if (error instanceof ValidationError || error instanceof ParseError) {
        throw error;
      }
      throw new ParseError(
        `DXF analysis failed: ${error instanceof Error ? error.message : String(error)}`,
        'dxf',
        'analyze',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  private async processChunk(
    entities: DxfEntity[],
    options: ProcessorOptions,
    startProgress: number,
    endProgress: number
  ): Promise<Feature[]> {
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
        const feature = entityToGeoFeature(
          entity,
          {},
          options.coordinateSystem || COORDINATE_SYSTEMS.NONE
        );
        if (feature) {
          features.push(feature);
        }
      } catch (error) {
        this.errorReporter.addWarning(
          `Failed to convert ${entity.type} entity`,
          'DXF_ENTITY_CONVERSION_FAILED',
          {
            entityType: entity.type,
            layer: entity.layer,
            error: error instanceof Error ? error.message : String(error)
          }
        );
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
      const dxf = await this.parseDxf(content);
      
      const statistics = this.createDefaultStats();
      
      // Expand all block references
      const expandedEntities = this.parser.expandBlockReferences(dxf);
      
      // Process entities in chunks
      const chunks: DxfEntity[][] = [];
      for (let i = 0; i < expandedEntities.length; i += PROCESS_CHUNK_SIZE) {
        chunks.push(expandedEntities.slice(i, i + PROCESS_CHUNK_SIZE));
      }

      const features: Feature[] = [];
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
        
        // Update statistics
        chunkFeatures.forEach(feature => {
          if (feature.properties?.entityType) {
            this.updateStats(statistics, feature.properties.entityType as string);
          }
        });
      }

      // Calculate final bounds with padding
      const bounds = this.calculateBounds(features, 0.1); // 10% padding

      statistics.layerCount = this.options.selectedLayers?.length || this.parser.getLayers().length;

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
        statistics,
        dxfData: this.rawDxfData
      };

    } catch (error) {
      if (error instanceof ValidationError || error instanceof ParseError) {
        throw error;
      }
      throw new ParseError(
        `DXF processing failed: ${error instanceof Error ? error.message : String(error)}`,
        'dxf',
        'process',
        { error: error instanceof Error ? error.message : String(error) }
      );
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
      this.errorReporter.addWarning(
        'Invalid bounds, using default',
        'DXF_INVALID_BOUNDS',
        { minX, minY, maxX, maxY }
      );
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
