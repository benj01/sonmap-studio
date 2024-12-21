import { Geometry } from 'geojson';
import { ErrorReporter } from '../../../errors';
import { DxfEntityBase, isValidPoint2D, isValidPoint3D } from './types';

/**
 * Interface for geometry converters
 */
export interface GeometryConverter {
  /**
   * Convert a DXF entity to a GeoJSON geometry
   */
  convert(entity: DxfEntityBase, errorReporter: ErrorReporter): Geometry | null;

  /**
   * Check if this converter can handle the given entity type
   */
  canHandle(entityType: string): boolean;
}

/**
 * Base class for geometry converters
 */
export abstract class BaseGeometryConverter implements GeometryConverter {
  protected entityInfo(entity: DxfEntityBase) {
    return {
      type: entity.type,
      handle: entity.handle || 'unknown',
      layer: entity.layer || '0'
    };
  }

  /**
   * Validate coordinates and report errors
   */
  protected validateCoordinates(
    point: unknown,
    errorReporter: ErrorReporter,
    entityInfo: ReturnType<typeof this.entityInfo>,
    context: string
  ): boolean {
    if (!point || typeof point !== 'object') {
      errorReporter.addWarning(
        `Invalid ${context} coordinates: not an object`,
        'INVALID_COORDINATES',
        {
          ...entityInfo,
          context,
          point
        }
      );
      return false;
    }

    if (!isValidPoint2D(point)) {
      errorReporter.addWarning(
        `Invalid ${context} coordinates: invalid x/y values`,
        'INVALID_COORDINATES',
        {
          ...entityInfo,
          context,
          point
        }
      );
      return false;
    }

    if ('z' in point && !isValidPoint3D(point)) {
      errorReporter.addWarning(
        `Invalid ${context} coordinates: invalid z value`,
        'INVALID_COORDINATES',
        {
          ...entityInfo,
          context,
          point
        }
      );
      return false;
    }

    return true;
  }

  /**
   * Validate numeric value and report errors
   */
  protected validateNumber(
    value: unknown,
    errorReporter: ErrorReporter,
    entityInfo: ReturnType<typeof this.entityInfo>,
    context: string,
    options?: { min?: number; max?: number; nonZero?: boolean }
  ): boolean {
    if (typeof value !== 'number' || !isFinite(value)) {
      errorReporter.addWarning(
        `Invalid ${context}: not a valid number`,
        'INVALID_NUMBER',
        {
          ...entityInfo,
          context,
          value
        }
      );
      return false;
    }

    if (options?.min !== undefined && value < options.min) {
      errorReporter.addWarning(
        `Invalid ${context}: value below minimum`,
        'INVALID_NUMBER_RANGE',
        {
          ...entityInfo,
          context,
          value,
          min: options.min
        }
      );
      return false;
    }

    if (options?.max !== undefined && value > options.max) {
      errorReporter.addWarning(
        `Invalid ${context}: value above maximum`,
        'INVALID_NUMBER_RANGE',
        {
          ...entityInfo,
          context,
          value,
          max: options.max
        }
      );
      return false;
    }

    if (options?.nonZero && value === 0) {
      errorReporter.addWarning(
        `Invalid ${context}: value cannot be zero`,
        'INVALID_NUMBER_ZERO',
        {
          ...entityInfo,
          context,
          value
        }
      );
      return false;
    }

    return true;
  }

  /**
   * Validate array and report errors
   */
  protected validateArray<T>(
    array: unknown,
    itemValidator: (item: unknown) => item is T,
    errorReporter: ErrorReporter,
    entityInfo: ReturnType<typeof this.entityInfo>,
    context: string,
    options?: { minLength?: number; maxLength?: number }
  ): array is T[] {
    if (!Array.isArray(array)) {
      errorReporter.addWarning(
        `Invalid ${context}: not an array`,
        'INVALID_ARRAY',
        {
          ...entityInfo,
          context,
          value: array
        }
      );
      return false;
    }

    if (options?.minLength !== undefined && array.length < options.minLength) {
      errorReporter.addWarning(
        `Invalid ${context}: array too short`,
        'INVALID_ARRAY_LENGTH',
        {
          ...entityInfo,
          context,
          length: array.length,
          minLength: options.minLength
        }
      );
      return false;
    }

    if (options?.maxLength !== undefined && array.length > options.maxLength) {
      errorReporter.addWarning(
        `Invalid ${context}: array too long`,
        'INVALID_ARRAY_LENGTH',
        {
          ...entityInfo,
          context,
          length: array.length,
          maxLength: options.maxLength
        }
      );
      return false;
    }

    if (!array.every(itemValidator)) {
      errorReporter.addWarning(
        `Invalid ${context}: array contains invalid items`,
        'INVALID_ARRAY_ITEMS',
        {
          ...entityInfo,
          context,
          array
        }
      );
      return false;
    }

    return true;
  }

  abstract convert(entity: DxfEntityBase, errorReporter: ErrorReporter): Geometry | null;
  abstract canHandle(entityType: string): boolean;
}

/**
 * Registry for geometry converters
 */
export class GeometryConverterRegistry {
  private converters: GeometryConverter[] = [];

  register(converter: GeometryConverter): void {
    this.converters.push(converter);
  }

  findConverter(entityType: string): GeometryConverter | null {
    return this.converters.find(c => c.canHandle(entityType)) || null;
  }
}

// Create and export a singleton instance
export const geometryConverterRegistry = new GeometryConverterRegistry();
