import { EPSG } from '@/core/coordinates/coordinates';
import { createLogger } from '@/utils/logger';

const logger = createLogger('CoordinateSystems');

interface CoordinateSystem {
  srid: number;
  authority: string;
  authorityCode: number;
  wkt: string;
  proj4: string;
}

// In-memory cache for coordinate systems
const coordinateSystemCache = new Map<number, CoordinateSystem>();
const pendingRequests = new Map<number, Promise<CoordinateSystem>>();

/**
 * Fetches coordinate system definition from the server
 * Uses in-memory caching to avoid unnecessary requests
 * Implements request deduplication to prevent multiple simultaneous requests for the same SRID
 */
export async function getCoordinateSystem(srid: number): Promise<CoordinateSystem> {
  // Check cache first
  const cached = coordinateSystemCache.get(srid);
  if (cached) {
    return cached;
  }

  // Check if there's already a pending request for this SRID
  const pending = pendingRequests.get(srid);
  if (pending) {
    return pending;
  }

  // Create new request
  const request = (async () => {
    try {
      const response = await fetch(`/api/coordinate-systems?srid=${srid}`);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to fetch coordinate system');
      }

      const data = await response.json();
      
      // Cache the result
      coordinateSystemCache.set(srid, data);
      
      return data;
    } catch (error) {
      logger.error(`Failed to fetch coordinate system for SRID ${srid}`, { error });
      throw error;
    } finally {
      // Clean up pending request
      pendingRequests.delete(srid);
    }
  })();

  // Store the pending request
  pendingRequests.set(srid, request);
  
  return request;
}

/**
 * List of commonly used coordinate systems that should be preloaded
 */
const COMMON_SRIDS = [
  EPSG.WGS84,      // WGS84
  EPSG.WEB_MERCATOR, // Web Mercator
  EPSG.SWISS_LV95,   // Swiss LV95
  EPSG.SWISS_LV03    // Swiss LV03
] as const;

/**
 * Preloads commonly used coordinate systems into cache
 * Call this during app initialization
 */
export async function preloadCommonCoordinateSystems(): Promise<void> {
  const COMMON_SRIDS = [
    EPSG.WGS84,      // WGS84
    EPSG.WEB_MERCATOR, // Web Mercator
    EPSG.SWISS_LV95,   // Swiss LV95
  ];

  try {
    await Promise.all(COMMON_SRIDS.map(srid => getCoordinateSystem(srid)));
  } catch (error) {
    logger.warn('Failed to preload some coordinate systems', { error });
  }
} 