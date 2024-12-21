import { Feature, Point } from 'geojson';
import { DxfEntity, TextAlignment, TextVerticalAlignment, Vector3 } from '../../types';
import { ValidationError } from '../../../../../errors/types';

/**
 * Handles conversion of TEXT and MTEXT entities to GeoJSON point features
 * with text styling properties for client-side rendering
 */
export class TextConverter {
  /**
   * Convert TEXT/MTEXT entity to GeoJSON feature
   */
  static convert(entity: DxfEntity): Feature {
    const { position, text, style } = this.extractTextData(entity);
    this.validateTextData(position, text);

    // Create point geometry at text position
    const geometry: Point = {
      type: 'Point',
      coordinates: [position.x, position.y, position.z ?? 0]
    };

    return {
      type: 'Feature',
      geometry,
      properties: {
        entityType: entity.type, // 'TEXT' or 'MTEXT'
        text,
        ...style,
        color: entity.attributes.color,
        layer: entity.attributes.layer
      }
    };
  }

  /**
   * Extract text data from entity
   */
  private static extractTextData(entity: DxfEntity): {
    position: Vector3;
    text: string;
    style: {
      height?: number;
      width?: number;
      rotation?: number;
      style?: string;
      alignment?: TextAlignment;
      verticalAlignment?: TextVerticalAlignment;
      isBackward?: boolean;
      isUpsideDown?: boolean;
      oblique?: number;
      isBox?: boolean;
      isMirrored?: boolean;
    };
  } {
    const data = entity.data;

    // Get position
    const position: Vector3 = {
      x: typeof data.x === 'number' ? data.x : 0,
      y: typeof data.y === 'number' ? data.y : 0,
      z: typeof data.z === 'number' ? data.z : 0
    };

    // Get text content
    let text = data.text || '';
    if (entity.type === 'MTEXT') {
      // Handle MTEXT formatting
      text = this.formatMText(text);
    }

    // Get text style properties
    const style = {
      height: data.height,
      width: data.width,
      rotation: data.angle,
      style: data.style,
      alignment: data.alignment,
      verticalAlignment: data.verticalAlignment,
      isBackward: data.isBackward,
      isUpsideDown: data.isUpsideDown,
      oblique: data.oblique,
      isBox: data.generation?.isBox,
      isMirrored: data.generation?.isMirrored
    };

    return { position, text, style };
  }

  /**
   * Validate text data
   */
  private static validateTextData(position: Vector3, text: string): void {
    // Validate position
    if (!this.isValidPoint(position)) {
      throw new ValidationError(
        'Invalid text position',
        'INVALID_TEXT_POSITION'
      );
    }

    // Validate text content
    if (!text || typeof text !== 'string') {
      throw new ValidationError(
        'Invalid or empty text content',
        'INVALID_TEXT_CONTENT'
      );
    }
  }

  /**
   * Format MTEXT content
   * Handles common MTEXT formatting codes:
   * - \\P = New paragraph
   * - {\\f...;} = Font change
   * - {\\H...;} = Text height
   * - {\\W...;} = Width factor
   * - {\\S...;} = Stacking
   * - {\\O...;} = Overstrike
   * - {\\U...;} = Underscore
   * - {\\L} = Start lower case
   * - {\\U} = Start upper case
   */
  private static formatMText(text: string): string {
    // Replace paragraph breaks
    text = text.replace(/\\P/g, '\n');

    // Remove font changes
    text = text.replace(/\{\\f[^}]*;\}/g, '');

    // Remove height changes
    text = text.replace(/\{\\H[^}]*;\}/g, '');

    // Remove width factor
    text = text.replace(/\{\\W[^}]*;\}/g, '');

    // Remove stacking
    text = text.replace(/\{\\S[^}]*;\}/g, '');

    // Remove overstrike
    text = text.replace(/\{\\O[^}]*;\}/g, '');

    // Remove underscore
    text = text.replace(/\{\\U[^}]*;\}/g, '');

    // Remove case changes
    text = text.replace(/\{\\[LU]\}/g, '');

    // Remove any remaining curly braces
    text = text.replace(/[{}]/g, '');

    // Trim whitespace
    return text.trim();
  }

  /**
   * Calculate text anchor point based on alignment
   * This helps clients position text correctly based on alignment settings
   */
  private static getTextAnchor(
    alignment?: TextAlignment,
    verticalAlignment?: TextVerticalAlignment
  ): string {
    let anchor = '';

    // Horizontal alignment
    switch (alignment) {
      case 'LEFT':
        anchor = 'start';
        break;
      case 'CENTER':
      case 'MIDDLE':
        anchor = 'middle';
        break;
      case 'RIGHT':
        anchor = 'end';
        break;
      case 'ALIGNED':
      case 'FIT':
        // These require special handling by the client
        anchor = 'middle';
        break;
      default:
        anchor = 'start';
    }

    // Vertical alignment
    switch (verticalAlignment) {
      case 'TOP':
        anchor += ' hanging';
        break;
      case 'MIDDLE':
        anchor += ' middle';
        break;
      case 'BOTTOM':
        anchor += ' alphabetic';
        break;
      case 'BASELINE':
      default:
        anchor += ' baseline';
    }

    return anchor;
  }

  /**
   * Check if point coordinates are valid numbers
   */
  private static isValidPoint(point: Vector3): boolean {
    return (
      typeof point.x === 'number' &&
      typeof point.y === 'number' &&
      isFinite(point.x) &&
      isFinite(point.y) &&
      (point.z === undefined || (typeof point.z === 'number' && isFinite(point.z)))
    );
  }
}
