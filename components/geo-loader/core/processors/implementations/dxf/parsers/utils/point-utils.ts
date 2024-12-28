import { Vector3 } from '../../types';

/**
 * Type guard for point coordinates
 */
export function isValidPoint(point: any): point is { x: number; y: number; z?: number } {
  return typeof point === 'object' && 
         point !== null &&
         typeof point.x === 'number' &&
         typeof point.y === 'number' &&
         (point.z === undefined || typeof point.z === 'number');
}

/**
 * Convert point coordinates to [number, number, number] tuple
 */
export function toPoint3d(point: { x: number; y: number; z?: number }): [number, number, number] {
  return [point.x, point.y, point.z || 0];
}

/**
 * Convert angle from degrees to radians
 */
export function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Generate points along an arc or circle
 */
export function generateArcPoints(
  center: Vector3,
  radius: number,
  startAngle: number,
  endAngle: number,
  points: number = 32
): [number, number][] {
  const coordinates: [number, number][] = [];
  const angleRange = endAngle - startAngle;
  
  for (let i = 0; i <= points; i++) {
    const angle = startAngle + (i / points) * angleRange;
    coordinates.push([
      center.x + Math.cos(angle) * radius,
      center.y + Math.sin(angle) * radius
    ]);
  }
  
  return coordinates;
}
