import { ErrorReporter } from '../../errors';
import { DxfFeatureConverter, createDxfFeatureConverter } from './feature/converter';
import { ensureGeometryConvertersInitialized } from './geometry';

export * from './feature/types';
export * from './geometry/types';

/**
 * Create a new DXF converter instance with initialized geometry converters
 */
export function createDxfConverter(errorReporter: ErrorReporter): DxfFeatureConverter {
  // Ensure geometry converters are initialized before creating the converter
  ensureGeometryConvertersInitialized();
  return createDxfFeatureConverter(errorReporter);
}

// Re-export initialization functions
export { ensureGeometryConvertersInitialized } from './geometry';
export type { FeatureConversionOptions as DxfConversionOptions } from './feature/types';
