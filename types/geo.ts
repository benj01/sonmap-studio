// types/geo.ts

export type GeoFileType = 'dxf' | 'shp' | 'xyz' | 'csv' | 'txt';

export interface GeoFeature {
  type: 'Feature';
  geometry: {
    type: 'Point' | 'LineString' | 'Polygon';
    coordinates: number[];
  };
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
  
  // Format specific options
  delimiter?: string;     // For CSV/TXT
  skipRows?: number;      // For CSV/TXT
  skipColumns?: number;   // For CSV/TXT
  selectedLayers?: string[]; // For DXF/SHP
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
  };
}

export interface GeoFileLoader {
  canLoad: (file: File) => Promise<boolean>;
  analyze: (file: File) => Promise<{
    layers?: string[];
    coordinateSystem?: string;
    bounds?: LoaderResult['bounds'];
    preview?: GeoFeatureCollection;
  }>;
  load: (file: File, options: LoaderOptions) => Promise<LoaderResult>;
}
