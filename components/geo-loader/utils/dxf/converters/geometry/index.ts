import { geometryConverterRegistry } from './base';
import { CircleGeometryConverter } from './circle';
import { PolylineGeometryConverter } from './polyline';
import { TextGeometryConverter } from './text';
import { SplineGeometryConverter } from './spline';
import { Face3DGeometryConverter } from './face3d';
import { InsertGeometryConverter } from './insert';
import { HatchGeometryConverter } from './hatch';
import { SolidGeometryConverter } from './solid';
import { DimensionGeometryConverter } from './dimension';
import { LeaderGeometryConverter } from './leader';
import { RayGeometryConverter } from './ray';

// Export types and interfaces
export * from './types';
export * from './base';

// Export individual converters
export * from './circle';
export * from './polyline';
export * from './text';
export * from './spline';
export * from './face3d';
export * from './insert';
export * from './hatch';
export * from './solid';
export * from './dimension';
export * from './leader';
export * from './ray';

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

    // Register 3DFACE converter
    const face3DConverter = new Face3DGeometryConverter();
    geometryConverterRegistry.register(face3DConverter);

    // Register INSERT converter
    const insertConverter = new InsertGeometryConverter();
    geometryConverterRegistry.register(insertConverter);

    // Register HATCH converter
    const hatchConverter = new HatchGeometryConverter();
    geometryConverterRegistry.register(hatchConverter);

    // Register SOLID/3DSOLID converter
    const solidConverter = new SolidGeometryConverter();
    geometryConverterRegistry.register(solidConverter);

    // Register DIMENSION converter
    const dimensionConverter = new DimensionGeometryConverter();
    geometryConverterRegistry.register(dimensionConverter);

    // Register LEADER/MLEADER converter
    const leaderConverter = new LeaderGeometryConverter();
    geometryConverterRegistry.register(leaderConverter);

    // Register RAY/XLINE converter
    const rayConverter = new RayGeometryConverter();
    geometryConverterRegistry.register(rayConverter);

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
