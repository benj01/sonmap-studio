import { geometryConverterRegistry } from './base';
import { CircleGeometryConverter } from './circle';
import { PolylineGeometryConverter } from './polyline';
import { TextGeometryConverter } from './text';
import { SplineGeometryConverter } from './spline';

// Export types and interfaces
export * from './types';
export * from './base';

// Export individual converters
export * from './circle';
export * from './polyline';
export * from './text';
export * from './spline';

let initialized = false;

/**
 * Initialize all geometry converters synchronously
 */
export function initializeGeometryConverters(): void {
  if (initialized) {
    return;
  }

  try {
    // Register circle converter for circles and arcs
    const circleConverter = new CircleGeometryConverter();
    geometryConverterRegistry.register(circleConverter);

    // Register polyline converter for polylines and lines
    const polylineConverter = new PolylineGeometryConverter();
    geometryConverterRegistry.register(polylineConverter);

    // Register text converter for text entities
    const textConverter = new TextGeometryConverter();
    geometryConverterRegistry.register(textConverter);

    // Register spline converter
    const splineConverter = new SplineGeometryConverter();
    geometryConverterRegistry.register(splineConverter);

    initialized = true;
    console.log('[DEBUG] Geometry converters initialized');
  } catch (error) {
    console.error('[ERROR] Failed to initialize geometry converters:', error);
    throw error;
  }
}

/**
 * Check if geometry converters are initialized
 */
export function areGeometryConvertersInitialized(): boolean {
  return initialized;
}

/**
 * Ensure geometry converters are initialized
 */
export function ensureGeometryConvertersInitialized(): void {
  if (!initialized) {
    initializeGeometryConverters();
  }
}
