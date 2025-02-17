import { Feature } from 'geojson';
import { Layer } from './base/layer';
import { LogManager } from '../../core/logging/log-manager';

export class LineLayer extends Layer {
  private readonly logger = LogManager.getInstance();
  private readonly LOG_SOURCE = 'LineLayer';

  public addFeature(feature: Feature): void {
    this.logger.info(this.LOG_SOURCE, 'Adding feature to line layer', {
      featureType: feature.geometry?.type,
      coordinates: feature.geometry?.coordinates,
      properties: feature.properties
    });

    if (feature.geometry?.type !== 'LineString' && feature.geometry?.type !== 'MultiLineString') {
      this.logger.warn(this.LOG_SOURCE, 'Invalid geometry type for line layer', {
        type: feature.geometry?.type
      });
      return;
    }

    super.addFeature(feature);
    
    this.logger.info(this.LOG_SOURCE, 'Feature added successfully', {
      totalFeatures: this.features.length
    });
  }
} 