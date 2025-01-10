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

// Import and initialize processors synchronously
import './core/processors';
import { ProcessorRegistry } from './core/processors/base/registry';
console.debug('[DEBUG] Processors registered:', ProcessorRegistry.getSupportedExtensions());

// Initialize coordinate systems
const initPromise = coordinateSystemManager.initialize();

// Export initialization helpers
export const initialize = () => initPromise;
export const isInitialized = () => coordinateSystemManager.isInitialized();

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
