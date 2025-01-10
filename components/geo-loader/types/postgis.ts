/**
 * PostGIS geometry types
 */
export type PostGISGeometryType = 
  | 'POINT'
  | 'LINESTRING'
  | 'POLYGON'
  | 'MULTIPOINT'
  | 'MULTILINESTRING'
  | 'MULTIPOLYGON'
  | 'GEOMETRYCOLLECTION';

/**
 * Base PostGIS geometry interface
 */
export interface PostGISGeometry {
  type: PostGISGeometryType;
  srid: number;
  coordinates: number[] | number[][] | number[][][] | number[][][][];
}

/**
 * PostGIS point geometry
 */
export interface PostGISPoint extends PostGISGeometry {
  type: 'POINT';
  coordinates: number[]; // [x, y] or [x, y, z]
}

/**
 * PostGIS linestring geometry
 */
export interface PostGISLineString extends PostGISGeometry {
  type: 'LINESTRING';
  coordinates: number[][]; // Array of points
}

/**
 * PostGIS polygon geometry
 */
export interface PostGISPolygon extends PostGISGeometry {
  type: 'POLYGON';
  coordinates: number[][][]; // Array of rings (first is exterior, rest are holes)
}

/**
 * PostGIS multi-point geometry
 */
export interface PostGISMultiPoint extends PostGISGeometry {
  type: 'MULTIPOINT';
  coordinates: number[][]; // Array of points
}

/**
 * PostGIS multi-linestring geometry
 */
export interface PostGISMultiLineString extends PostGISGeometry {
  type: 'MULTILINESTRING';
  coordinates: number[][][]; // Array of linestrings
}

/**
 * PostGIS multi-polygon geometry
 */
export interface PostGISMultiPolygon extends PostGISGeometry {
  type: 'MULTIPOLYGON';
  coordinates: number[][][][]; // Array of polygons
}

/**
 * PostGIS geometry collection
 */
export interface PostGISGeometryCollection {
  type: 'GEOMETRYCOLLECTION';
  srid: number;
  geometries: PostGISGeometry[];
}

/**
 * PostGIS feature properties
 */
export interface PostGISFeatureProperties {
  [key: string]: string | number | boolean | null;
}

/**
 * PostGIS feature
 */
export interface PostGISFeature {
  geometry: PostGISGeometry;
  properties: PostGISFeatureProperties;
  srid?: number;
  id?: string | number;
}

/**
 * PostGIS batch insert options
 */
export interface PostGISBatchOptions {
  batchSize?: number;
  useTransaction?: boolean;
  onProgress?: (progress: number) => void;
  onBatchComplete?: (batchNumber: number, totalBatches: number) => void;
}
