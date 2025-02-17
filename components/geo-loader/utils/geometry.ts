import { Position } from 'geojson';
import { ViewportBounds } from '../preview/types';
import { Bounds } from '../core/feature-manager/bounds';

/**
 * Check if a point is within bounds
 */
export function isPointInBounds(point: Position, bounds: ViewportBounds | Bounds): boolean {
  const [x, y] = point;
  
  if ('minX' in bounds) {
    return x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY;
  }

  const [minX, minY, maxX, maxY] = bounds;
  return x >= minX && x <= maxX && y >= minY && y <= maxY;
}

/**
 * Convert viewport bounds to Bounds object
 */
export function viewportBoundsToBounds(bounds: ViewportBounds): Bounds {
  const [minX, minY, maxX, maxY] = bounds;
  return { minX, minY, maxX, maxY };
}

/**
 * Convert Bounds object to viewport bounds
 */
export function boundsToViewportBounds(bounds: Bounds): ViewportBounds {
  return [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY];
}

/**
 * Check if two bounds overlap
 */
export function doBoundsOverlap(a: Bounds, b: Bounds): boolean {
  return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);
}

/**
 * Calculate bounds from a list of points
 */
export function calculateBoundsFromPoints(points: Position[]): Bounds {
  if (points.length === 0) {
    throw new Error('Cannot calculate bounds from empty points array');
  }

  const bounds = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity
  };

  for (const [x, y] of points) {
    bounds.minX = Math.min(bounds.minX, x);
    bounds.minY = Math.min(bounds.minY, y);
    bounds.maxX = Math.max(bounds.maxX, x);
    bounds.maxY = Math.max(bounds.maxY, y);
  }

  return bounds;
} 