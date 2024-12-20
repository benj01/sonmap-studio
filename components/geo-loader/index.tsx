import { initializeCoordinateSystems, CoordinateSystemError } from './utils/coordinate-systems';
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

// Initialize coordinate systems immediately
try {
  if (!initializeCoordinateSystems()) {
    throw new CoordinateSystemError('Failed to initialize coordinate systems');
  }
} catch (error) {
  // Re-throw with proper error type
  if (error instanceof CoordinateSystemError) {
    throw error;
  }
  throw new CoordinateSystemError(
    `Failed to initialize coordinate systems: ${error instanceof Error ? error.message : String(error)}`
  );
}

// Import processors to ensure they're registered
import './processors';

// Component exports
export { default as GeoImportDialog } from './components/geo-import';
export { PreviewMap } from './components/preview-map';

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

// Coordinate transformation utilities
export {
  createTransformer,
  CoordinateSystemError,
  TransformationError
} from './utils/coordinate-systems';
