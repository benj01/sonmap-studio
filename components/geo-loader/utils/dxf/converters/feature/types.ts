import { GeoFeature } from '../../../../../../types/geo';
import { DxfEntityBase } from '../geometry/types';

/**
 * Options for feature conversion
 */
export interface FeatureConversionOptions {
  // Layer information for styling
  layerInfo?: Record<string, any>;
  // Whether to include entity metadata in properties
  includeMetadata?: boolean;
  // Whether to include style properties
  includeStyles?: boolean;
}

/**
 * Interface for feature converters
 */
export interface FeatureConverter {
  /**
   * Convert a DXF entity to a GeoJSON feature
   */
  convert(entity: DxfEntityBase, options?: FeatureConversionOptions): GeoFeature | null;

  /**
   * Check if this converter can handle the given entity type
   */
  canHandle(entityType: string): boolean;
}

/**
 * Base class for feature converters
 */
export abstract class BaseFeatureConverter implements FeatureConverter {
  protected entityInfo(entity: DxfEntityBase) {
    return {
      type: entity.type,
      handle: entity.handle || 'unknown',
      layer: entity.layer || '0'
    };
  }

  protected extractCommonProperties(
    entity: DxfEntityBase,
    options?: FeatureConversionOptions
  ): Record<string, any> {
    const layer = options?.layerInfo?.[entity.layer || '0'];
    const properties: Record<string, any> = {
      id: entity.handle,
      type: entity.type,
      layer: entity.layer || '0'
    };

    // Include style properties if requested
    if (options?.includeStyles) {
      Object.assign(properties, {
        color: entity.color ?? layer?.color,
        colorRGB: entity.colorRGB ?? layer?.colorRGB,
        lineType: entity.lineType ?? layer?.lineType,
        lineWeight: entity.lineWeight ?? layer?.lineWeight,
        visible: entity.visible ?? layer?.visible
      });
    }

    return properties;
  }

  abstract convert(entity: DxfEntityBase, options?: FeatureConversionOptions): GeoFeature | null;
  abstract canHandle(entityType: string): boolean;
}

/**
 * Registry for feature converters
 */
export class FeatureConverterRegistry {
  private converters: FeatureConverter[] = [];

  register(converter: FeatureConverter): void {
    this.converters.push(converter);
  }

  findConverter(entityType: string): FeatureConverter | null {
    return this.converters.find(c => c.canHandle(entityType)) || null;
  }
}

// Create and export a singleton instance
export const featureConverterRegistry = new FeatureConverterRegistry();
