import { dbLogger } from '@/utils/logging/dbLogger';
import { GeoFeature } from '@/types/geo';
import { Geometry, LineString, MultiLineString, MultiPoint, MultiPolygon, Point, Polygon } from 'geojson';
import * as turf from '@turf/turf';
import { FeatureProcessor, ProcessingContext, ProcessingResult, GeometryValidationResult } from './types';

export class GeometryValidator implements FeatureProcessor {
  async process(feature: GeoFeature, context: ProcessingContext): Promise<ProcessingResult> {
    const result: ProcessingResult = {
      feature: { ...feature },
      isValid: true,
      wasRepaired: false,
      warnings: [],
      errors: []
    };

    if (!context.validateGeometry) {
      return result;
    }

    try {
      const validationResult = await this.validateGeometry(feature.geometry);

      if (!validationResult.isValid) {
        result.isValid = false;
        result.errors.push(`Invalid geometry: ${validationResult.reason}`);

        if (context.repairGeometry && validationResult.repairedGeometry) {
          result.feature.geometry = validationResult.repairedGeometry;
          result.wasRepaired = true;
          result.warnings.push('Geometry was automatically repaired');
          await dbLogger.info('Geometry repaired', { featureId: feature.id }, { featureId: feature.id });
        }
      }
    } catch (error: unknown) {
      result.isValid = false;
      const errorMessage = isErrorWithMessage(error) ? error.message : 'Unknown error';
      result.errors.push(`Geometry validation failed: ${errorMessage}`);
      await dbLogger.error('Geometry validation failed', {
        error: errorMessage,
        featureId: feature.id
      }, { featureId: feature.id });
    }

    return result;
  }

  private async validateGeometry(geometry: Geometry): Promise<GeometryValidationResult> {
    const result: GeometryValidationResult = { isValid: true };

    try {
      switch (geometry.type) {
        case 'Point':
          if (!this.isValidPoint((geometry as Point).coordinates)) {
            result.isValid = false;
            result.reason = 'Invalid point coordinates';
          }
          break;

        case 'LineString':
          if (!this.isValidLineString((geometry as LineString).coordinates)) {
            result.isValid = false;
            result.reason = 'Invalid line coordinates or too few points';
            result.repairedGeometry = this.repairLineString(geometry as LineString);
          }
          break;

        case 'Polygon': {
          const polygonValidation = this.validatePolygon((geometry as Polygon).coordinates);
          if (!polygonValidation.isValid) {
            result.isValid = false;
            result.reason = polygonValidation.reason;
            result.repairedGeometry = this.repairPolygon(geometry as Polygon);
          }
          break;
        }

        case 'MultiPoint': {
          const multiPoint = geometry as MultiPoint;
          if (!multiPoint.coordinates.every(point => this.isValidPoint(point))) {
            result.isValid = false;
            result.reason = 'Invalid point in MultiPoint';
          }
          break;
        }

        case 'MultiLineString':
        case 'MultiPolygon': {
          const multiValidation = await this.validateMultiGeometry(geometry as MultiLineString | MultiPolygon);
          if (!multiValidation.isValid) {
            result.isValid = false;
            result.reason = multiValidation.reason;
            result.repairedGeometry = multiValidation.repairedGeometry;
          }
          break;
        }

        case 'GeometryCollection':
          for (const geom of geometry.geometries) {
            const subResult = await this.validateGeometry(geom);
            if (!subResult.isValid) {
              result.isValid = false;
              result.reason = `Invalid geometry in collection: ${subResult.reason}`;
              break;
            }
          }
          break;

        default:
          result.isValid = false;
          result.reason = `Unsupported geometry type: ${(geometry as Geometry).type}`;
      }
    } catch (error: unknown) {
      result.isValid = false;
      const errorMessage = isErrorWithMessage(error) ? error.message : 'Unknown error';
      result.reason = `Validation error: ${errorMessage}`;
    }

    return result;
  }

  private isValidPoint(coordinates: number[]): boolean {
    return (
      Array.isArray(coordinates) &&
      coordinates.length >= 2 && // At least 2 coordinates (longitude, latitude)
      coordinates.length <= 3 && // Maximum 3 coordinates (longitude, latitude, height)
      coordinates.every(coord => typeof coord === 'number' && !isNaN(coord))
    );
  }

  private isValidLineString(coordinates: number[][]): boolean {
    return (
      Array.isArray(coordinates) &&
      coordinates.length >= 2 &&
      coordinates.every(point => this.isValidPoint(point))
    );
  }

  private validatePolygon(coordinates: number[][][]): { isValid: boolean; reason?: string } {
    if (!Array.isArray(coordinates) || coordinates.length === 0) {
      return { isValid: false, reason: 'Invalid polygon structure' };
    }

    // Check each ring
    for (const ring of coordinates) {
      if (!this.isValidLineString(ring)) {
        return { isValid: false, reason: 'Invalid ring coordinates' };
      }

      // First and last points must be the same (only checking longitude and latitude)
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (!first || !last || first[0] !== last[0] || first[1] !== last[1]) {
        return { isValid: false, reason: 'Ring is not closed' };
      }
    }

    return { isValid: true };
  }

  private async validateMultiGeometry(geometry: MultiLineString | MultiPolygon): Promise<GeometryValidationResult> {
    const result: GeometryValidationResult = { isValid: true };
    const repairedParts: Geometry[] = [];
    let needsRepair = false;

    try {
      if (geometry.type === 'MultiLineString') {
        for (const line of geometry.coordinates) {
          if (!this.isValidLineString(line)) {
            needsRepair = true;
            const repaired = this.repairLineString({ type: 'LineString', coordinates: line });
            repairedParts.push(repaired);
          } else {
            repairedParts.push({ type: 'LineString', coordinates: line });
          }
        }
      } else if (geometry.type === 'MultiPolygon') {
        for (const polygon of geometry.coordinates) {
          const validation = this.validatePolygon(polygon);
          if (!validation.isValid) {
            needsRepair = true;
            const repaired = this.repairPolygon({ type: 'Polygon', coordinates: polygon });
            repairedParts.push(repaired);
          } else {
            repairedParts.push({ type: 'Polygon', coordinates: polygon });
          }
        }
      }

      if (needsRepair) {
        result.isValid = false;
        result.reason = `Invalid parts in ${geometry.type}`;
        result.repairedGeometry = {
          type: geometry.type,
          coordinates: repairedParts.map(p => 'coordinates' in p ? p.coordinates : [])
        } as Geometry;
      }
    } catch (error: unknown) {
      result.isValid = false;
      const errorMessage = isErrorWithMessage(error) ? error.message : 'Unknown error';
      result.reason = `Multi-geometry validation error: ${errorMessage}`;
    }

    return result;
  }

  private repairLineString(geometry: LineString): LineString {
    try {
      // Remove duplicate points
      const coordinates = geometry.coordinates.filter((coord, index, array) => {
        if (index === 0) return true;
        const prev = array[index - 1];
        return !(coord[0] === prev[0] && coord[1] === prev[1]);
      });

      // Ensure minimum points
      if (coordinates.length < 2) {
        throw new Error('Cannot repair line with fewer than 2 unique points');
      }

      return {
        type: 'LineString',
        coordinates
      };
    } catch {
      return geometry;
    }
  }

  private repairPolygon(geometry: Polygon): Polygon {
    try {
      const turfFeature = turf.feature(geometry);
      const cleaned = turf.cleanCoords(turfFeature);
      const buffered = turf.buffer(cleaned, 0);
      return (buffered?.geometry || geometry) as Polygon;
    } catch {
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