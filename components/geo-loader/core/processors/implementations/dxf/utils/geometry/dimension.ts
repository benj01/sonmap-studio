import { Feature, FeatureCollection } from 'geojson';
import { DxfEntity, DimensionGeometry, DimensionMeasurement, Vector3 } from '../../types';
import { ValidationError } from '../../../../../errors/types';
import { TextConverter } from './text';

/**
 * Handles conversion of DIMENSION entities to GeoJSON features
 * Uses a hybrid approach:
 * - Converts dimensions to basic geometries (lines + text) for visualization
 * - Preserves dimension metadata and measurements for semantic handling
 */
export class DimensionConverter {
  /**
   * Convert DIMENSION entity to GeoJSON feature collection
   * Returns multiple features representing dimension components
   */
  static convert(entity: DxfEntity): Feature {
    const { geometry, measurement } = this.extractDimensionData(entity);
    this.validateDimensionData(geometry, measurement);

    // Create features for dimension components
    const components = this.createDimensionComponents(entity, geometry, measurement);

    // Return as feature collection with dimension metadata
    return {
      type: 'Feature',
      geometry: {
        type: 'GeometryCollection',
        geometries: components.features.map(f => f.geometry)
      },
      properties: {
        entityType: 'DIMENSION',
        dimType: entity.data.dimType,
        measurement: {
          value: measurement.value,
          unit: measurement.unit,
          prefix: measurement.prefix,
          suffix: measurement.suffix,
          override: measurement.override
        },
        style: {
          dimStyle: entity.data.dimStyle,
          dimScale: entity.data.dimScale,
          dimRotation: entity.data.dimRotation,
          dimArrowSize: entity.data.dimArrowSize,
          dimLineGap: entity.data.dimLineGap,
          dimExtension: entity.data.dimExtension
        },
        color: entity.attributes.color,
        layer: entity.attributes.layer
      }
    };
  }

  /**
   * Extract dimension data from entity
   */
  private static extractDimensionData(entity: DxfEntity): {
    geometry: DimensionGeometry;
    measurement: DimensionMeasurement;
  } {
    const data = entity.data;

    // Extract geometry points
    const geometry: DimensionGeometry = {
      defPoint: this.extractPoint(data, 'defPoint'),
      defPoint2: this.extractPoint(data, 'defPoint2'),
      defPoint3: this.extractPoint(data, 'defPoint3'),
      defPoint4: this.extractPoint(data, 'defPoint4'),
      textMid: this.extractPoint(data, 'textMid'),
      ext1Start: this.extractPoint(data, 'ext1Start'),
      ext1End: this.extractPoint(data, 'ext1End'),
      ext2Start: this.extractPoint(data, 'ext2Start'),
      ext2End: this.extractPoint(data, 'ext2End'),
      arrow1: this.extractPoint(data, 'arrow1'),
      arrow2: this.extractPoint(data, 'arrow2')
    };

    // Extract measurement data
    const measurement: DimensionMeasurement = {
      value: typeof data.measurement?.value === 'number' ? data.measurement.value : 0,
      unit: data.measurement?.unit,
      prefix: data.measurement?.prefix,
      suffix: data.measurement?.suffix,
      override: data.measurement?.override
    };

    return { geometry, measurement };
  }

  /**
   * Extract point from data
   */
  private static extractPoint(data: any, key: string): Vector3 | undefined {
    if (!data.geometry?.[key]) return undefined;
    const point = data.geometry[key];
    return {
      x: typeof point.x === 'number' ? point.x : 0,
      y: typeof point.y === 'number' ? point.y : 0,
      z: typeof point.z === 'number' ? point.z : 0
    };
  }

