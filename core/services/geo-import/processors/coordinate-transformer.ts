import { createLogger } from '@/utils/logger';
import { GeoFeature } from '@/types/geo';
import { Position, Geometry } from 'geojson';
import proj4 from 'proj4';
import { getCoordinateSystem } from '@/lib/coordinate-systems';
import { FeatureProcessor, ProcessingContext, ProcessingResult } from './types';
import { LogManager, LogLevel } from '@/core/logging/log-manager';

const logger = createLogger('CoordinateTransformer');
const logManager = LogManager.getInstance();
logManager.setComponentLogLevel('CoordinateTransformer', LogLevel.DEBUG);

export class CoordinateTransformer implements FeatureProcessor {
  async process(feature: GeoFeature, context: ProcessingContext): Promise<ProcessingResult> {
    const result: ProcessingResult = {
      feature: { ...feature },
      isValid: true,
      wasRepaired: false,
      warnings: [],
      errors: []
    };

    if (!context.sourceSrid || !context.targetSrid || context.sourceSrid === context.targetSrid) {
      return result;
    }

    try {
      result.feature.geometry = await this.transformGeometry(
        feature.geometry,
        context.sourceSrid,
        context.targetSrid
      );
    } catch (error: any) {
      result.isValid = false;
      result.errors.push(`Failed to transform coordinates: ${error?.message || 'Unknown error'}`);
      logger.error('Coordinate transformation failed', { 
        error: error?.message || 'Unknown error',
        featureId: feature.id 
      });
    }

    return result;
  }

  private async transformCoordinates(
    coords: Position,
    fromSrid: number,
    toSrid: number
  ): Promise<Position> {
    try {
      const fromSystem = await getCoordinateSystem(fromSrid);
      const toSystem = await getCoordinateSystem(toSrid);

      if (!proj4.defs(`EPSG:${fromSrid}`)) {
        proj4.defs(`EPSG:${fromSrid}`, fromSystem.proj4);
      }
      if (!proj4.defs(`EPSG:${toSrid}`)) {
        proj4.defs(`EPSG:${toSrid}`, toSystem.proj4);
      }

      const result = proj4(`EPSG:${fromSrid}`, `EPSG:${toSrid}`, coords);
      logManager.debug('CoordinateTransformer', 'Coordinate transformation', {
        fromSrid,
        toSrid,
        input: coords,
        output: result
      });
      if (result[0] < 5 || result[0] > 11 || result[1] < 45 || result[1] > 48) {
        logManager.warn('CoordinateTransformer', 'Transformed coordinates out of Swiss bounds', { result });
      }
      return result;
    } catch (error) {
      logManager.warn('CoordinateTransformer', 'Failed to transform coordinates', { error, coords, fromSrid, toSrid });
      throw error;
    }
  }

  private async transformGeometry(
    geometry: Geometry,
    fromSrid: number,
    toSrid: number
  ): Promise<Geometry> {
    logManager.debug('CoordinateTransformer', 'Transforming geometry', { geometryType: geometry.type, fromSrid, toSrid });
    switch (geometry.type) {
      case 'Point':
        return {
          ...geometry,
          coordinates: await this.transformCoordinates(geometry.coordinates, fromSrid, toSrid)
        };
      case 'LineString':
      case 'MultiPoint':
        return {
          ...geometry,
          coordinates: await Promise.all(
            geometry.coordinates.map(coord => this.transformCoordinates(coord, fromSrid, toSrid))
          )
        };
      case 'Polygon':
      case 'MultiLineString':
        return {
          ...geometry,
          coordinates: await Promise.all(
            geometry.coordinates.map(async ring =>
              await Promise.all(ring.map(coord => this.transformCoordinates(coord, fromSrid, toSrid)))
            )
          )
        };
      case 'MultiPolygon':
        return {
          ...geometry,
          coordinates: await Promise.all(
            geometry.coordinates.map(async polygon =>
              await Promise.all(
                polygon.map(async ring =>
                  await Promise.all(ring.map(coord => this.transformCoordinates(coord, fromSrid, toSrid)))
                )
              )
            )
          )
        };
      case 'GeometryCollection':
        return {
          ...geometry,
          geometries: await Promise.all(
            geometry.geometries.map(g => this.transformGeometry(g, fromSrid, toSrid))
          )
        };
      default:
        return geometry;
    }
  }
} 