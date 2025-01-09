import { CoordinateSystem, COORDINATE_SYSTEMS } from '../../../../../types/coordinates';
import { CoordinateSystemWithSRID } from './bounds';

/**
 * PostGIS coordinate system with strict typing
 */
export interface PostGISCoordinateSystem extends CoordinateSystemWithSRID {
  /** Identifies this as a PostGIS coordinate system */
  type: 'PostGIS';
  /** System name */
  name: string;
  /** System code */
  code: string;
  /** Spatial reference identifier */
  srid: number;
  /** Optional system units */
  units?: string;
  /** Optional system description */
  description?: string;
}

/**
 * Map of SRID values for each coordinate system
 */
const COORDINATE_SYSTEM_SRIDS: Record<CoordinateSystem, number> = {
  [COORDINATE_SYSTEMS.NONE]: 4326,
  [COORDINATE_SYSTEMS.WGS84]: 4326,
  [COORDINATE_SYSTEMS.SWISS_LV95]: 2056,
  [COORDINATE_SYSTEMS.SWISS_LV03]: 21781,
};

/**
 * Create a PostGIS coordinate system from a base coordinate system
 * @throws {Error} If the coordinate system is not supported
 */
export function createPostGISCoordinateSystem(base: CoordinateSystem | undefined): PostGISCoordinateSystem {
  // Default to WGS84 for undefined or NONE systems
  if (!base || base === COORDINATE_SYSTEMS.NONE) {
    return {
      type: 'PostGIS',
      name: 'WGS84',
      code: COORDINATE_SYSTEMS.WGS84,
      srid: COORDINATE_SYSTEM_SRIDS[COORDINATE_SYSTEMS.WGS84],
      description: 'Default WGS84 coordinate system'
    };
  }

  // Validate the coordinate system is supported
  if (!(base in COORDINATE_SYSTEM_SRIDS)) {
    throw new Error(`Unsupported coordinate system: ${base}`);
  }

  return {
    type: 'PostGIS',
    name: base,
    code: base,
    srid: COORDINATE_SYSTEM_SRIDS[base],
    description: `Converted from ${base}`
  };
}

/**
 * Type guard to check if a coordinate system is a PostGIS coordinate system
 */
export function isPostGISCoordinateSystem(system: unknown): system is PostGISCoordinateSystem {
  if (!system || typeof system !== 'object') {
    return false;
  }
  
  const sys = system as Record<string, unknown>;
  return (
    sys.type === 'PostGIS' &&
    typeof sys.name === 'string' &&
    typeof sys.code === 'string' &&
    typeof sys.srid === 'number' &&
    (sys.units === undefined || typeof sys.units === 'string') &&
    (sys.description === undefined || typeof sys.description === 'string')
  );
}

/**
 * Convert PostGIS coordinate system to base coordinate system
 */
export function toBaseCoordinateSystem(system: PostGISCoordinateSystem | CoordinateSystem | undefined): CoordinateSystem | undefined {
  if (!system) {
    return undefined;
  }

  if (isPostGISCoordinateSystem(system)) {
    return system.code as CoordinateSystem;
  }

  return system;
}

/**
 * Convert base coordinate system to PostGIS coordinate system
 */
export function toPostGISCoordinateSystem(system: CoordinateSystem | PostGISCoordinateSystem | undefined): PostGISCoordinateSystem | undefined {
  if (!system) {
    return undefined;
  }

  if (isPostGISCoordinateSystem(system)) {
    return system;
  }

  return createPostGISCoordinateSystem(system);
}

/**
 * Get SRID from a coordinate system
 */
export function getCoordinateSystemSRID(system: CoordinateSystem | undefined): number {
  if (!system || system === COORDINATE_SYSTEMS.NONE) {
    return COORDINATE_SYSTEM_SRIDS[COORDINATE_SYSTEMS.NONE];
  }

  return COORDINATE_SYSTEM_SRIDS[system];
}
