import { Geometry } from 'geojson';
import { BaseGeometryConverter } from './base';
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
    if (!this.validateCoordinates(entity.position, errorReporter, entityInfo, 'text position')) {
      return null;
    }

    // Validate text content
    if (!entity.text || entity.text.trim().length === 0) {
      errorReporter.addWarning(
        'Empty text content',
        'EMPTY_TEXT_CONTENT',
        {
          ...entityInfo,
          text: entity.text
        }
      );
      return null;
    }

    // Validate text height if present
    if ('height' in entity && !this.validateNumber(entity.height, errorReporter, entityInfo, 'text height', { nonZero: true })) {
      return null;
    }

    // Validate rotation if present
    if ('rotation' in entity && !this.validateNumber(entity.rotation, errorReporter, entityInfo, 'text rotation')) {
      return null;
    }

    // Validate width if present
    if ('width' in entity && !this.validateNumber(entity.width, errorReporter, entityInfo, 'text width', { nonZero: true })) {
      return null;
    }

    // For MText entities, validate additional properties
    if (entity.type === 'MTEXT') {
      // Validate attachment point if present
      if ('attachmentPoint' in entity && !this.validateNumber(entity.attachmentPoint, errorReporter, entityInfo, 'text attachment point')) {
        return null;
      }

      // Validate drawing direction if present
      if ('drawingDirection' in entity && !this.validateNumber(entity.drawingDirection, errorReporter, entityInfo, 'text drawing direction')) {
        return null;
      }

      // Validate line spacing style if present
      if ('lineSpacingStyle' in entity && !this.validateNumber(entity.lineSpacingStyle, errorReporter, entityInfo, 'text line spacing style')) {
        return null;
      }

      // Validate line spacing factor if present
      if ('lineSpacingFactor' in entity && !this.validateNumber(entity.lineSpacingFactor, errorReporter, entityInfo, 'text line spacing factor', { nonZero: true })) {
        return null;
      }
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
