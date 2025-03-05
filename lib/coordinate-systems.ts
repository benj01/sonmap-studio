import { EPSG } from '@/core/coordinates/coordinates';

interface CoordinateSystem {
  srid: number;
  authority: string;
  authorityCode: number;
  wkt: string;
  proj4: string;
}

// In-memory cache for coordinate systems
const coordinateSystemCache = new Map<number, CoordinateSystem>();

/**
 * Fetches coordinate system definition from the server
 * Uses in-memory caching to avoid unnecessary requests
 */
export async function getCoordinateSystem(srid: number): Promise<CoordinateSystem> {
  // Check cache first
  const cached = coordinateSystemCache.get(srid);
  if (cached) {
    return cached;
  }

  // Fetch from server
  const response = await fetch(`/api/coordinate-systems?srid=${srid}`);
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to fetch coordinate system');
  }

  const data = await response.json();
  
  // Cache the result
  coordinateSystemCache.set(srid, data);
  
  return data;
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
  await Promise.all(
    COMMON_SRIDS.map(srid => 
      getCoordinateSystem(srid).catch(error => 
        console.warn(`Failed to preload SRID ${srid}:`, error)
      )
    )
  );
} 