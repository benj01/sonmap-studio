import { Feature, FeatureCollection } from 'geojson';
import { BaseProcessor } from '../../base/base-processor';
import { ProcessingOptions, ProcessingResult, ProcessorMetadata } from '../../base/interfaces';
import { readFileSync } from 'fs';
import { LogManager } from '../../../logging/log-manager';

interface ExtendedFeatureCollection extends FeatureCollection {
  crs?: {
    type: string;
    properties: Record<string, any>;
  };
}

export class GeoJSONProcessor extends BaseProcessor {
  private static readonly SUPPORTED_EXTENSIONS = ['.geojson', '.json'];
  private static readonly DEFAULT_SAMPLE_SIZE = 1000;
  protected readonly logger = LogManager.getInstance();

  /**
   * Check if this processor can handle the given file
   */
  public canProcess(fileName: string, mimeType?: string): boolean {
    return GeoJSONProcessor.SUPPORTED_EXTENSIONS.some(ext => 
      fileName.toLowerCase().endsWith(ext)
    ) || mimeType === 'application/geo+json';
  }

  /**
   * Analyze the file and extract metadata without full processing
   */
  public async analyze(filePath: string): Promise<ProcessorMetadata> {
    try {
      this.updateProgress({ phase: 'analyzing', processed: 0, total: 1 });
      
      const content = readFileSync(filePath, 'utf-8');
      const geojson = JSON.parse(content) as ExtendedFeatureCollection;
      const stats = await this.analyzeFeatures(geojson.features);
      
      this.updateProgress({ phase: 'analyzing', processed: 1, total: 1 });
      
      return {
        fileName: filePath.split('/').pop() || '',
        fileSize: content.length,
        format: 'GeoJSON',
        crs: geojson.crs ? JSON.stringify(geojson.crs) : undefined,
        layerCount: 1,
        featureCount: geojson.features.length,
        attributeSchema: stats.schema,
        bounds: stats.bounds
      };
    } catch (error) {
      this.logger.error('Error analyzing GeoJSON:', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * Sample a subset of features for preview
   */
  public async sample(filePath: string, options?: ProcessingOptions): Promise<ProcessingResult> {
    try {
      this.updateProgress({ phase: 'sampling', processed: 0, total: 3 });

      // Step 1: Analyze file
      const metadata = await this.analyze(filePath);
      this.updateProgress({ phase: 'sampling', processed: 1, total: 3 });

      // Step 2: Read and sample features
      const content = readFileSync(filePath, 'utf-8');
      const geojson = JSON.parse(content) as ExtendedFeatureCollection;
      const sampleSize = options?.sampleSize || GeoJSONProcessor.DEFAULT_SAMPLE_SIZE;
      const features = this.sampleFeatures(geojson.features, sampleSize);
      this.updateProgress({ phase: 'sampling', processed: 2, total: 3 });

      // Step 3: Detect and transform coordinate system
      const detectionResult = await this.detectCoordinateSystem(features, {
        crs: geojson.crs
      });

      let transformedFeatures = features;
      if (options?.targetSystem && detectionResult.system !== options.targetSystem) {
        transformedFeatures = await this.transformFeatures(
          features,
          detectionResult.system,
          options.targetSystem
        );
      }

      this.updateProgress({ phase: 'sampling', processed: 3, total: 3 });

      return {
        features: transformedFeatures,
        metadata,
        coordinateSystem: detectionResult,
        layerStructure: [{
          name: 'features',
          featureCount: metadata.featureCount || 0,
          geometryType: 'Mixed',
          attributes: Object.entries(metadata.attributeSchema || {}).map(([name, type]) => ({
            name,
            type
          })),
          bounds: metadata.bounds
        }],
        progress: { phase: 'complete', processed: 3, total: 3 }
      };
    } catch (error) {
      this.logger.error('Error sampling GeoJSON:', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * Process the entire file
   */
  public async process(filePath: string, options?: ProcessingOptions): Promise<ProcessingResult> {
    try {
      // For small files, we can process everything at once
      const metadata = await this.analyze(filePath);
      if (!metadata.featureCount || metadata.featureCount <= GeoJSONProcessor.DEFAULT_SAMPLE_SIZE) {
        return this.sample(filePath, options);
      }

      // For large files, use streaming
      const features: Feature[] = [];
      const stream = this.createFeatureStream(filePath, options);
      
      this.updateProgress({ 
        phase: 'processing',
        processed: 0,
        total: metadata.featureCount
      });

      let count = 0;
      for await (const feature of stream) {
        features.push(feature);
        count++;
        
        if (count % 1000 === 0) {
          this.updateProgress({
            phase: 'processing',
            processed: count,
            total: metadata.featureCount
          });
        }

        this.checkCancelled();
      }

      const detectionResult = await this.detectCoordinateSystem(features, {
        crs: metadata.crs
      });

      let transformedFeatures = features;
      if (options?.targetSystem && detectionResult.system !== options.targetSystem) {
        transformedFeatures = await this.transformFeatures(
          features,
          detectionResult.system,
          options.targetSystem
        );
      }

      return {
        features: transformedFeatures,
        metadata,
        coordinateSystem: detectionResult,
        layerStructure: [{
          name: 'features',
          featureCount: metadata.featureCount,
          geometryType: 'Mixed',
          attributes: Object.entries(metadata.attributeSchema || {}).map(([name, type]) => ({
            name,
            type
          })),
          bounds: metadata.bounds
        }],
        progress: { 
          phase: 'complete',
          processed: metadata.featureCount,
          total: metadata.featureCount
        }
      };
    } catch (error) {
      this.logger.error('Error processing GeoJSON:', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * Get a stream of features for large files
   */
  public async *createFeatureStream(
    filePath: string,
    options?: ProcessingOptions
  ): AsyncIterableIterator<Feature> {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const geojson = JSON.parse(content) as ExtendedFeatureCollection;
      
      // If no coordinate system transformation is needed, return raw features
      if (!options?.targetSystem) {
        yield* geojson.features;
        return;
      }

      // Otherwise, detect coordinate system and transform features
      const detectionResult = await this.detectCoordinateSystem(
        geojson.features.slice(0, 100),
        { crs: geojson.crs }
      );

      // If source and target systems are the same, return raw features
      if (detectionResult.system === options.targetSystem) {
        yield* geojson.features;
        return;
      }

      // Transform features one by one
      for (const feature of geojson.features) {
        const transformed = await this.transformFeatures(
          [feature],
          detectionResult.system,
          options.targetSystem
        );
        yield transformed[0];
      }
    } catch (error) {
      this.logger.error('Error creating feature stream:', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * Analyze features to extract schema and bounds
   */
  private async analyzeFeatures(features: Feature[]): Promise<{
    schema: Record<string, string>;
    bounds: ProcessorMetadata['bounds'];
  }> {
    const schema: Record<string, string> = {};
    const bounds = this.calculateBounds(features);

    // Sample up to 100 features to detect schema
    const sampleFeatures = this.sampleFeatures(features, 100);
    for (const feature of sampleFeatures) {
      if (!feature.properties) continue;

      for (const [key, value] of Object.entries(feature.properties)) {
        if (!(key in schema)) {
          schema[key] = this.detectPropertyType(value);
        }
      }
    }

    return { schema, bounds };
  }

  /**
   * Sample features from array
   */
  private sampleFeatures(features: Feature[], sampleSize: number): Feature[] {
    if (features.length <= sampleSize) {
      return features;
    }

    const step = Math.max(1, Math.floor(features.length / sampleSize));
    return features.filter((_, index) => index % step === 0).slice(0, sampleSize);
  }

  /**
   * Detect property type from value
   */
  private detectPropertyType(value: any): string {
    if (value === null || value === undefined) return 'string';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    if (value instanceof Date) return 'date';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'object') return 'object';
    return 'string';
  }

  /**
   * Process a group of related files
   */
  protected async processFileGroup(files: string[]): Promise<ProcessingResult> {
    // GeoJSON files are self-contained, so we just process the first file
    if (files.length === 0) {
      throw new Error('No files provided');
    }
    return this.process(files[0]);
  }
} 