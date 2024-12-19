// Initialize coordinate systems first
import { initializeCoordinateSystems } from './utils/coordinate-systems';
import { COORDINATE_SYSTEMS } from './types/coordinates';
import { createTransformer } from './utils/coordinate-utils';
import { ErrorReporterImpl } from './utils/errors';
import proj4 from 'proj4';

// Create an error reporter for initialization
const initErrorReporter = new ErrorReporterImpl();

// Initialize coordinate systems immediately and verify initialization
const initialized = initializeCoordinateSystems(proj4, initErrorReporter);
if (!initialized) {
  console.error('Failed to initialize coordinate systems');
  throw new Error('Failed to initialize coordinate systems');
}

// Import processors to ensure they're registered
import './processors';

export { default as GeoImportDialog } from './components/geo-import';
export { PreviewMap } from './components/preview-map';

// Re-export coordinate systems and utilities for external use
export { COORDINATE_SYSTEMS } from './types/coordinates';
export { createTransformer } from './utils/coordinate-utils';
export { needsTransformation } from './utils/coordinate-systems';

// Re-export error reporter for external use
export { ErrorReporterImpl, type ErrorReporter } from './utils/errors';
