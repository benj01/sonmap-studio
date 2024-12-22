import { DxfStructure, DxfEntity, DxfBlock, DxfEntityType, Vector3, HatchBoundary } from '../../types';

export interface ValidationIssue {
  type: string;
  message: string;
  details?: Record<string, unknown>;
  path?: string[];
}

/**
 * Type guard for objects
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Type guard for Vector3
 */
function isVector3(value: unknown): value is Vector3 {
  if (!isObject(value)) return false;
  return typeof value.x === 'number' && 
         typeof value.y === 'number' && 
         (value.z === undefined || typeof value.z === 'number');
}

/**
 * Type guard for DxfStructure
 */
function isDxfStructure(value: unknown): value is DxfStructure {
  if (!isObject(value)) return false;
  const structure = value as Record<string, unknown>;
  return Array.isArray(structure.layers) &&
         Array.isArray(structure.blocks) &&
         Array.isArray(structure.entityTypes) &&
         (structure.units === undefined || typeof structure.units === 'string') &&
         (structure.extents === undefined || isObject(structure.extents));
}

/**
 * Type guard for DxfBlock
 */
function isDxfBlock(value: unknown): value is DxfBlock {
  if (!isObject(value)) return false;
  const block = value as Record<string, unknown>;
  return typeof block.name === 'string' &&
         Array.isArray(block.basePoint) &&
         block.basePoint.length === 3 &&
         block.basePoint.every(n => typeof n === 'number') &&
         Array.isArray(block.entities);
}

/**
 * Type guard for HatchBoundary
 */
function isHatchBoundary(value: unknown): value is HatchBoundary {
  if (!isObject(value)) return false;
  const boundary = value as Record<string, unknown>;
  return typeof boundary.type === 'string' &&
         typeof boundary.isExternal === 'boolean' &&
         isObject(boundary.data);
}

/**
 * Type guard for DxfEntityType
 */
function isDxfEntityType(value: string): value is DxfEntityType {
  return [
    'POINT', 'LINE', 'POLYLINE', 'LWPOLYLINE', 'CIRCLE', 'ARC',
    'ELLIPSE', 'INSERT', 'TEXT', 'MTEXT', 'DIMENSION', 'SPLINE',
    'HATCH', 'SOLID', 'FACE3D'
  ].includes(value);
}

/**
 * Validate DXF structure with enhanced type checking
 * @param structure The DXF structure to validate
 * @returns Array of validation issues
 */
export function validateStructure(structure: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Type guard for DxfStructure
  if (!isObject(structure)) {
    issues.push({
      type: 'INVALID_STRUCTURE',
      message: 'DXF structure must be an object',
      path: []
    });
    return issues;
  }

  if (!isDxfStructure(structure)) {
    issues.push({
      type: 'INVALID_STRUCTURE',
      message: 'DXF structure missing required properties',
      path: []
    });
    return issues;
  }

  const dxfStructure = structure;

  // Validate layers
  if (!Array.isArray(dxfStructure.layers)) {
    issues.push({
      type: 'INVALID_LAYERS',
      message: 'Layers must be an array',
      path: ['layers']
    });
  } else if (dxfStructure.layers.length === 0) {
    console.warn('[DEBUG] No layers found in DXF file');
  }

  // Validate entity types
  if (!Array.isArray(dxfStructure.entityTypes)) {
    issues.push({
      type: 'INVALID_ENTITY_TYPES',
      message: 'Entity types must be an array',
      path: ['entityTypes']
    });
  } else if (dxfStructure.entityTypes.length === 0) {
    console.warn('[DEBUG] No entities found in DXF file');
  } else {
    dxfStructure.entityTypes.forEach((type, index) => {
      if (!isDxfEntityType(type)) {
        issues.push({
          type: 'INVALID_ENTITY_TYPE',
          message: `Invalid entity type: ${type}`,
          path: ['entityTypes', index.toString()]
        });
      }
    });
  }

  // Validate blocks
  if (!Array.isArray(dxfStructure.blocks)) {
    issues.push({
      type: 'INVALID_BLOCKS',
      message: 'Blocks must be an array',
      path: ['blocks']
    });
  } else {
    dxfStructure.blocks.forEach((block, index) => {
      const blockIssues = validateBlock(block);
      if (blockIssues.length > 0) {
        issues.push(...blockIssues.map(issue => ({
          ...issue,
          path: ['blocks', index.toString(), ...(issue.path || [])]
        })));
      }
    });
  }

  // Validate extents if provided
  if (dxfStructure.extents !== undefined) {
    if (!isObject(dxfStructure.extents)) {
      issues.push({
        type: 'INVALID_EXTENTS',
        message: 'Extents must be an object',
        path: ['extents']
      });
    } else {
      const { min, max } = dxfStructure.extents;
      
      // Check for valid coordinates
      if (!isValidCoordinate(min) || !isValidCoordinate(max)) {
        issues.push({
          type: 'INVALID_EXTENTS_COORDINATES',
          message: 'Invalid extents coordinates',
          path: ['extents'],
          details: { min, max }
        });
      }
      
      // Check if min is actually less than max
      if (min && max && (min[0] > max[0] || min[1] > max[1] || min[2] > max[2])) {
        issues.push({
          type: 'INVALID_EXTENTS_RANGE',
          message: 'Minimum extents greater than maximum',
          path: ['extents'],
          details: { min, max }
        });
      }
    }
  }

  // Validate units if specified
  if (dxfStructure.units !== undefined && !['metric', 'imperial'].includes(dxfStructure.units)) {
    issues.push({
      type: 'INVALID_UNITS',
      message: 'Invalid units specification',
      path: ['units'],
      details: { units: dxfStructure.units }
    });
  }

  return issues;
}

