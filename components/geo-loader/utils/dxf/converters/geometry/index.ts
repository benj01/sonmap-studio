// Export base types and interfaces
export * from './types';
export * from './base';

// Export individual converters
export * from './circle';
export * from './polyline';
export * from './text';
export * from './spline';

// Re-export the registry instance
export { geometryConverterRegistry } from './base';

// Export a function to initialize all converters
export function initializeGeometryConverters(): void {
  // The imports above will trigger the registration of each converter
  // This function exists mainly to ensure the registration code is executed
  // when the converters are needed
}
