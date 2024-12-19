import { createErrorReporter } from '../../utils/errors';
import { initializeCoordinateSystems } from '../../utils/coordinate-systems';
import proj4 from 'proj4';

// Create initialization error reporter
const initErrorReporter = createErrorReporter();

// Create proj4 instance
const proj4Instance = proj4;

// Initialize coordinate systems with error reporting
const initialized = initializeCoordinateSystems(proj4Instance, initErrorReporter);
if (!initialized) {
  const errors = initErrorReporter.getErrors();
  const errorMessages = errors.map(e => e.message).join('\n');
  throw new Error(`Failed to initialize coordinate systems:\n${errorMessages}`);
}

// Check for any warnings during initialization
const initWarnings = initErrorReporter.getWarnings();
if (initWarnings.length > 0) {
  console.warn('Coordinate system initialization warnings:', 
    initWarnings.map(w => w.message).join('\n')
  );
}

export { initErrorReporter, proj4Instance };
