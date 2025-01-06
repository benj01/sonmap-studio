import { coordinateSystemManager } from './core/coordinate-system-manager';
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
const initPromise = (async () => {
  try {
    // Perform synchronous initialization first
    coordinateSystemManager.initSync();
    
    // Then start async verification
    await coordinateSystemManager.initialize();
  } catch (error) {
    console.error('Failed to initialize coordinate systems:', error);
    throw error;
  }
})();

// Export initialization helpers
export const initialize = () => initPromise;
export const isInitialized = () => coordinateSystemManager.isInitialized();

// Create a proxy to ensure initialization before any coordinate system operations
const wrappedManager = new Proxy(coordinateSystemManager, {
  get(target: typeof coordinateSystemManager, prop: keyof typeof coordinateSystemManager) {
    const value = target[prop];
    if (typeof value === 'function' && prop !== 'isInitialized' && prop !== 'initSync') {
      return async (...args: unknown[]) => {
        await initPromise;
        return (value as Function).apply(target, args);
      };
    }
    return value;
  }
});

// Export the wrapped manager as the only instance
export { wrappedManager as coordinateSystemManager };

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
