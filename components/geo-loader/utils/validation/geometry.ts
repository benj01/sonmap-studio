import { Feature, Geometry, Position } from 'geojson';

export type Coordinate = Position;
export type Ring = Coordinate[];

export const isValidCoordinate = (coord: unknown): coord is Coordinate => {
  return Array.isArray(coord) && 
         coord.length >= 2 && 
         typeof coord[0] === 'number' && 
         typeof coord[1] === 'number' &&
         isFinite(coord[0]) && 
         isFinite(coord[1]);
};

export const isValidRing = (ring: unknown): ring is Ring => {
  return Array.isArray(ring) && 
         ring.length >= 4 && 
         ring.every(isValidCoordinate);
};

export const isValidGeometry = (geometry: unknown): geometry is Geometry => {
  if (!geometry || typeof geometry !== 'object' || !('type' in geometry) || !('coordinates' in geometry)) {
    return false;
  }

  const geo = geometry as any;
  switch (geo.type) {
    case 'Point':
      return isValidCoordinate(geo.coordinates);
    case 'LineString':
      return Array.isArray(geo.coordinates) && 
             geo.coordinates.length >= 2 &&
             geo.coordinates.every(isValidCoordinate);
    case 'Polygon':
      return Array.isArray(geo.coordinates) && 
             geo.coordinates.length > 0 &&
             geo.coordinates.every(isValidRing);
    case 'MultiPoint':
      return Array.isArray(geo.coordinates) &&
             geo.coordinates.every(isValidCoordinate);
    case 'MultiLineString':
      return Array.isArray(geo.coordinates) &&
             geo.coordinates.every((line: unknown) =>
               Array.isArray(line) && line.every(isValidCoordinate));
    case 'MultiPolygon':
      return Array.isArray(geo.coordinates) &&
             geo.coordinates.every((poly: unknown) =>
               Array.isArray(poly) && poly.every(isValidRing));
    default:
      return false;
  }
};
