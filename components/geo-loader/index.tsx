import { 
  CoordinateSystemError,
  CoordinateTransformationError,
  InvalidCoordinateError
} from './core/errors/types';
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

// Initialize coordinate system manager immediately
(async () => {
  try {
    await coordinateSystemManager.initialize();
  } catch (error) {
    // Re-throw with proper error type
    if (error instanceof CoordinateSystemError || 
        error instanceof CoordinateTransformationError || 
        error instanceof InvalidCoordinateError) {
      throw error;
    }
    throw new CoordinateSystemError(
      `Failed to initialize coordinate system manager: ${error instanceof Error ? error.message : String(error)}`,
      { error: error instanceof Error ? error.message : String(error) }
    );
  }
})().catch(error => {
  console.error('Failed to initialize coordinate system manager:', error);
});

// Import new processors to ensure they're registered
import './core/processors';

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

// Error and transformation utilities
export {
  CoordinateSystemError,
  CoordinateTransformationError as TransformationError,
  InvalidCoordinateError
} from './core/errors/types';
export { coordinateSystemManager } from './core/coordinate-system-manager';
