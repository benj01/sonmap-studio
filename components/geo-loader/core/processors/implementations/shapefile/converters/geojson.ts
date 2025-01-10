import { Feature, Position, Point, LineString, Polygon, MultiPoint, Geometry, BBox } from 'geojson';
import { ShapeType } from '../types';
import { ShapefileRecord, ShapefileAttributes } from '../types/records';

type ShapeGeometry = Point | LineString | Polygon | MultiPoint;

interface GeometryMapping {
  type: 'Point' | 'LineString' | 'Polygon' | 'MultiPoint';
  coordinates: Position | Position[] | Position[][];
  bbox?: BBox;
}

function createBBox(bbox: { xMin: number; yMin: number; xMax: number; yMax: number }): BBox {
  return [bbox.xMin, bbox.yMin, bbox.xMax, bbox.yMax];
}

function createGeometry(shapeType: number, coordinates: Position | Position[] | Position[][], bbox?: BBox): ShapeGeometry {
  console.debug('[GeoJSON Converter] Creating geometry:', {
    type: ShapeType[shapeType],
    coordinates,
    bbox
  });

  switch (shapeType) {
    case ShapeType.POINT:
    case ShapeType.POINTZ:
    case ShapeType.POINTM:
      return {
        type: 'Point',
        coordinates: coordinates as Position,
        bbox
      };
    case ShapeType.POLYLINE:
    case ShapeType.POLYLINEZ:
    case ShapeType.POLYLINEM:
      return {
        type: 'LineString',
        coordinates: coordinates as Position[],
        bbox
      };
    case ShapeType.POLYGON:
    case ShapeType.POLYGONZ:
    case ShapeType.POLYGONM:
      return {
        type: 'Polygon',
        coordinates: coordinates as Position[][],
        bbox
      };
    case ShapeType.MULTIPOINT:
    case ShapeType.MULTIPOINTZ:
    case ShapeType.MULTIPOINTM:
      return {
        type: 'MultiPoint',
        coordinates: coordinates as Position[],
        bbox
      };
    default:
      throw new Error(`Unsupported shape type: ${shapeType}`);
  }
}

/**
 * Convert shapefile records to GeoJSON features
 */
export function convertToGeoJSON(records: ShapefileRecord[]): Feature[] {
  console.debug('[GeoJSON Converter] Converting records:', {
    count: records.length,
    firstRecord: records[0]
  });

  return records.map((record, index): Feature => {
    const { shapeType, data } = record;
    const bbox = data.bbox ? createBBox(data.bbox) : undefined;
    const geometry = createGeometry(shapeType, data.coordinates, bbox);

    const feature: Feature = {
      type: 'Feature',
      geometry,
      properties: record.attributes || {},
      bbox
    };

    if (index === 0 || index === records.length - 1) {
      console.debug(`[GeoJSON Converter] Converted ${index === 0 ? 'first' : 'last'} feature:`, {
        shapeType: ShapeType[shapeType],
        bbox,
        geometryType: geometry.type,
        properties: feature.properties
      });
    }

    return feature;
  });
}

/**
 * Convert GeoJSON features back to shapefile records
 * This is useful when we need to convert modified features back to the original format
 */
export function convertFromGeoJSON(features: Feature[]): ShapefileRecord[] {
  console.debug('[GeoJSON Converter] Converting features back to records:', {
    count: features.length,
    firstFeature: features[0]
  });

  return features.map((feature, index): ShapefileRecord => {
    const { geometry, properties } = feature;
    let shapeType: number;
    let coordinates: Position | Position[] | Position[][];

    switch (geometry.type) {
      case 'Point':
        shapeType = ShapeType.POINT;
        coordinates = geometry.coordinates;
        break;
      case 'LineString':
        shapeType = ShapeType.POLYLINE;
        coordinates = geometry.coordinates;
        break;
      case 'Polygon':
        shapeType = ShapeType.POLYGON;
        coordinates = geometry.coordinates;
        break;
      case 'MultiPoint':
        shapeType = ShapeType.MULTIPOINT;
        coordinates = geometry.coordinates;
        break;
      default:
        throw new Error(`Unsupported geometry type: ${geometry.type}`);
    }

    const bbox = feature.bbox ? {
      xMin: feature.bbox[0],
      yMin: feature.bbox[1],
      xMax: feature.bbox[2],
      yMax: feature.bbox[3]
    } : undefined;

    // Create attributes with required recordNumber
    const attributes: ShapefileAttributes = {
      recordNumber: index + 1,
      ...properties as Record<string, string | number | boolean | null>
    };

    const record: ShapefileRecord = {
      header: {
        recordNumber: index + 1,
        contentLength: 0 // This will be calculated when writing the file
      },
      shapeType,
      data: {
        coordinates,
        bbox
      },
      attributes
    };

    if (index === 0 || index === features.length - 1) {
      console.debug(`[GeoJSON Converter] Converted ${index === 0 ? 'first' : 'last'} record:`, {
        shapeType: ShapeType[shapeType],
        bbox,
        attributes: record.attributes
      });
    }

    return record;
  });
}
