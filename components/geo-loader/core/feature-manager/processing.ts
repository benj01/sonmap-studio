import { Feature, FeatureCollection, Geometry, Position } from 'geojson';
import { coordinateSystemManager } from '../coordinate-system-manager';
import { GeoLoaderError } from '../errors/types';
import { ErrorReporterImpl as ErrorReporter } from '../errors/reporter';
import { CoordinateSystem } from '../../types/coordinates';
import { LogManager } from '../logging/log-manager';

const ZOOM_LEVEL_THRESHOLDS = {
  HIGH_DETAIL: 14,
  MEDIUM_DETAIL: 10,
  LOW_DETAIL: 6
};

const logger = LogManager.getInstance();

/**
 * Validate a coordinate pair
 */
function isValidCoordinate(coord: Position): boolean {
  return Array.isArray(coord) && 
         coord.length >= 2 && 
         typeof coord[0] === 'number' && 
         typeof coord[1] === 'number' &&
         isFinite(coord[0]) && 
         isFinite(coord[1]);
}

/**
 * Validate a geometry object
 */
function isValidGeometry(geometry: Geometry): boolean {
  if (!geometry || !geometry.type || !('coordinates' in geometry)) {
    return false;
  }

  switch (geometry.type) {
    case 'Point':
      return isValidCoordinate(geometry.coordinates);
    case 'LineString':
    case 'MultiPoint':
      return Array.isArray(geometry.coordinates) && 
             geometry.coordinates.every(isValidCoordinate);
    case 'Polygon':
    case 'MultiLineString':
      return Array.isArray(geometry.coordinates) && 
             geometry.coordinates.every(ring => 
               Array.isArray(ring) && ring.every(isValidCoordinate)
             );
    case 'MultiPolygon':
      return Array.isArray(geometry.coordinates) && 
             geometry.coordinates.every(poly => 
               Array.isArray(poly) && 
               poly.every(ring => 
                 Array.isArray(ring) && ring.every(isValidCoordinate)
               )
             );
    default:
      return false;
  }
}

export const transformCoordinates = async (
  coordinates: Position,
  fromSystem: CoordinateSystem,
  toSystem: CoordinateSystem,
  errorReporter: ErrorReporter
): Promise<Position | null> => {
  try {
    if (!isValidCoordinate(coordinates)) {
      errorReporter.addError(
        'Invalid coordinate values',
        'INVALID_COORDINATE',
        { coordinates }
      );
      return null;
    }

    const transformed = await coordinateSystemManager.transform(
      { x: coordinates[0], y: coordinates[1] },
      fromSystem,
      toSystem
    );

    if (!transformed || typeof transformed.x !== 'number' || typeof transformed.y !== 'number' ||
        !isFinite(transformed.x) || !isFinite(transformed.y)) {
      errorReporter.addError(
        'Invalid transformed coordinate values',
        'INVALID_TRANSFORMED_COORDINATE',
        { original: coordinates, transformed }
      );
      return null;
    }

    return coordinates.length > 2 
      ? [transformed.x, transformed.y, coordinates[2]]
      : [transformed.x, transformed.y];
  } catch (error) {
    errorReporter.addError(
      'Failed to transform coordinates',
      'COORDINATE_TRANSFORMATION_FAILED',
      { error: error instanceof Error ? error.message : String(error), coordinates }
    );
    return null;
  }
};

