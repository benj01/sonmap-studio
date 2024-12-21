import { GeoFeature } from '../../../../types/geo';
import { DxfEntity, DxfEntityBase } from './types';
import { DxfValidator } from './validator';
import { ErrorReporter, GeometryError } from '../errors';
import { createDxfConverter } from './converters';

// Type for entity info used in error handling
interface EntityErrorInfo {
  type: string;
  handle: string;
}

// Helper function for handling errors
function handleError(
  error: unknown,
  errorReporter: ErrorReporter,
  entityInfo: EntityErrorInfo,
  context: string
): void {
  if (error instanceof GeometryError) {
    errorReporter.addError(error.message, error.code, error.details);
  } else {
    errorReporter.addError(
      `Failed to ${context}`,
      `${context.toUpperCase()}_ERROR`,
      {
        entityType: entityInfo.type,
        handle: entityInfo.handle,
        error: error instanceof Error ? error.message : String(error)
      }
    );
  }
}

/**
 * @deprecated Use createDxfConverter from './converters' instead
 */
export class DxfConverter {
  private validator: DxfValidator;
  private featureConverter;

  constructor(private errorReporter: ErrorReporter) {
    this.validator = new DxfValidator();
    this.featureConverter = createDxfConverter(errorReporter);
  }

  /**
   * @deprecated Use DxfFeatureConverter.convertEntity instead
   */
  entityToGeometry(entity: DxfEntity) {
    const entityInfo: EntityErrorInfo = {
      type: entity.type,
      handle: entity.handle || 'unknown'
    };

    try {
      // Use the new converter system
      return this.featureConverter.convertEntity(entity)?.geometry || null;
    } catch (error: unknown) {
      handleError(error, this.errorReporter, entityInfo, 'convert entity to geometry');
      return null;
    }
  }

  /**
   * @deprecated Use DxfFeatureConverter.convertEntity instead
   */
  entityToGeoFeature(entity: DxfEntity, layerInfo?: Record<string, any>): GeoFeature | null {
    const entityInfo: EntityErrorInfo = {
      type: entity.type,
      handle: entity.handle || 'unknown'
    };

    try {
      const validationError = this.validator.validateEntity(entity);
      if (validationError) {
        this.errorReporter.addWarning(
          `Validation error for entity ${entityInfo.handle}: ${validationError}`,
          'ENTITY_VALIDATION_ERROR',
          {
            entityType: entityInfo.type,
            handle: entityInfo.handle,
            validationError
          }
        );
        return null;
      }

      // Use the new converter system with the provided options
      return this.featureConverter.convertEntity(entity, {
        layerInfo,
        includeStyles: true,
        includeMetadata: true,
        validateEntities: true,
        skipInvalidEntities: true
      });
    } catch (error: unknown) {
      handleError(error, this.errorReporter, entityInfo, 'convert entity to feature');
      return null;
    }
  }

  /**
   * @deprecated Use extractProperties from feature converter instead
   */
  private extractEntityProperties(
    entity: DxfEntityBase,
    layerInfo?: Record<string, any>
  ): Record<string, any> {
    const layer = layerInfo?.[entity.layer || '0'];
    return {
      id: entity.handle,
      type: entity.type,
      layer: entity.layer || '0',
      color: entity.color ?? layer?.color,
      colorRGB: entity.colorRGB ?? layer?.colorRGB,
      lineType: entity.lineType ?? layer?.lineType,
      lineWeight: entity.lineWeight ?? layer?.lineWeight,
      elevation: entity.elevation,
      thickness: entity.thickness,
      visible: entity.visible ?? layer?.visible,
      extrusionDirection: entity.extrusionDirection
    };
  }
}
