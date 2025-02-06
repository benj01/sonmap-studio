import { Feature, FeatureCollection } from 'geojson';
import { FeatureManager } from '../../core/feature-manager';
import { GeoFeature } from '../../../../types/geo';
import { PreviewCollections, SamplingStrategy } from '../types/preview';
import { FeatureProcessor } from '../feature-processor';
import { Bounds } from '../../core/feature-manager/bounds';
import { LogManager } from '../../core/logging/log-manager';

export class PreviewFeatureManager {
  private static readonly MEMORY_LIMIT_MB = 512;
  private static readonly STREAM_THRESHOLD = 10000;

  private featureManager: FeatureManager;
  private featureProcessor: FeatureProcessor;
  private maxFeatures: number;
  private visibleLayers: string[];
  private readonly logger = LogManager.getInstance();

  constructor(maxFeatures: number, visibleLayers: string[] = []) {
    this.maxFeatures = maxFeatures;
    this.visibleLayers = visibleLayers;
    this.featureProcessor = new FeatureProcessor();
    
    // Initialize feature manager with appropriate settings for small feature sets
    const useStreaming = this.maxFeatures > PreviewFeatureManager.STREAM_THRESHOLD;
    this.featureManager = new FeatureManager({
      chunkSize: Math.max(1, Math.min(100, Math.ceil(this.maxFeatures / 10))), // Ensure minimum chunk size of 1
      maxMemoryMB: PreviewFeatureManager.MEMORY_LIMIT_MB,
      monitorMemory: true,
      streamingMode: false // Disable streaming for better handling of small feature sets
    });

    // Only set visible layers if they are explicitly specified
    if (this.visibleLayers.length > 0) {
      this.featureManager.setVisibleLayers(this.visibleLayers);
    }
  }

  public async setFeatures(features: GeoFeature[]): Promise<void> {
    this.logger.debug('PreviewFeatureManager', 'Setting features', {
      count: features.length,
      types: features.map(f => f.geometry?.type).filter(Boolean),
      layers: features.map(f => f.properties?.layer || 'shapes').filter(Boolean),
      visibleLayers: this.visibleLayers,
      firstFeature: features[0] ? {
        type: features[0].geometry?.type,
        layer: features[0].properties?.layer || 'shapes',
        hasCoordinates: features[0].geometry && 'coordinates' in features[0].geometry,
        coordinates: features[0].geometry?.type === 'LineString' ? features[0].geometry.coordinates : null,
        properties: features[0].properties
      } : null
    });

    // Ensure all features have a layer property set to 'shapes' if not specified
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

    // Log visible features after setting
    const visibleFeatures = await this.getVisibleFeatures();
    this.logger.debug('PreviewFeatureManager', 'Visible features after set', {
      count: visibleFeatures.length,
      types: visibleFeatures.map(f => f.geometry?.type).filter(Boolean),
      layers: visibleFeatures.map(f => f.properties?.layer || 'shapes').filter(Boolean),
      firstFeature: visibleFeatures[0] ? {
        type: visibleFeatures[0].geometry?.type,
        layer: visibleFeatures[0].properties?.layer || 'shapes',
        hasCoordinates: visibleFeatures[0].geometry && 'coordinates' in visibleFeatures[0].geometry,
        coordinates: visibleFeatures[0].geometry?.type === 'LineString' ? visibleFeatures[0].geometry.coordinates : null,
        properties: visibleFeatures[0].properties
      } : null
    });
  }

  public async getVisibleFeatures(): Promise<GeoFeature[]> {
    this.logger.debug('PreviewFeatureManager', 'Getting visible features', {
      visibleLayers: this.visibleLayers
    });
    const features = await this.featureManager.getVisibleFeatures();
    this.logger.debug('PreviewFeatureManager', 'Retrieved visible features', {
      count: features.length,
      types: features.map(f => f.geometry?.type).filter(Boolean),
      layers: features.map(f => f.properties?.layer || 'shapes').filter(Boolean),
      firstFeature: features[0] ? {
        type: features[0].geometry?.type,
        layer: features[0].properties?.layer || 'shapes',
        hasCoordinates: features[0].geometry && 'coordinates' in features[0].geometry,
        coordinates: features[0].geometry?.type === 'LineString' ? features[0].geometry.coordinates : null,
        properties: features[0].properties
      } : null
    });
    return features;
  }

  public async getFeaturesByTypeAndLayer(type: string, layer: string): Promise<GeoFeature[]> {
    this.logger.debug('PreviewFeatureManager', 'Getting features by type and layer', {
      type,
      layer,
      visibleLayers: this.visibleLayers
    });
    const features: GeoFeature[] = [];
    for await (const feature of this.featureManager.getFeatures()) {
      if (!feature.geometry || !feature.properties) continue;
      
      const featureLayer = feature.properties.layer || 'shapes';
      if (feature.geometry.type === type && featureLayer === layer) {
        features.push(feature);
      }
    }
    this.logger.debug('PreviewFeatureManager', 'Retrieved features by type and layer', {
      count: features.length,
      type,
      layer
    });
    return features;
  }

  public async hasVisibleFeatures(): Promise<boolean> {
    const features = await this.getVisibleFeatures();
    return features.length > 0;
  }

  public setVisibleLayers(layers: string[]): void {
    this.logger.debug('PreviewFeatureManager', 'Updating visible layers', {
      old: this.visibleLayers,
      new: layers
    });
    
    this.visibleLayers = layers;
    // Only set visible layers if they are explicitly specified
    if (layers.length > 0) {
      this.featureManager.setVisibleLayers(layers);
    } else {
      // If no layers are specified, show all layers
      this.featureManager.setVisibleLayers([]);
    }
  }

  public getVisibleLayers(): string[] {
    return [...this.visibleLayers];
  }

  public async categorizeFeatures(features: GeoFeature[]): Promise<PreviewCollections> {
    this.logger.debug('PreviewFeatureManager', 'Categorizing features', {
      count: features.length,
      types: features.map(f => f.geometry?.type).filter(Boolean),
      layers: features.map(f => f.properties?.layer || 'shapes').filter(Boolean),
      visibleLayers: this.visibleLayers
    });

    const result = await this.featureProcessor.categorizeFeatures(features);
    
    this.logger.debug('PreviewFeatureManager', 'Categorization result', {
      points: result.points.features.length,
      lines: result.lines.features.length,
      polygons: result.polygons.features.length,
      visibleLayers: this.visibleLayers
    });

    return result;
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
    this.logger.debug('PreviewFeatureManager', 'Disposing feature manager');
    
    if (this.featureManager) {
      this.featureManager.dispose();
    }

    this.visibleLayers = [];
  }
}
