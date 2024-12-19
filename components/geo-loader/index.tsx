// Initialize coordinate systems first
import { initializeCoordinateSystems } from './utils/coordinate-systems';
import { COORDINATE_SYSTEMS } from './types/coordinates';

// Initialize coordinate systems immediately and verify initialization
const initialized = initializeCoordinateSystems();
if (!initialized) {
  console.error('Failed to initialize coordinate systems');
  throw new Error('Failed to initialize coordinate systems');
}

// Import processors to ensure they're registered
import './processors';

export { default as GeoImportDialog } from './components/geo-import';
export { PreviewMap } from './components/preview-map';

// Re-export coordinate systems for external use
export { COORDINATE_SYSTEMS } from './types/coordinates';
export { createTransformer, needsTransformation } from './utils/coordinate-systems';
