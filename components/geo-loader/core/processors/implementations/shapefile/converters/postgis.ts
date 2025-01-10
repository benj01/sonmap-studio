import { ShapeType } from '../types';
import { ShapefileRecord } from '../types/records';
import { PostGISGeometry, PostGISFeature } from '../../../../../types/postgis';

type PostGISType = 'POINT' | 'LINESTRING' | 'POLYGON' | 'MULTIPOINT';

function getPostGISType(shapeType: number): PostGISType {
  switch (shapeType) {
    case ShapeType.POINT:
    case ShapeType.POINTZ:
    case ShapeType.POINTM:
      return 'POINT';
    case ShapeType.POLYLINE:
    case ShapeType.POLYLINEZ:
    case ShapeType.POLYLINEM:
      return 'LINESTRING';
    case ShapeType.POLYGON:
    case ShapeType.POLYGONZ:
    case ShapeType.POLYGONM:
      return 'POLYGON';
    case ShapeType.MULTIPOINT:
    case ShapeType.MULTIPOINTZ:
    case ShapeType.MULTIPOINTM:
      return 'MULTIPOINT';
    default:
      throw new Error(`Unsupported shape type: ${shapeType}`);
  }
}

/**
 * Convert shapefile records to PostGIS format
 */
export async function convertToPostGIS(records: ShapefileRecord[], srid: number = 4326): Promise<PostGISFeature[]> {
  return Promise.all(records.map(async (record): Promise<PostGISFeature> => {
    const geometry = await convertGeometryToPostGIS(record, srid);
    return {
      geometry,
      properties: record.attributes || {},
      srid
    };
  }));
}

/**
 * Convert shapefile geometry to PostGIS format
 */
export async function convertGeometryToPostGIS(record: ShapefileRecord, srid: number = 4326): Promise<PostGISGeometry> {
  const { shapeType, data } = record;
  const coordinates = data.coordinates;
  const type = getPostGISType(shapeType);

  return {
    type,
    coordinates,
    srid
  };
}

/**
 * Create a batch of PostGIS features for database import
 */
export function createPostGISBatch(features: PostGISFeature[], batchSize: number): PostGISFeature[][] {
  const batches: PostGISFeature[][] = [];
  for (let i = 0; i < features.length; i += batchSize) {
    batches.push(features.slice(i, i + batchSize));
  }
  return batches;
}
