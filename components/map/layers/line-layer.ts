import { Feature, LineString } from 'geojson';
import { LogManager } from '../../core/logging/log-manager';

const logger = LogManager.getInstance();
const LOG_SOURCE = 'LineLayer';

export class LineLayer {
  // ... existing code ...

  public addFeature(feature: Feature<LineString>) {
    logger.debug(LOG_SOURCE, 'Adding line feature', {
      featureId: feature.id || 'unknown',
      coordinates: {
        count: feature.geometry.coordinates.length,
        first: feature.geometry.coordinates[0],
        last: feature.geometry.coordinates[feature.geometry.coordinates.length - 1]
      },
      properties: feature.properties
    });

    try {
      // Validate feature geometry
      if (!this.isValidLineFeature(feature)) {
        logger.warn(LOG_SOURCE, 'Invalid line feature', {
          featureId: feature.id || 'unknown',
          geometryType: feature.geometry?.type,
          coordinateCount: feature.geometry?.coordinates?.length
        });
        return;
      }

      // Process feature styling
      const style = this.getFeatureStyle(feature);
      
      logger.debug(LOG_SOURCE, 'Line feature processed', {
        featureId: feature.id || 'unknown',
        style,
        isVisible: this.isFeatureVisible(feature)
      });

      // Add to layer
      this.features.push({
        feature,
        style
      });

      this.updateLayerStats();
    } catch (error) {
      logger.error(LOG_SOURCE, 'Error adding line feature', {
        error,
        featureId: feature.id || 'unknown'
      });
    }
  }

  private isValidLineFeature(feature: Feature): boolean {
    return (
      feature?.geometry?.type === 'LineString' &&
      Array.isArray(feature.geometry.coordinates) &&
      feature.geometry.coordinates.length >= 2 &&
      feature.geometry.coordinates.every(coord => 
        Array.isArray(coord) && coord.length >= 2
      )
    );
  }

  private updateLayerStats() {
    const stats = {
      totalFeatures: this.features.length,
      visibleFeatures: this.features.filter(f => this.isFeatureVisible(f.feature)).length
    };
    
    logger.debug(LOG_SOURCE, 'Layer stats updated', stats);
  }
  // ... existing code ...
} 