  /**
   * Validate dimension data
   */
  private static validateDimensionData(
    geometry: DimensionGeometry,
    measurement: DimensionMeasurement
  ): void {
    // Validate required geometry points based on dimension type
    if (!geometry.defPoint || !this.isValidPoint(geometry.defPoint)) {
      throw new ValidationError(
        'Invalid dimension definition point',
        'INVALID_DIMENSION_POINT'
      );
    }

    // Validate measurement value
    if (typeof measurement.value !== 'number' || !isFinite(measurement.value)) {
      throw new ValidationError(
        'Invalid dimension measurement value',
        'INVALID_MEASUREMENT'
      );
    }
  }

  /**
   * Create dimension component features
   */
  private static createDimensionComponents(
    entity: DxfEntity,
    geometry: DimensionGeometry,
    measurement: DimensionMeasurement
  ): FeatureCollection {
    const features: Feature[] = [];

    // Add extension lines
    if (geometry.ext1Start && geometry.ext1End) {
      features.push(this.createLineFeature(
        [geometry.ext1Start, geometry.ext1End],
        'extension1'
      ));
    }
    if (geometry.ext2Start && geometry.ext2End) {
      features.push(this.createLineFeature(
        [geometry.ext2Start, geometry.ext2End],
        'extension2'
      ));
    }

    // Add dimension line
    if (geometry.arrow1 && geometry.arrow2) {
      features.push(this.createLineFeature(
        [geometry.arrow1, geometry.arrow2],
        'dimension'
      ));
    }

    // Add arrows
    if (geometry.arrow1) {
      features.push(...this.createArrowFeatures(
        geometry.arrow1,
        entity.data.dimArrowSize ?? 1,
        entity.data.dimRotation ?? 0,
        'arrow1'
      ));
    }
    if (geometry.arrow2) {
      features.push(...this.createArrowFeatures(
        geometry.arrow2,
        entity.data.dimArrowSize ?? 1,
        (entity.data.dimRotation ?? 0) + 180,
        'arrow2'
      ));
    }

    // Add measurement text
    if (geometry.textMid) {
      const textEntity: DxfEntity = {
        type: 'TEXT',
        attributes: entity.attributes,
        data: {
          x: geometry.textMid.x,
          y: geometry.textMid.y,
          z: geometry.textMid.z,
          text: measurement.override || 
                `${measurement.prefix || ''}${measurement.value}${measurement.suffix || ''}`,
          height: entity.data.height,
          rotation: entity.data.dimRotation,
          style: entity.data.dimStyle,
          alignment: 'CENTER',
          verticalAlignment: 'MIDDLE'
        }
      };
      features.push(TextConverter.convert(textEntity));
    }

    return {
      type: 'FeatureCollection',
      features
    };
  }

  /**
   * Create line feature from points
   */
  private static createLineFeature(points: Vector3[], type: string): Feature {
    return {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: points.map(p => [p.x, p.y, p.z ?? 0])
      },
      properties: {
        componentType: type
      }
    };
  }

  /**
   * Create arrow features
   */
  private static createArrowFeatures(
    point: Vector3,
    size: number,
    rotation: number,
    type: string
  ): Feature[] {
    const rad = (rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    // Create arrow as two lines from tip
    const tip: [number, number, number] = [point.x, point.y, point.z ?? 0];
    const back1: [number, number, number] = [
      point.x - size * cos - size * 0.5 * sin,
      point.y - size * sin + size * 0.5 * cos,
      point.z ?? 0
    ];
    const back2: [number, number, number] = [
      point.x - size * cos + size * 0.5 * sin,
      point.y - size * sin - size * 0.5 * cos,
      point.z ?? 0
    ];

    return [
      {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [tip, back1]
        },
        properties: {
          componentType: `${type}_line1`
        }
      },
      {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [tip, back2]
        },
        properties: {
          componentType: `${type}_line2`
        }
      }
    ];
  }

  /**
   * Check if point coordinates are valid numbers
   */
  private static isValidPoint(point: Vector3): boolean {
    return (
      typeof point.x === 'number' &&
      typeof point.y === 'number' &&
      isFinite(point.x) &&
      isFinite(point.y) &&
      (point.z === undefined || (typeof point.z === 'number' && isFinite(point.z)))
    );
  }
}