export const transformGeometry = async (
  geometry: Geometry,
  fromSystem: CoordinateSystem,
  toSystem: CoordinateSystem,
  errorReporter: ErrorReporter
): Promise<Geometry | null> => {
  if (!isValidGeometry(geometry)) {
    errorReporter.addError(
      'Invalid geometry structure',
      'INVALID_GEOMETRY',
      { geometryType: geometry.type || 'unknown' }
    );
    return null;
  }

  try {
    switch (geometry.type) {
      case 'Point': {
        const coords = await transformCoordinates(geometry.coordinates, fromSystem, toSystem, errorReporter);
        return coords ? { type: 'Point', coordinates: coords } : null;
      }
      case 'LineString': {
        logger.debug('LineString', 'Processing LineString transformation', {
          fromSystem,
          toSystem,
          originalCoordinates: geometry.coordinates.slice(0, 2),
          totalPoints: geometry.coordinates.length
        });

        const coords = await Promise.all(
          geometry.coordinates.map(async (coord, index) => {
            const transformed = await transformCoordinates(coord, fromSystem, toSystem, errorReporter);
            if (!transformed) {
              logger.warn('LineString', 'Failed to transform coordinate', {
                index,
                originalCoord: coord,
                fromSystem,
                toSystem
              });
            } else {
              logger.debug('LineString', 'Coordinate transformed', {
                index,
                original: coord,
                transformed,
                fromSystem,
                toSystem
              });
            }
            return transformed;
          })
        );
        const validCoords = coords.filter((coord): coord is Position => coord !== null);

        logger.debug('LineString', 'Transformation complete', {
          originalPoints: geometry.coordinates.length,
          validPoints: validCoords.length,
          firstPoint: validCoords[0],
          lastPoint: validCoords[validCoords.length - 1],
          fromSystem,
          toSystem
        });

        if (validCoords.length < 2) {
          logger.warn('LineString', 'Insufficient valid coordinates', {
            required: 2,
            found: validCoords.length,
            fromSystem,
            toSystem
          });
          return null;
        }

        return { type: 'LineString', coordinates: validCoords };
      }
      case 'Polygon': {
        const rings = await Promise.all(
          geometry.coordinates.map(async ring => {
            const coords = await Promise.all(
              ring.map(coord => transformCoordinates(coord, fromSystem, toSystem, errorReporter))
            );
            const validCoords = coords.filter((coord): coord is Position => coord !== null);
            return validCoords.length >= 4 ? validCoords : null;
          })
        );
        const validRings = rings.filter((ring): ring is Position[] => ring !== null);
        return validRings.length > 0 ? { type: 'Polygon', coordinates: validRings } : null;
      }
      case 'MultiPoint': {
        const coords = await Promise.all(
          geometry.coordinates.map(coord => 
            transformCoordinates(coord, fromSystem, toSystem, errorReporter)
          )
        );
        const validCoords = coords.filter((coord): coord is Position => coord !== null);
        return validCoords.length > 0 ? { type: 'MultiPoint', coordinates: validCoords } : null;
      }
      case 'MultiLineString': {
        const lines = await Promise.all(
          geometry.coordinates.map(async line => {
            const coords = await Promise.all(
              line.map(coord => transformCoordinates(coord, fromSystem, toSystem, errorReporter))
            );
            const validCoords = coords.filter((coord): coord is Position => coord !== null);
            return validCoords.length >= 2 ? validCoords : null;
          })
        );
        const validLines = lines.filter((line): line is Position[] => line !== null);
        return validLines.length > 0 ? { type: 'MultiLineString', coordinates: validLines } : null;
      }
      case 'MultiPolygon': {
        const polygons = await Promise.all(
          geometry.coordinates.map(async poly => {
            const rings = await Promise.all(
              poly.map(async ring => {
                const coords = await Promise.all(
                  ring.map(coord => transformCoordinates(coord, fromSystem, toSystem, errorReporter))
                );
                const validCoords = coords.filter((coord): coord is Position => coord !== null);
                return validCoords.length >= 4 ? validCoords : null;
              })
            );
            const validRings = rings.filter((ring): ring is Position[] => ring !== null);
            return validRings.length > 0 ? validRings : null;
          })
        );
        const validPolygons = polygons.filter((poly): poly is Position[][] => poly !== null);
        return validPolygons.length > 0 ? { type: 'MultiPolygon', coordinates: validPolygons } : null;
      }
      default:
        return null;
    }
  } catch (error) {
    errorReporter.addError(
      'Failed to transform geometry',
      'GEOMETRY_TRANSFORMATION_FAILED',
      { 
        error: error instanceof Error ? error.message : String(error),
        geometryType: geometry.type
      }
    );
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
