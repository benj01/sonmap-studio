import { Feature, FeatureCollection } from 'geojson';
import { FeatureManager } from '../../core/feature-manager';
import { GeoFeature } from '../../../../types/geo';
import { PreviewCollections, SamplingStrategy } from '../types/preview';
import { FeatureProcessor } from '../feature-processor';
import { Bounds } from '../../core/feature-manager/bounds';

export class PreviewFeatureManager {
  private static readonly MEMORY_LIMIT_MB = 512;
  private static readonly STREAM_THRESHOLD = 10000;

  private featureManager: FeatureManager;
  private featureProcessor: FeatureProcessor;
  private maxFeatures: number;
  private visibleLayers: string[];

  constructor(maxFeatures: number, visibleLayers: string[] = []) {
    this.maxFeatures = maxFeatures;
    this.visibleLayers = visibleLayers;
    this.featureProcessor = new FeatureProcessor();
    
    // Initialize feature manager in constructor to satisfy TypeScript
    const useStreaming = this.maxFeatures > PreviewFeatureManager.STREAM_THRESHOLD;
    this.featureManager = new FeatureManager({
      chunkSize: Math.ceil(this.maxFeatures / 10),
      maxMemoryMB: PreviewFeatureManager.MEMORY_LIMIT_MB,
      monitorMemory: true,
      streamingMode: useStreaming
    });

    if (this.visibleLayers.length > 0) {
      this.featureManager.setVisibleLayers(this.visibleLayers);
    }
  }

  public async setFeatures(features: Feature[] | FeatureCollection): Promise<void> {
    const collection: FeatureCollection = Array.isArray(features) 
      ? { type: 'FeatureCollection', features }
      : features;

    console.debug('[PreviewFeatureManager] Setting features:', {
      count: collection.features.length,
      useStreaming: collection.features.length > PreviewFeatureManager.STREAM_THRESHOLD,
      sampleFeature: collection.features[0]
    });

    // Ensure all features have layer: 'shapes' and handle coordinate systems
    const processedFeatures = collection.features.map(feature => {
      // Keep original geometry if it exists
      const originalGeometry = feature.properties?._originalGeometry || feature.geometry;
      
      // Use transformed coordinates if they exist, otherwise use original
      const geometry = feature.properties?._transformedCoordinates 
        ? feature.geometry 
        : originalGeometry;

      return {
        ...feature,
        geometry,
        properties: {
          ...feature.properties,
          layer: 'shapes',
          _originalGeometry: originalGeometry,
          _transformedCoordinates: feature.properties?._transformedCoordinates || false,
          _fromSystem: feature.properties?._fromSystem || feature.properties?.originalSystem || 'EPSG:2056',
          _toSystem: feature.properties?._toSystem || 'EPSG:4326'
        }
      };
    });

    await this.featureManager.setFeatures({
      type: 'FeatureCollection',
      features: processedFeatures
    });

    console.debug('[PreviewFeatureManager] Features processed:', {
      originalCount: collection.features.length,
      processedCount: processedFeatures.length,
      sampleProcessed: processedFeatures[0]
    });
  }

  public async getVisibleFeatures(): Promise<GeoFeature[]> {
    return await this.featureManager.getVisibleFeatures();
  }

  public async getFeaturesByTypeAndLayer(type: string, layer: string): Promise<GeoFeature[]> {
    const features: GeoFeature[] = [];
    for await (const feature of this.featureManager.getFeatures()) {
      if (!feature.geometry || !feature.properties) continue;
      
      const featureLayer = feature.properties.layer || 'shapes';
      if (feature.geometry.type === type && featureLayer === layer) {
        features.push(feature);
      }
    }
    return features;
  }

  public async hasVisibleFeatures(): Promise<boolean> {
    const features = await this.getVisibleFeatures();
    return features.length > 0;
  }

  public setVisibleLayers(layers: string[]): void {
    console.debug('[PreviewFeatureManager] Updating visible layers:', {
      old: this.visibleLayers,
      new: layers
    });
    
    this.visibleLayers = layers;
    this.featureManager.setVisibleLayers(layers);
  }

  public getVisibleLayers(): string[] {
    return [...this.visibleLayers];
  }

  public async categorizeFeatures(features: GeoFeature[]): Promise<PreviewCollections> {
    return this.featureProcessor.categorizeFeatures(features);
  }

  public calculateBounds(collections: PreviewCollections): Bounds {
    return this.featureProcessor.calculateBounds(collections);
  }

  public createSamplingStrategy(smartSampling: boolean): SamplingStrategy {
    return this.featureProcessor.createSamplingStrategy(
      this.maxFeatures,
      smartSampling
    );
  }

  public dispose(): void {
    console.debug('[PreviewFeatureManager] Disposing feature manager');
    
    if (this.featureManager) {
      this.featureManager.dispose();
    }

    this.visibleLayers = [];
  }
}
