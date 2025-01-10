import { Position } from 'geojson';

/**
 * Shapefile record data structure
 */
export interface ShapefileData {
  /** Coordinates in the appropriate format for the shape type */
  coordinates: Position | Position[] | Position[][];
  /** Bounding box of the shape */
  bbox?: {
    xMin: number;
    yMin: number;
    xMax: number;
    yMax: number;
    zMin?: number;
    zMax?: number;
    mMin?: number;
    mMax?: number;
  };
}

/**
 * Shapefile record attributes
 */
export interface ShapefileAttributes {
  /** Record number */
  recordNumber: number;
  /** Field values */
  [key: string]: string | number | boolean | null;
}

/**
 * Shapefile record structure
 */
export interface ShapefileRecord {
  /** Record header */
  header: {
    recordNumber: number;
    contentLength: number;
  };
  /** Shape type */
  shapeType: number;
  /** Shape data */
  data: ShapefileData;
  /** DBF attributes */
  attributes?: ShapefileAttributes;
}
