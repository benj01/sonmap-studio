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
      // Validate entity if requested
      if (options?.validateEntities) {
        if (!this.validateEntity(entity)) {
          if (options?.skipInvalidEntities) {
            this.errorReporter.addWarning(
              'Skipping invalid entity',
              'INVALID_ENTITY_SKIPPED',
              entityInfo
            );
            return null;
          } else {
            throw new Error('Entity validation failed');
          }
        }
      }

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
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (options?.skipInvalidEntities) {
        this.errorReporter.addWarning(
          `Skipping entity due to error: ${errorMessage}`,
          'ENTITY_CONVERSION_SKIPPED',
          {
            ...entityInfo,
            error: errorMessage
          }
        );
        return null;
      }

      this.errorReporter.addError(
        'Failed to convert entity to feature',
        'FEATURE_CONVERSION_ERROR',
        {
          ...entityInfo,
          error: errorMessage
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
    let skipCount = 0;

    for (const entity of entities) {
      const feature = this.convertEntity(entity, options);
      if (feature) {
        features.push(feature);
      } else {
        if (options?.skipInvalidEntities) {
          skipCount++;
        } else {
          errorCount++;
        }
      }
    }

    if (errorCount > 0 || skipCount > 0) {
      this.errorReporter.addWarning(
        `Conversion results: ${errorCount} errors, ${skipCount} skipped`,
        'CONVERSION_RESULTS',
        {
          totalEntities: entities.length,
          failedEntities: errorCount,
          skippedEntities: skipCount,
          successfulEntities: features.length,
          successRate: `${((features.length / entities.length) * 100).toFixed(1)}%`
        }
      );
    }

    return features;
  }

  private validateEntity(entity: DxfEntityBase): boolean {
    // Basic validation checks
    if (!entity.type) {
      return false;
    }

    // Validate required properties based on entity type
    switch (entity.type) {
      case 'CIRCLE':
        return this.validateCircleEntity(entity);
      case 'ARC':
        return this.validateArcEntity(entity);
      case 'ELLIPSE':
        return this.validateEllipseEntity(entity);
      case 'LINE':
        return this.validateLineEntity(entity);
      case 'POLYLINE':
      case 'LWPOLYLINE':
        return this.validatePolylineEntity(entity);
      case 'TEXT':
      case 'MTEXT':
        return this.validateTextEntity(entity);
      case 'SPLINE':
        return this.validateSplineEntity(entity);
      default:
        // For unknown types, consider them valid and let the converter handle specifics
        return true;
    }
  }

  private validateCircleEntity(entity: any): boolean {
    return (
      entity.center &&
      typeof entity.center.x === 'number' &&
      typeof entity.center.y === 'number' &&
      typeof entity.radius === 'number' &&
      entity.radius > 0
    );
  }

  private validateArcEntity(entity: any): boolean {
    return (
      entity.center &&
      typeof entity.center.x === 'number' &&
      typeof entity.center.y === 'number' &&
      typeof entity.radius === 'number' &&
      entity.radius > 0 &&
      typeof entity.startAngle === 'number' &&
      typeof entity.endAngle === 'number'
    );
  }

  private validateEllipseEntity(entity: any): boolean {
    return (
      entity.center &&
      typeof entity.center.x === 'number' &&
      typeof entity.center.y === 'number' &&
      entity.majorAxis &&
      typeof entity.majorAxis.x === 'number' &&
      typeof entity.majorAxis.y === 'number' &&
      typeof entity.minorAxisRatio === 'number' &&
      entity.minorAxisRatio > 0
    );
  }

  private validateLineEntity(entity: any): boolean {
    return (
      entity.start &&
      entity.end &&
      typeof entity.start.x === 'number' &&
      typeof entity.start.y === 'number' &&
      typeof entity.end.x === 'number' &&
      typeof entity.end.y === 'number'
    );
  }

  private validatePolylineEntity(entity: any): boolean {
    return (
      Array.isArray(entity.vertices) &&
      entity.vertices.length > 0 &&
      entity.vertices.every((v: any) =>
        typeof v.x === 'number' && typeof v.y === 'number'
      )
    );
  }

  private validateTextEntity(entity: any): boolean {
    return (
      typeof entity.text === 'string' &&
      entity.position &&
      typeof entity.position.x === 'number' &&
      typeof entity.position.y === 'number'
    );
  }

  private validateSplineEntity(entity: any): boolean {
    return (
      Array.isArray(entity.controlPoints) &&
      entity.controlPoints.length >= 2 &&
      entity.controlPoints.every((p: any) =>
        typeof p.x === 'number' && typeof p.y === 'number'
      ) &&
      typeof entity.degree === 'number' &&
      entity.degree >= 1
    );
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
      if ('text' in entity) {
        properties.text = entity.text;
      }
      if ('degree' in entity) {
        properties.degree = entity.degree;
      }
      if ('radius' in entity) {
        properties.radius = entity.radius;
      }
      if ('startAngle' in entity && 'endAngle' in entity) {
        properties.startAngle = entity.startAngle;
        properties.endAngle = entity.endAngle;
      }
      if ('closed' in entity) {
        properties.closed = entity.closed;
      }
    }

    return properties;
  }
}

// Create and export a factory function
export function createDxfFeatureConverter(errorReporter: ErrorReporter): DxfFeatureConverter {
  return new DxfFeatureConverter(errorReporter);
}
