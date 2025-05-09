import { Feature, LineString } from 'geojson';
import { dbLogger } from '@/utils/logging/dbLogger';
import { VectorLayerStyle } from '../context/SharedLayerContext';

const LOG_SOURCE = 'LineLayer';

export class LineLayer {
  private features: Array<{
    feature: Feature<LineString>;
    style: VectorLayerStyle;
  }> = [];

  public async addFeature(feature: Feature<LineString>) {
    const context = {
      source: LOG_SOURCE,
      featureId: feature.id || 'unknown',
      coordinates: {
        count: feature.geometry.coordinates.length,
        first: feature.geometry.coordinates[0],
        last: feature.geometry.coordinates[feature.geometry.coordinates.length - 1]
      },
      properties: feature.properties
    };

    await dbLogger.debug('addFeature.start', context);

    try {
      // Validate feature geometry
      if (!this.isValidLineFeature(feature)) {
        await dbLogger.warn('addFeature.invalidFeature', {
          ...context,
          geometryType: feature.geometry?.type,
          coordinateCount: feature.geometry?.coordinates?.length
        });
        return;
      }

      // Process feature styling
      const style = this.getFeatureStyle(feature);
      
      await dbLogger.debug('addFeature.processed', {
        ...context,
        style,
        isVisible: this.isFeatureVisible(feature)
      });

      // Add to layer
      this.features.push({
        feature,
        style
      });

      await this.updateLayerStats();
      await dbLogger.debug('addFeature.success', context);
    } catch (error) {
      await dbLogger.error('addFeature.error', {
        ...context,
        error
      });
      throw error; // Re-throw to allow caller to handle
    }
  }

  private isValidLineFeature(feature: Feature<LineString>): boolean {
    return (
      feature?.geometry?.type === 'LineString' &&
      Array.isArray(feature.geometry.coordinates) &&
      feature.geometry.coordinates.length >= 2 &&
      feature.geometry.coordinates.every(coord => 
        Array.isArray(coord) && coord.length >= 2
      )
    );
  }

  private async updateLayerStats() {
    const stats = {
      source: LOG_SOURCE,
      totalFeatures: this.features.length,
      visibleFeatures: this.features.filter(f => this.isFeatureVisible(f.feature)).length
    };
    
    await dbLogger.debug('updateLayerStats', stats);
  }

  private getFeatureStyle(feature: Feature<LineString>): VectorLayerStyle {
    // TODO: Implement custom styling based on feature properties
    // Parameter is kept for future implementation of property-based styling
    void feature; // Explicitly mark as intentionally unused
    
    // Default style for line features
    return {
      paint: {
        'line-color': '#1E88E5',
        'line-width': 3
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round'
      }
    };
  }

  private isFeatureVisible(feature: Feature<LineString>): boolean {
    // TODO: Implement visibility rules based on feature properties
    // Parameter is kept for future implementation of property-based visibility
    void feature; // Explicitly mark as intentionally unused
    
    // For now, all features are visible by default
    return true;
  }
} 