/**
 * Validate DXF block
 */
export function validateBlock(block: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!isObject(block)) {
    issues.push({
      type: 'INVALID_BLOCK',
      message: 'Block must be an object'
    });
    return issues;
  }

  if (!isDxfBlock(block)) {
    issues.push({
      type: 'INVALID_BLOCK',
      message: 'Block missing required properties',
      path: []
    });
    return issues;
  }

  const dxfBlock = block;

  // Validate required properties
  if (typeof dxfBlock.name !== 'string' || dxfBlock.name.length === 0) {
    issues.push({
      type: 'INVALID_BLOCK_NAME',
      message: 'Block must have a valid name',
      path: ['name']
    });
  }

  if (!Array.isArray(dxfBlock.basePoint) || dxfBlock.basePoint.length !== 3 ||
      !dxfBlock.basePoint.every(n => typeof n === 'number')) {
    issues.push({
      type: 'INVALID_BLOCK_BASE_POINT',
      message: 'Block must have a valid base point',
      path: ['basePoint']
    });
  }

  // Validate entities
  if (!Array.isArray(dxfBlock.entities)) {
    issues.push({
      type: 'INVALID_BLOCK_ENTITIES',
      message: 'Block entities must be an array',
      path: ['entities']
    });
  } else {
    dxfBlock.entities.forEach((entity, index) => {
      const entityIssues = validateEntityData(entity.type, entity.data);
      if (entityIssues.length > 0) {
        issues.push(...entityIssues.map(issue => ({
          ...issue,
          path: ['entities', index.toString(), ...(issue.path || [])]
        })));
      }
    });
  }

  return issues;
}

/**
 * Check if coordinate array is valid
 */
function isValidCoordinate(coord: unknown): boolean {
  return Array.isArray(coord) && 
         coord.length === 3 && 
         coord.every(n => typeof n === 'number' && !isNaN(n));
}

/**
 * Validate hatch boundary
 */
function validateHatchBoundary(boundary: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!isObject(boundary)) {
    issues.push({
      type: 'INVALID_HATCH_BOUNDARY',
      message: 'Hatch boundary must be an object'
    });
    return issues;
  }

  if (!isHatchBoundary(boundary)) {
    issues.push({
      type: 'INVALID_HATCH_BOUNDARY',
      message: 'Hatch boundary missing required properties',
      path: []
    });
    return issues;
  }

  const hatchBoundary = boundary;

  if (!['POLYLINE', 'CIRCLE', 'ELLIPSE', 'SPLINE'].includes(hatchBoundary.type)) {
    issues.push({
      type: 'INVALID_HATCH_BOUNDARY_TYPE',
      message: 'Invalid hatch boundary type',
      details: { type: hatchBoundary.type }
    });
  }

  if (typeof hatchBoundary.isExternal !== 'boolean') {
    issues.push({
      type: 'INVALID_HATCH_BOUNDARY_FLAG',
      message: 'Invalid isExternal flag'
    });
  }

  return issues;
}

/**
 * Validate entity data with enhanced type checking
 * @param type Entity type
 * @param data Entity data
 * @returns Array of validation issues
 */
/**
 * Type guard for DxfEntity
 */
