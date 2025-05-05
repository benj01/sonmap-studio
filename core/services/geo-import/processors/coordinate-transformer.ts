import { dbLogger } from '@/utils/logging/dbLogger';
import { GeoFeature } from '@/types/geo';
import { Position, Geometry } from 'geojson';
import proj4 from 'proj4';
import { getCoordinateSystem } from '@/lib/coordinate-systems';
import { FeatureProcessor, ProcessingContext, ProcessingResult } from './types';

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
    } catch (error: unknown) {
      result.isValid = false;
      const errorMessage = isErrorWithMessage(error) ? error.message : 'Unknown error';
      result.errors.push(`Failed to transform coordinates: ${errorMessage}`);
      await dbLogger.error('Coordinate transformation failed', {
        error: errorMessage,
        featureId: feature.id,
        sourceSrid: context.sourceSrid,
        targetSrid: context.targetSrid
      }, { featureId: feature.id, sourceSrid: context.sourceSrid, targetSrid: context.targetSrid });
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
      await dbLogger.debug('Coordinate transformation', {
        fromSrid,
        toSrid,
        input: coords,
        output: result
      }, { fromSrid, toSrid });
      if (result[0] < 5 || result[0] > 11 || result[1] < 45 || result[1] > 48) {
        await dbLogger.warn('Transformed coordinates out of Swiss bounds', { result }, { fromSrid, toSrid });
      }
      return result;
    } catch (error) {
      await dbLogger.warn('Failed to transform coordinates', { error, coords, fromSrid, toSrid }, { fromSrid, toSrid });
      throw error;
    }
  }

  private async transformGeometry(
    geometry: Geometry,
    fromSrid: number,
    toSrid: number
  ): Promise<Geometry> {
    await dbLogger.debug('Transforming geometry', { geometryType: geometry.type, fromSrid, toSrid }, { fromSrid, toSrid });
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

function isErrorWithMessage(error: unknown): error is { message: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  );
} 