import { Geometry } from 'geojson';
import { ErrorReporter } from '../../../errors';
import { DxfEntityBase } from './types';

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
      handle: entity.handle || 'unknown'
    };
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
