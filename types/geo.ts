// types/geo.ts

export type GeoFileType = 'dxf' | 'shp' | 'xyz' | 'csv' | 'txt';

export type Point2D = {
  type: 'Point';
  coordinates: [number, number];
};

export type Point3D = {
  type: 'Point';
  coordinates: [number, number, number];
};

export type Point = Point2D | Point3D;

export type LineString = {
  type: 'LineString';
  coordinates: Array<[number, number]>;
};

export type Polygon = {
  type: 'Polygon';
  coordinates: Array<Array<[number, number]>>;
};

export type Geometry = Point | LineString | Polygon;

export interface GeoFeature {
  type: 'Feature';
  geometry: Geometry;
  properties: Record<string, any>;
  layer?: string;
}

export interface GeoFeatureCollection {
  type: 'FeatureCollection';
  features: GeoFeature[];
}

export interface LoaderOptions {
  // Common options
  coordinateSystem?: string;
  targetSystem?: string;

  // Format-specific options
  delimiter?: string;     // For CSV/TXT
  skipRows?: number;      // For CSV/TXT
  skipColumns?: number;   // For CSV/TXT
  selectedLayers?: string[]; // For DXF/SHP - Layers to import
  visibleLayers?: string[]; // For DXF/SHP - Layers to show in preview
  importAttributes?: boolean; // For SHP
  boundingBox?: {         // For spatial filtering
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  simplificationTolerance?: number; // For point cloud thinning
}

export interface LoaderResult {
  features: GeoFeature[];
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  layers?: string[];          // Available layers
  coordinateSystem?: string;  // Detected CRS
  statistics?: {
    pointCount: number;
    layerCount?: number;
    featureTypes: Record<string, number>;
    failedTransformations?: number;  // Count of entities that failed coordinate transformation
    errors?: {                       // Optional error statistics
      type: string;
      count: number;
      message?: string;
    }[];
  };
}

export interface AnalyzeResult {
  layers: string[];
  coordinateSystem: string;
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  preview: GeoFeatureCollection;
}

export interface GeoFileLoader {
  canLoad: (file: File) => Promise<boolean>;
  analyze: (file: File) => Promise<AnalyzeResult>;
  load: (file: File, options: LoaderOptions) => Promise<LoaderResult>;
}
