/**
 * Mapbox projection configuration
 */
export interface MapboxProjection {
  name: 'mercator' | 'globe' | 'naturalEarth' | 'equalEarth' | 'winkelTripel' | 'albers' | 'lambertConformalConic' | 'equirectangular';
  center: [number, number];
  parallels?: [number, number];
}
