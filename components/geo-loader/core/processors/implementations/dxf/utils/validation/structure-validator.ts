import { DxfStructure } from '../../types';

export interface ValidationIssue {
  type: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Validate DXF structure
 * @param structure The DXF structure to validate
 * @returns Array of validation issues
 */
export function validateStructure(structure: DxfStructure): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Only warn about missing layers/entities
  if (!structure.layers || structure.layers.length === 0) {
    console.warn('[DEBUG] No layers found in DXF file');
  }

  if (!structure.entityTypes || structure.entityTypes.length === 0) {
    console.warn('[DEBUG] No entities found in DXF file');
  }

  // Default layer is not strictly required
  if (!structure.layers?.some(layer => layer.name === '0')) {
    console.warn('[DEBUG] Default layer "0" not found');
  }

  // Check for valid extents if provided
  if (structure.extents) {
    const { min, max } = structure.extents;
    
    // Check for valid coordinates
    if (!isValidCoordinate(min) || !isValidCoordinate(max)) {
      issues.push({
        type: 'INVALID_EXTENTS',
        message: 'Invalid extents coordinates',
        details: { min, max }
      });
    }
    
    // Check if min is actually less than max
    if (min[0] > max[0] || min[1] > max[1] || min[2] > max[2]) {
      issues.push({
        type: 'INVALID_EXTENTS_RANGE',
        message: 'Minimum extents greater than maximum',
        details: { min, max }
      });
    }
  }

  // Check for valid units if specified
  if (structure.units && !['metric', 'imperial'].includes(structure.units)) {
    issues.push({
      type: 'INVALID_UNITS',
      message: 'Invalid units specification',
      details: { units: structure.units }
    });
  }

  return issues;
}

/**
 * Check if coordinate array is valid
 */
function isValidCoordinate(coord: [number, number, number]): boolean {
  return Array.isArray(coord) && 
         coord.length === 3 && 
         coord.every(n => typeof n === 'number' && !isNaN(n));
}

/**
 * Validate entity data
 * @param type Entity type
 * @param data Entity data
 * @returns Array of validation issues
 */
export function validateEntityData(
  type: string,
  data: Record<string, unknown>
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  switch (type.toUpperCase()) {
    case 'POINT':
      if (!isValidNumber(data.x) || !isValidNumber(data.y)) {
        issues.push({
          type: 'INVALID_POINT',
          message: 'Point entity missing valid coordinates',
          details: { data }
        });
      }
      break;

    case 'LINE':
      if (!isValidNumber(data.x) || !isValidNumber(data.y) ||
          !isValidNumber(data.x2) || !isValidNumber(data.y2)) {
        issues.push({
          type: 'INVALID_LINE',
          message: 'Line entity missing valid coordinates',
          details: { data }
        });
      }
      break;

    case 'POLYLINE':
    case 'LWPOLYLINE':
      if (!Array.isArray(data.vertices)) {
        issues.push({
          type: 'INVALID_POLYLINE',
          message: 'Polyline entity missing vertices array',
          details: { data }
        });
      } else if (data.vertices.length < 2) {
        console.warn('[DEBUG] Polyline has less than 2 vertices:', data.vertices.length);
      } else {
        // Check each vertex
        data.vertices.forEach((vertex, index) => {
          if (!isValidNumber(vertex.x) || !isValidNumber(vertex.y)) {
            console.warn('[DEBUG] Invalid vertex:', { index, vertex });
          }
        });
      }
      break;

    case 'CIRCLE':
      if (!isValidNumber(data.x) || !isValidNumber(data.y) || !isValidNumber(data.radius)) {
        issues.push({
          type: 'INVALID_CIRCLE',
          message: 'Circle entity missing valid coordinates or radius',
          details: { data }
        });
      }
      break;

    case 'ARC':
      if (!isValidNumber(data.x) || !isValidNumber(data.y) ||
          !isValidNumber(data.radius) ||
          !isValidNumber(data.startAngle) || !isValidNumber(data.endAngle)) {
        issues.push({
          type: 'INVALID_ARC',
          message: 'Arc entity missing valid coordinates, radius, or angles',
          details: { data }
        });
      }
      break;
  }

  return issues;
}

/**
 * Check if value is a valid number
 */
function isValidNumber(value: unknown): boolean {
  return typeof value === 'number' && !isNaN(value);
}
