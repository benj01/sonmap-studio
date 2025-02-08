import { Feature, FeatureCollection } from 'geojson';
import { FeatureManager } from '../../core/feature-manager';
import { GeoFeature } from '../../../../types/geo';
import { PreviewCollections } from '../types/preview';
import { FeatureProcessor } from '../feature-processor';
import { LogManager } from '../../core/logging/log-manager';

export class PreviewFeatureManager {
  private readonly logger = LogManager.getInstance();
  private readonly featureManager: FeatureManager;
  private readonly featureProcessor: FeatureProcessor;
  private maxFeatures: number;
  private visibleLayers: string[];

  constructor(maxFeatures: number, visibleLayers: string[] = []) {
    this.maxFeatures = maxFeatures;
    this.visibleLayers = visibleLayers;
    this.featureProcessor = new FeatureProcessor();
    this.featureManager = new FeatureManager({
      chunkSize: Math.max(1, Math.min(100, Math.ceil(this.maxFeatures / 10))),
      maxMemoryMB: 512,
      monitorMemory: true,
      streamingMode: false
    });

    if (this.visibleLayers.length > 0) {
      this.featureManager.setVisibleLayers(this.visibleLayers);
    }
  }

  private sanitizeFeature(feature: GeoFeature) {
    if (!feature) return null;
    return {
      type: feature.geometry?.type,
      layer: feature.properties?.layer || 'shapes',
      hasCoordinates: feature.geometry && 'coordinates' in feature.geometry,
      propertiesCount: feature.properties ? Object.keys(feature.properties).length : 0,
      id: feature.id
    };
  }

  private countFeatureTypes(features: GeoFeature[]): Record<string, number> {
    return features.reduce((acc, feature) => {
      const type = feature.geometry?.type || 'unknown';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  public async setFeatures(features: GeoFeature[]): Promise<void> {
    if (process.env.NODE_ENV === 'development') {
      this.logger.debug('PreviewFeatureManager', 'Setting features', { 
        count: features.length,
        firstFeature: features[0] ? this.sanitizeFeature(features[0]) : null,
        types: this.countFeatureTypes(features)
      });
    }

    const processedFeatures = features.map(f => ({
      ...f,
      properties: {
        ...f.properties,
        layer: f.properties?.layer || 'shapes'
      }
    }));

    await this.featureManager.setFeatures({
      type: 'FeatureCollection',
      features: processedFeatures
    });
  }

  public async getVisibleFeatures(): Promise<GeoFeature[]> {
    if (process.env.NODE_ENV === 'development') {
      this.logger.debug('PreviewFeatureManager', 'Getting visible features');
    }
    return this.featureManager.getVisibleFeatures();
  }

  public setVisibleLayers(layers: string[]): void {
    if (process.env.NODE_ENV === 'development') {
      this.logger.debug('PreviewFeatureManager', 'Setting visible layers', {
        oldLayers: this.visibleLayers,
        newLayers: layers
      });
    }
    this.visibleLayers = layers;
    this.featureManager.setVisibleLayers(layers);
  }

  public getVisibleLayers(): string[] {
    return [...this.visibleLayers];
  }

  public async categorizeFeatures(features: GeoFeature[]): Promise<PreviewCollections> {
    if (process.env.NODE_ENV === 'development') {
      this.logger.debug('PreviewFeatureManager', 'Categorizing features', { 
        count: features.length,
        types: this.countFeatureTypes(features)
      });
    }

    return this.featureProcessor.categorizeFeatures(features);
  }

  public calculateBounds(collections: PreviewCollections) {
    return this.featureProcessor.calculateBounds(collections);
  }

  public dispose(): void {
    if (process.env.NODE_ENV === 'development') {
      this.logger.debug('PreviewFeatureManager', 'Disposing');
    }
    this.featureManager.dispose();
    this.visibleLayers = [];
  }
}
