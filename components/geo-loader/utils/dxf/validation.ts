import { Vector3, DxfEntity, DxfData } from './types';

export function isValidVector(vector: Vector3 | undefined): boolean {
  return vector !== undefined && 
         typeof vector.x === 'number' && 
         typeof vector.y === 'number' && 
         isFinite(vector.x) && 
         isFinite(vector.y) &&
         (vector.z === undefined || (typeof vector.z === 'number' && isFinite(vector.z)));
}

export function validateEntity(entity: DxfEntity): string[] {
  const errors: string[] = [];

  if (!entity.type) {
    errors.push('Entity missing type');
    return errors;
  }

  const handle = entity.handle || 'unknown';

  switch (entity.type) {
    case '3DFACE': {
      if (!entity.vertices.every(isValidVector)) {
        errors.push(`Invalid vertices in 3DFACE entity ${handle}`);
      }
      break;
    }

    case 'POINT': {
      if (!isValidVector(entity.position)) {
        errors.push(`Invalid position in POINT entity ${handle}`);
      }
      break;
    }

    case 'LINE': {
      if (!isValidVector(entity.start)) {
        errors.push(`Invalid start point in LINE entity ${handle}`);
      }
      if (!isValidVector(entity.end)) {
        errors.push(`Invalid end point in LINE entity ${handle}`);
      }
      break;
    }

    case 'POLYLINE':
    case 'LWPOLYLINE': {
      if (!Array.isArray(entity.vertices)) {
        errors.push(`Missing vertices array in POLYLINE entity ${handle}`);
      } else if (entity.vertices.length < 2) {
        errors.push(`Insufficient vertices in POLYLINE entity ${handle}`);
      } else if (!entity.vertices.every(isValidVector)) {
        errors.push(`Invalid vertices in POLYLINE entity ${handle}`);
      }
      break;
    }

    case 'CIRCLE': {
      if (!isValidVector(entity.center)) {
        errors.push(`Invalid center in CIRCLE entity ${handle}`);
      }
      if (typeof entity.radius !== 'number' || !isFinite(entity.radius) || entity.radius <= 0) {
        errors.push(`Invalid radius in CIRCLE entity ${handle}`);
      }
      break;
    }

    case 'ARC': {
      if (!isValidVector(entity.center)) {
        errors.push(`Invalid center in ARC entity ${handle}`);
      }
      if (typeof entity.radius !== 'number' || !isFinite(entity.radius) || entity.radius <= 0) {
        errors.push(`Invalid radius in ARC entity ${handle}`);
      }
      if (typeof entity.startAngle !== 'number' || !isFinite(entity.startAngle)) {
        errors.push(`Invalid start angle in ARC entity ${handle}`);
      }
      if (typeof entity.endAngle !== 'number' || !isFinite(entity.endAngle)) {
        errors.push(`Invalid end angle in ARC entity ${handle}`);
      }
      break;
    }

    case 'ELLIPSE': {
      if (!isValidVector(entity.center)) {
        errors.push(`Invalid center in ELLIPSE entity ${handle}`);
      }
      if (!isValidVector(entity.majorAxis)) {
        errors.push(`Invalid major axis in ELLIPSE entity ${handle}`);
      }
      if (typeof entity.minorAxisRatio !== 'number' || !isFinite(entity.minorAxisRatio)) {
        errors.push(`Invalid minor axis ratio in ELLIPSE entity ${handle}`);
      }
      if (typeof entity.startAngle !== 'number' || !isFinite(entity.startAngle)) {
        errors.push(`Invalid start angle in ELLIPSE entity ${handle}`);
      }
      if (typeof entity.endAngle !== 'number' || !isFinite(entity.endAngle)) {
        errors.push(`Invalid end angle in ELLIPSE entity ${handle}`);
      }
      break;
    }
  }

  return errors;
}

export function validateDxfData(data: DxfData): string[] {
  const errors: string[] = [];

  // Validate entities array
  if (!Array.isArray(data.entities)) {
    errors.push('DXF data has no valid entities array');
    return errors;
  }

  // Validate each entity
  data.entities.forEach((entity, index) => {
    const entityErrors = validateEntity(entity);
    if (entityErrors.length > 0) {
      errors.push(`Entity ${index} (${entity.type}) validation errors:`);
      errors.push(...entityErrors.map(err => `  - ${err}`));
    }
  });

  // Validate blocks if present
  if (data.blocks) {
    Object.entries(data.blocks).forEach(([name, block]) => {
      if (!block.entities || !Array.isArray(block.entities)) {
        errors.push(`Block "${name}" has no valid entities array`);
      } else {
        block.entities.forEach((entity, index) => {
          const entityErrors = validateEntity(entity);
          if (entityErrors.length > 0) {
            errors.push(`Block "${name}" entity ${index} (${entity.type}) validation errors:`);
            errors.push(...entityErrors.map(err => `  - ${err}`));
          }
        });
      }
    });
  }

  return errors;
}
