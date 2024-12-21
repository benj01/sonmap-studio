import { Feature } from 'geojson';
import { DxfEntity } from '../../types';
import { SplineConverter } from './spline';
import { EllipseConverter } from './ellipse';
import { SolidConverter } from './solid';
import { Face3DConverter } from './face3d';
import { HatchConverter } from './hatch';
import { TextConverter } from './text';
import { DimensionConverter } from './dimension';

/**
 * Registry of geometry converters
 */
export class GeometryConverterRegistry {
  /**
   * Convert DXF entity to GeoJSON feature
   */
  static convertEntity(entity: DxfEntity): Feature | null {
    try {
      switch (entity.type) {
        case 'SPLINE':
          return SplineConverter.convert(entity);
        case 'ELLIPSE':
          return EllipseConverter.convert(entity);
        case 'SOLID':
          return SolidConverter.convert(entity);
        case 'FACE3D':
          return Face3DConverter.convert(entity);
        case 'HATCH':
          return HatchConverter.convert(entity);
        case 'TEXT':
        case 'MTEXT':
          return TextConverter.convert(entity);
        case 'DIMENSION':
          return DimensionConverter.convert(entity);
        default:
          return null;
      }
    } catch (error) {
      console.warn(`Failed to convert ${entity.type} entity:`, error);
      return null;
    }
  }
}
