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
 * Preloads commonly used coordinate systems into cache
 * Call this during app initialization
 */
export async function preloadCommonCoordinateSystems(): Promise<void> {
  const commonSRIDs = [
    4326,  // WGS84
    3857,  // Web Mercator
    2056,  // Swiss LV95
    21781  // Swiss LV03
  ];

  await Promise.all(
    commonSRIDs.map(srid => 
      getCoordinateSystem(srid).catch(error => 
        console.warn(`Failed to preload SRID ${srid}:`, error)
      )
    )
  );
} 