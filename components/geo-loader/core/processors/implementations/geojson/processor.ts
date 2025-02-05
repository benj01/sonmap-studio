import { Feature, FeatureCollection } from 'geojson';
import { FileProcessor, GeoFileUpload, ProcessorOptions, ProcessingResult } from '../../base/interfaces';
import { LogManager } from '../../../logging/log-manager';

/**
 * Processor for GeoJSON format
 */
export class GeoJSONProcessor implements FileProcessor {
  private readonly logger = LogManager.getInstance();
  private readonly LOG_SOURCE = 'GeoJSONProcessor';

  /**
   * Check if this processor can handle the given file
   */
  public canProcess(fileName: string, mimeType?: string): boolean {
    const isGeoJSON = mimeType === 'application/geo+json' ||
                     fileName.toLowerCase().endsWith('.geojson') ||
                     fileName.toLowerCase().endsWith('.json');

    this.logger.debug(this.LOG_SOURCE, 'Checking if processor can handle file', {
      fileName,
      mimeType,
      isGeoJSON
    });

    return isGeoJSON;
  }

  /**
   * Analyze file contents without full processing
   */
  public async analyze(upload: GeoFileUpload, options?: ProcessorOptions): Promise<ProcessingResult> {
    try {
      // Parse GeoJSON
      const text = new TextDecoder().decode(upload.mainFile.data);
      const geojson = JSON.parse(text) as FeatureCollection;

      if (!geojson.features) {
        throw new Error('Invalid GeoJSON: missing features array');
      }

      // Calculate bounds
      const bounds = this.calculateBounds(geojson.features);
      
      // Extract attribute schema from first 100 features
      const sampleFeatures = geojson.features.slice(0, 100);
      const attributeSchema = this.extractAttributeSchema(sampleFeatures);

      return {
        features: sampleFeatures,
        metadata: {
          fileName: upload.mainFile.name,
          fileSize: upload.mainFile.size,
          format: 'GeoJSON',
          crs: 'EPSG:4326', // GeoJSON is always WGS84
          layerCount: 1,
          featureCount: geojson.features.length,
          attributeSchema,
          bounds
        },
        layerStructure: [{
          name: 'features',
          featureCount: geojson.features.length,
          geometryType: this.getGeometryType(sampleFeatures),
          attributes: Object.entries(attributeSchema).map(([name, type]) => ({
            name,
            type,
            sample: this.getSampleValue(sampleFeatures, name)
          })),
          bounds
        }],
        warnings: []
      };
    } catch (error) {
      throw new Error(`Failed to analyze GeoJSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Sample a subset of features for preview
   */
  public async sample(upload: GeoFileUpload, options?: ProcessorOptions): Promise<ProcessingResult> {
    try {
      // First analyze the file
      const analysis = await this.analyze(upload, options);
      
      // Parse GeoJSON
      const text = new TextDecoder().decode(upload.mainFile.data);
      const geojson = JSON.parse(text) as FeatureCollection;

      // Select sample features
      const sampleSize = options?.sampleSize || 1000;
      const sampleFeatures = this.selectSampleFeatures(geojson.features, sampleSize);

      return {
        ...analysis,
        features: sampleFeatures
      };
    } catch (error) {
      throw new Error(`Failed to generate preview: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Process the entire file
   */
  public async process(upload: GeoFileUpload, options?: ProcessorOptions): Promise<ProcessingResult> {
    try {
      // First analyze the file
      const analysis = await this.analyze(upload, options);
      
      // Parse GeoJSON
      const text = new TextDecoder().decode(upload.mainFile.data);
      const geojson = JSON.parse(text) as FeatureCollection;

      // Process features in chunks
      const features: Feature[] = [];
      let processedCount = 0;

      for (let i = 0; i < geojson.features.length; i += 1000) {
        const chunk = geojson.features.slice(i, i + 1000);
        await this.processFeatureChunk(chunk);
        features.push(...chunk);
        processedCount += chunk.length;
      }

      return {
        ...analysis,
        features,
        metadata: {
          ...analysis.metadata,
          featureCount: processedCount
        }
      };
    } catch (error) {
      throw new Error(`Failed to process GeoJSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public async dispose(): Promise<void> {
    // Clean up any resources
  }

  // Helper methods

  private calculateBounds(features: Feature[]): { minX: number; minY: number; maxX: number; maxY: number } {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    features.forEach(feature => {
      if (!feature.geometry) return;

      // Extract coordinates based on geometry type
      let coordinates: number[][] = [];
      switch (feature.geometry.type) {
        case 'Point':
          coordinates = [feature.geometry.coordinates as number[]];
          break;
        case 'LineString':
          coordinates = feature.geometry.coordinates as number[][];
          break;
        case 'Polygon':
          coordinates = (feature.geometry.coordinates as number[][][])[0];
          break;
        // Add more geometry types as needed
      }

      // Update bounds
      coordinates.forEach(coord => {
        minX = Math.min(minX, coord[0]);
        minY = Math.min(minY, coord[1]);
        maxX = Math.max(maxX, coord[0]);
        maxY = Math.max(maxY, coord[1]);
      });
    });

    return { minX, minY, maxX, maxY };
  }

  private extractAttributeSchema(features: Feature[]): Record<string, string> {
    const schema: Record<string, string> = {};

    features.forEach(feature => {
      if (!feature.properties) return;

      Object.entries(feature.properties).forEach(([key, value]) => {
        if (!(key in schema)) {
          schema[key] = this.getPropertyType(value);
        }
      });
    });

    return schema;
  }

  private getPropertyType(value: any): string {
    if (value === null || value === undefined) return 'string';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    if (value instanceof Date) return 'date';
    return 'string';
  }

  private getSampleValue(features: Feature[], propertyName: string): any {
    for (const feature of features) {
      if (feature.properties && propertyName in feature.properties) {
        return feature.properties[propertyName];
      }
    }
    return null;
  }

  private getGeometryType(features: Feature[]): string {
    // Get the most common geometry type
    const types = new Map<string, number>();
    
    features.forEach(feature => {
      if (!feature.geometry) return;
      const type = feature.geometry.type;
      types.set(type, (types.get(type) || 0) + 1);
    });

    let maxCount = 0;
    let maxType = 'Unknown';
    
    types.forEach((count, type) => {
      if (count > maxCount) {
        maxCount = count;
        maxType = type;
      }
    });

    return maxType;
  }

  private selectSampleFeatures(features: Feature[], sampleSize: number): Feature[] {
    if (features.length <= sampleSize) {
      return features;
    }

    // Simple random sampling
    const sampledFeatures: Feature[] = [];
    const step = Math.max(1, Math.floor(features.length / sampleSize));
    
    for (let i = 0; i < features.length && sampledFeatures.length < sampleSize; i += step) {
      sampledFeatures.push(features[i]);
    }

    return sampledFeatures;
  }

  private async processFeatureChunk(features: Feature[]): Promise<void> {
    // TODO: Implement chunk processing
    // - Validate geometries
    // - Transform coordinates if needed
    // - Apply any filters
    // - Prepare for database import
  }
} 