function isDxfEntity(value: unknown): value is DxfEntity {
  if (!isObject(value)) return false;
  const entity = value as Record<string, unknown>;
  return typeof entity.type === 'string' &&
         isObject(entity.attributes) &&
         isObject(entity.data);
}

/**
 * Validate entity data with enhanced type checking and support for complex entities
 * @param type Entity type
 * @param data Entity data
 * @returns Array of validation issues
 */
export function validateEntityData(
  type: string,
  data: Record<string, unknown>
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!isObject(data)) {
    issues.push({
      type: 'INVALID_ENTITY_DATA',
      message: 'Entity data must be an object',
      path: []
    });
    return issues;
  }

  switch (type.toUpperCase()) {
    case 'POINT':
      if (!isValidNumber(data.x) || !isValidNumber(data.y)) {
        issues.push({
          type: 'INVALID_POINT',
          message: 'Point entity missing valid coordinates',
          path: ['coordinates'],
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
          path: ['coordinates'],
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
          path: ['vertices'],
          details: { data }
        });
      } else if (data.vertices.length < 2) {
        issues.push({
          type: 'INVALID_POLYLINE',
          message: 'Polyline must have at least 2 vertices',
          path: ['vertices'],
          details: { vertexCount: data.vertices.length }
        });
      } else {
        data.vertices.forEach((vertex, index) => {
          if (!isObject(vertex) || !isValidNumber(vertex.x) || !isValidNumber(vertex.y)) {
            issues.push({
              type: 'INVALID_VERTEX',
              message: `Invalid vertex at index ${index}`,
              path: ['vertices', index.toString()],
              details: { vertex }
            });
          }
        });
      }
      break;

    case 'CIRCLE':
      if (!isValidNumber(data.x) || !isValidNumber(data.y) || !isValidNumber(data.radius)) {
        issues.push({
          type: 'INVALID_CIRCLE',
          message: 'Circle entity missing valid coordinates or radius',
          path: ['geometry'],
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
          path: ['geometry'],
          details: { data }
        });
      }
      break;

    case 'ELLIPSE':
      if (!isValidNumber(data.x) || !isValidNumber(data.y) ||
          !isVector3(data.majorAxis) || !isValidNumber(data.ratio)) {
        issues.push({
          type: 'INVALID_ELLIPSE',
          message: 'Ellipse entity missing valid center, major axis, or ratio',
          path: ['geometry'],
          details: { data }
        });
      }
      break;

    case 'SPLINE':
      if (!Array.isArray(data.controlPoints) || data.controlPoints.length < 2) {
        issues.push({
          type: 'INVALID_SPLINE',
          message: 'Spline must have at least 2 control points',
          path: ['controlPoints'],
          details: { pointCount: Array.isArray(data.controlPoints) ? data.controlPoints.length : 0 }
        });
      } else {
        data.controlPoints.forEach((point, index) => {
          if (!isObject(point) || !isValidNumber(point.x) || !isValidNumber(point.y)) {
            issues.push({
              type: 'INVALID_CONTROL_POINT',
              message: `Invalid control point at index ${index}`,
              path: ['controlPoints', index.toString()],
              details: { point }
            });
          }
        });
      }

      if (!Array.isArray(data.knots)) {
        issues.push({
          type: 'INVALID_SPLINE',
          message: 'Spline missing knot vector',
          path: ['knots'],
          details: { data }
        });
      }
      break;

    case 'TEXT':
    case 'MTEXT':
      if (!isValidNumber(data.x) || !isValidNumber(data.y) ||
          typeof data.text !== 'string' || !isValidNumber(data.height)) {
        issues.push({
          type: 'INVALID_TEXT',
          message: 'Text entity missing valid position, content, or height',
          path: ['text'],
          details: { data }
        });
      }
      break;

    case 'DIMENSION':
      if (!isObject(data.geometry)) {
        issues.push({
          type: 'INVALID_DIMENSION',
          message: 'Dimension missing geometry data',
          path: ['geometry'],
          details: { data }
        });
      }
      break;

    case 'HATCH':
      if (!Array.isArray(data.boundaries)) {
        issues.push({
          type: 'INVALID_HATCH',
          message: 'Hatch missing boundary definitions',
          path: ['boundaries'],
          details: { data }
        });
      } else {
        data.boundaries.forEach((boundary, index) => {
          const boundaryIssues = validateHatchBoundary(boundary);
          if (boundaryIssues.length > 0) {
            issues.push(...boundaryIssues.map(issue => ({
              ...issue,
              path: ['boundaries', index.toString(), ...(issue.path || [])]
            })));
          }
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
