import { GeoFeature } from '../../../../../types/geo';
import { ErrorReporter } from '../../errors';
import { DxfEntityBase } from './geometry/types';
import { createDxfFeatureConverter } from './feature';
import { initializeFeatureConverters } from './feature';
import { FeatureConversionOptions } from './feature/types';

/**
 * Options for DXF conversion
 */
export interface DxfConversionOptions extends FeatureConversionOptions {
  // Add any additional top-level conversion options here
  validateEntities?: boolean;
  skipInvalidEntities?: boolean;
}

/**
 * Main DXF converter class that uses the modular converter system
 */
export class DxfConverter {
  private featureConverter;

  constructor(private errorReporter: ErrorReporter) {
    // Initialize the converter system
    initializeFeatureConverters();
    // Create the feature converter
    this.featureConverter = createDxfFeatureConverter(errorReporter);
  }

  /**
   * Convert a single DXF entity to a GeoJSON feature
   */
  convertEntity(
    entity: DxfEntityBase,
    options?: DxfConversionOptions
  ): GeoFeature | null {
    return this.featureConverter.convertEntity(entity, options);
  }

  /**
   * Convert multiple DXF entities to GeoJSON features
   */
  convertEntities(
    entities: DxfEntityBase[],
    options?: DxfConversionOptions
  ): GeoFeature[] {
    return this.featureConverter.convertEntities(entities, options);
  }
}

/**
 * Create a new DXF converter instance
 */
export function createDxfConverter(errorReporter: ErrorReporter): DxfConverter {
  return new DxfConverter(errorReporter);
}

// Re-export types from the geometry and feature modules
export * from './geometry/types';
export * from './feature/types';
