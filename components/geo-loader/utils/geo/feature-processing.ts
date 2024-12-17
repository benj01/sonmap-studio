import { Feature, FeatureCollection, Geometry, Position } from 'geojson';
import { CoordinateTransformer } from '../coordinate-utils';
import { isValidGeometry, isValidCoordinate } from '../validation/geometry';

const ZOOM_LEVEL_THRESHOLDS = {
  HIGH_DETAIL: 14,
  MEDIUM_DETAIL: 10,
  LOW_DETAIL: 6
};

export const transformCoordinates = (coordinates: Position, transformer: CoordinateTransformer): Position | null => {
  try {
    if (!isValidCoordinate(coordinates)) {
      return null;
    }

    const transformed = transformer.transform({ x: coordinates[0], y: coordinates[1] });
    if (!transformed || typeof transformed.x !== 'number' || typeof transformed.y !== 'number' ||
        !isFinite(transformed.x) || !isFinite(transformed.y)) {
      return null;
    }

    return coordinates.length > 2 
      ? [transformed.x, transformed.y, coordinates[2]]
      : [transformed.x, transformed.y];
  } catch (error) {
    console.error('Error transforming coordinates:', error);
    return null;
  }
};

export const transformGeometry = (geometry: Geometry, transformer: CoordinateTransformer): Geometry | null => {
  if (!isValidGeometry(geometry)) {
    return null;
  }

  try {
    switch (geometry.type) {
      case 'Point': {
        const coords = transformCoordinates(geometry.coordinates, transformer);
        return coords ? { type: 'Point', coordinates: coords } : null;
      }
      case 'LineString': {
        const coords = geometry.coordinates
          .map(coord => transformCoordinates(coord, transformer))
          .filter((coord): coord is Position => coord !== null);
        return coords.length >= 2 ? { type: 'LineString', coordinates: coords } : null;
      }
      case 'Polygon': {
        const rings = geometry.coordinates
          .map(ring => {
            const coords = ring
              .map(coord => transformCoordinates(coord, transformer))
              .filter((coord): coord is Position => coord !== null);
            return coords.length >= 4 ? coords : null;
          })
          .filter((ring): ring is Position[] => ring !== null);
        return rings.length > 0 ? { type: 'Polygon', coordinates: rings } : null;
      }
      case 'MultiPoint': {
        const coords = geometry.coordinates
          .map(coord => transformCoordinates(coord, transformer))
          .filter((coord): coord is Position => coord !== null);
        return coords.length > 0 ? { type: 'MultiPoint', coordinates: coords } : null;
      }
      case 'MultiLineString': {
        const lines = geometry.coordinates
          .map(line => {
            const coords = line
              .map(coord => transformCoordinates(coord, transformer))
              .filter((coord): coord is Position => coord !== null);
            return coords.length >= 2 ? coords : null;
          })
          .filter((line): line is Position[] => line !== null);
        return lines.length > 0 ? { type: 'MultiLineString', coordinates: lines } : null;
      }
      case 'MultiPolygon': {
        const polygons = geometry.coordinates
          .map(poly => {
            const rings = poly
              .map(ring => {
                const coords = ring
                  .map(coord => transformCoordinates(coord, transformer))
                  .filter((coord): coord is Position => coord !== null);
                return coords.length >= 4 ? coords : null;
              })
              .filter((ring): ring is Position[] => ring !== null);
            return rings.length > 0 ? rings : null;
          })
          .filter((poly): poly is Position[][] => poly !== null);
        return polygons.length > 0 ? { type: 'MultiPolygon', coordinates: polygons } : null;
      }
      default:
        return null;
    }
  } catch (error) {
    console.error('Error transforming geometry:', error);
    return null;
  }
};

const simplifyPoints = (points: Position[], factor: number): Position[] => {
  if (points.length <= 2) return points;
  return points.filter((_, i) => i % factor === 0 || i === points.length - 1);
};

export const simplifyGeometry = (geometry: Geometry, zoomLevel: number): Geometry => {
  if (zoomLevel >= ZOOM_LEVEL_THRESHOLDS.HIGH_DETAIL) {
    return geometry;
  }

  const simplificationFactor = zoomLevel < ZOOM_LEVEL_THRESHOLDS.MEDIUM_DETAIL ? 8 : 4;

  switch (geometry.type) {
    case 'LineString':
      return {
        type: 'LineString',
        coordinates: simplifyPoints(geometry.coordinates, simplificationFactor)
      };
    case 'Polygon':
      return {
        type: 'Polygon',
        coordinates: geometry.coordinates.map(ring => 
          simplifyPoints(ring, simplificationFactor)
        )
      };
    case 'MultiLineString':
      return {
        type: 'MultiLineString',
        coordinates: geometry.coordinates.map(line => 
          simplifyPoints(line, simplificationFactor)
        )
      };
    case 'MultiPolygon':
      return {
        type: 'MultiPolygon',
        coordinates: geometry.coordinates.map(poly => 
          poly.map(ring => simplifyPoints(ring, simplificationFactor))
        )
      };
    default:
      return geometry;
  }
};

export const processFeatures = (
  features: Feature[],
  maxVisibleFeatures: number,
  warnings?: Array<{
    type: string;
    message: string;
    entity?: {
      type: string;
      handle?: string;
      layer?: string;
    };
  }>
): Feature[] => {
  if (features.length <= maxVisibleFeatures) {
    return features;
  }

  const sampledFeatures: Feature[] = [];
  const samplingRate = Math.ceil(features.length / maxVisibleFeatures);
  const warningHandles = new Set(warnings?.map(w => w.entity?.handle).filter(Boolean));

  features.forEach((feature, index) => {
    const hasWarning = feature.properties?.handle && warningHandles.has(feature.properties.handle);
    if (hasWarning || index % samplingRate === 0) {
      sampledFeatures.push(feature);
    }
  });

  return sampledFeatures;
};
