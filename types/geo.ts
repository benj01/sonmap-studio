import { Feature, FeatureCollection } from 'geojson';
import { COORDINATE_SYSTEMS, CoordinateSystem } from '@/core/coordinates/coordinates';

export interface Point {
  x: number;
  y: number;
  z?: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface GeoFeature extends Feature {
  properties: {
    layer?: string;
    type?: string;
    [key: string]: string | number | boolean | null | undefined;
  };
}

export interface GeoFeatureCollection extends FeatureCollection {
  statistics?: {
    points: number;
    lines: number;
    polygons: number;
    total: number;
  };
}

export interface LoaderResult {
  features: GeoFeature[];
  bounds: Bounds;
  layers: string[];
  coordinateSystem?: CoordinateSystem;
  statistics?: {
    pointCount: number;
    layerCount: number;
    featureTypes: { [key: string]: number };
    failedTransformations?: number;
    errors?: Array<{
      type: string;
      message?: string;
      count: number;
    }>;
  };
}

export interface AnalyzeResult {
  layers: string[];
  coordinateSystem?: CoordinateSystem;
  bounds: Bounds;
  preview: GeoFeatureCollection;
  dxfData?: unknown;
  analysis?: {
    warnings: Array<{ type: string; message: string }>;
    errors: Array<{ type: string; message: string; isCritical: boolean }>;
    stats: {
      entityCount: number;
      layerCount: number;
      [key: string]: number | string | boolean;
    };
  };
}

export interface LoaderOptions {
  selectedLayers?: string[];
  visibleLayers?: string[];
  selectedTemplates?: string[];
  coordinateSystem?: CoordinateSystem;
  // CSV/XYZ/TXT file options
  delimiter?: string;
  skipRows?: number;
  skipColumns?: number;
  // Point cloud optimization
  simplificationTolerance?: number;
  // Shapefile options
  importAttributes?: boolean;
  // Progress and logging callbacks
  onProgress?: (progress: number, context?: any) => void;
  onLog?: (message: string) => void;
}

export interface GeoFileLoader {
  canLoad(file: File): Promise<boolean>;
  analyze(file: File, options?: LoaderOptions): Promise<AnalyzeResult>;
  load(file: File, options: LoaderOptions): Promise<LoaderResult>;
}

export interface ImportMetadata {
  sourceFile: {
    id: string;
    name: string;
  };
  importedLayers: Array<{
    name: string;
    featureCount: number;
    featureTypes: { [key: string]: number };
  }>;
  coordinateSystem: {
    source: CoordinateSystem;
    target: CoordinateSystem;
  };
  statistics: {
    totalFeatures: number;
    failedTransformations?: number;
    errors?: Array<{
      type: string;
      message?: string;
      count: number;
    }>;
  };
  importedAt: string;
}

export interface ImportedGeoFile {
  id: string;
  name: string;
  sourceFileId: string;
  features: FeatureCollection;
  metadata: ImportMetadata;
}

// Re-export coordinate system constants
export { COORDINATE_SYSTEMS };
