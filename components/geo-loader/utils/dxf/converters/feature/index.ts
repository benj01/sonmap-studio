// Export types and interfaces
export * from './types';

// Export the feature converter
export * from './converter';

// Export a function to initialize the feature conversion system
export function initializeFeatureConverters(): void {
  // Import and initialize geometry converters first since we depend on them
  import('../geometry').then(({ initializeGeometryConverters }) => {
    initializeGeometryConverters();
  });
}
