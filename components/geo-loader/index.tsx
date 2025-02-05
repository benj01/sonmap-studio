import { coordinateSystemManager } from './core/coordinate-systems/coordinate-system-manager';
import { 
  COORDINATE_SYSTEMS,
  CoordinateSystem,
  CoordinatePoint,
  Bounds,
  isSwissSystem,
  isWGS84System,
  isValidPoint,
  isValidBounds,
  isWGS84Range,
  positionToPoint,
  pointToPosition
} from './types/coordinates';

// Import WebAssembly initialization
import { initWasm } from './core/processors/implementations/shapefile/core/wasm-bridge';

// Import and initialize processors synchronously
import './core/processors';
import { ProcessorRegistry } from './core/processors/base/registry';

// Get registry instance and log supported extensions
const registry = ProcessorRegistry.getInstance();
console.debug('[DEBUG] Processors registered:', registry.getSupportedExtensions());

// Initialize coordinate systems and WebAssembly
const initPromises = Promise.all([
  coordinateSystemManager.initialize(),
  initWasm().catch(error => {
    console.error('Failed to initialize WebAssembly:', error);
    throw error;
  })
]);

// Export initialization helpers
export const initialize = () => initPromises;
export const isInitialized = () => {
  return coordinateSystemManager.isInitialized() && 
         registry.getSupportedExtensions().includes('shp');
};

// Export the coordinate system manager instance
export { coordinateSystemManager };

// Remove the original export to avoid duplicates

// Component exports
export { default as GeoImportDialog } from './components/geo-import';
export { PreviewMap } from './components/preview-map/index';
export { DxfStructureView } from './components/dxf-structure-view';

// Type exports
export type {
  CoordinateSystem,
  CoordinatePoint,
  Bounds
};

// Coordinate system utilities
export {
  COORDINATE_SYSTEMS,
  isSwissSystem,
  isWGS84System,
  isValidPoint,
  isValidBounds,
  isWGS84Range,
  positionToPoint,
  pointToPosition
};

// Error types
export { 
  GeoLoaderError,
  ValidationError,
  ParseError
} from './core/errors/types';
