import { GeoFeature } from '../../../../../../types/geo';
import { DxfEntityBase } from '../geometry/types';
import { geometryConverterRegistry } from '../geometry';
import { ErrorReporter } from '../../../errors';
import { createFeature } from '../../../geometry-utils';
import { FeatureConversionOptions } from './types';

/**
 * Main converter for DXF entities to GeoJSON features
 */
export class DxfFeatureConverter {
  constructor(private errorReporter: ErrorReporter) {}

  /**
   * Convert a DXF entity to a GeoJSON feature
   */
  convertEntity(
    entity: DxfEntityBase,
    options?: FeatureConversionOptions
  ): GeoFeature | null {
    const entityInfo = {
      type: entity.type,
      handle: entity.handle || 'unknown',
      layer: entity.layer || '0'
    };

    try {
      // Find a geometry converter for this entity type
      const geometryConverter = geometryConverterRegistry.findConverter(entity.type);
      if (!geometryConverter) {
        this.errorReporter.addWarning(
          `No geometry converter found for entity type: ${entity.type}`,
          'UNSUPPORTED_ENTITY_TYPE',
          entityInfo
        );
        return null;
      }

      // Convert the entity to a geometry
      const geometry = geometryConverter.convert(entity, this.errorReporter);
      if (!geometry) {
        return null; // Error already reported by the geometry converter
      }

      // Extract properties
      const properties = this.extractProperties(entity, options);

      // Create the GeoJSON feature
      return createFeature(geometry, properties);

    } catch (error: unknown) {
      this.errorReporter.addError(
        'Failed to convert entity to feature',
        'FEATURE_CONVERSION_ERROR',
        {
          ...entityInfo,
          error: error instanceof Error ? error.message : String(error)
        }
      );
      return null;
    }
  }

  /**
   * Convert multiple DXF entities to GeoJSON features
   */
  convertEntities(
    entities: DxfEntityBase[],
    options?: FeatureConversionOptions
  ): GeoFeature[] {
    const features: GeoFeature[] = [];
    let errorCount = 0;

    for (const entity of entities) {
      const feature = this.convertEntity(entity, options);
      if (feature) {
        features.push(feature);
      } else {
        errorCount++;
      }
    }

    if (errorCount > 0) {
      this.errorReporter.addWarning(
        `Failed to convert ${errorCount} entities`,
        'CONVERSION_FAILURES',
        {
          totalEntities: entities.length,
          failedEntities: errorCount,
          successfulEntities: features.length
        }
      );
    }

    return features;
  }

  private extractProperties(
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

    // Include metadata if requested
    if (options?.includeMetadata) {
      // Add any entity-specific metadata here
      // For example, text content for text entities, spline degree for splines, etc.
      if ('text' in entity) {
        properties.text = entity.text;
      }
      if ('degree' in entity) {
        properties.degree = entity.degree;
      }
    }

    return properties;
  }
}

// Create and export a factory function
export function createDxfFeatureConverter(errorReporter: ErrorReporter): DxfFeatureConverter {
  return new DxfFeatureConverter(errorReporter);
}
