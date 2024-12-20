import { Geometry } from 'geojson';
import { BaseGeometryConverter, geometryConverterRegistry } from './base';
import { ErrorReporter } from '../../../errors';
import { createPointGeometry } from '../../../geometry-utils';
import {
  DxfEntityBase,
  TextEntity,
  MTextEntity,
  isTextEntity,
  TextualEntity
} from './types';

/**
 * Converter for text entities (TEXT and MTEXT)
 */
export class TextGeometryConverter extends BaseGeometryConverter {
  canHandle(entityType: string): boolean {
    return ['TEXT', 'MTEXT'].includes(entityType);
  }

  convert(entity: DxfEntityBase, errorReporter: ErrorReporter): Geometry | null {
    const entityInfo = this.entityInfo(entity);

    if (!isTextEntity(entity)) {
      return null;
    }

    return this.convertText(entity, errorReporter, entityInfo);
  }

  private convertText(
    entity: TextualEntity,
    errorReporter: ErrorReporter,
    entityInfo: ReturnType<typeof this.entityInfo>
  ): Geometry | null {
    // Validate position coordinates
    if (!isFinite(entity.position.x) || !isFinite(entity.position.y)) {
      errorReporter.addWarning(
        'Invalid text position coordinates',
        'INVALID_TEXT_POSITION',
        {
          entityType: entityInfo.type,
          handle: entityInfo.handle,
          position: entity.position
        }
      );
      return null;
    }

    // Validate text content
    if (!entity.text || entity.text.trim().length === 0) {
      errorReporter.addWarning(
        'Empty text content',
        'EMPTY_TEXT_CONTENT',
        {
          entityType: entityInfo.type,
          handle: entityInfo.handle
        }
      );
      return null;
    }

    // For text entities, we create a point geometry at the text's position
    // The actual text content and styling will be handled by the feature properties
    return createPointGeometry(
      entity.position.x,
      entity.position.y,
      entity.position.z
    );
  }
}

// Register the converter
geometryConverterRegistry.register(new TextGeometryConverter());
