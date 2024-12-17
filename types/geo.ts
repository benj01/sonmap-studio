import { Feature, FeatureCollection, Geometry as GeoJSONGeometry } from 'geojson';
import { DxfData } from '../components/geo-loader/utils/dxf/types';

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
    id?: string;
    type?: string;
    layer?: string;
    color?: number;
    colorRGB?: number;
    lineType?: string;
    lineWeight?: number;
    elevation?: number;
    thickness?: number;
    visible?: boolean;
    _transformError?: string;
    _errors?: string[];
    [key: string]: any;
  };
}

export interface AnalysisWarning {
  type: string;
  message: string;
  entity?: {
    type: string;
    handle?: string;
    layer?: string;
  };
}

export interface AnalysisError {
  type: string;
  message: string;
  entity?: {
    type: string;
    handle?: string;
    layer?: string;
  };
  isCritical: boolean;
}

export interface AnalysisStats {
  totalEntities: number;
  validEntities: number;
  skippedEntities: number;
  entitiesByType: Record<string, number>;
  entitiesByLayer: Record<string, number>;
  layers: string[];
  blocks: string[];
  lineTypes: string[];
  textStyles: string[];
}

export interface AnalyzeResult {
  layers: string[];
  coordinateSystem?: string;
  bounds: Bounds;
  preview: FeatureCollection;
  dxfData?: DxfData;
  analysis?: {
    warnings: AnalysisWarning[];
    errors: AnalysisError[];
    stats: AnalysisStats;
  };
}

export interface LoaderResult {
  features: GeoFeature[];
  bounds: Bounds;
  layers: string[];
  coordinateSystem?: string;
  statistics?: {
    pointCount: number;
    layerCount: number;
    featureTypes: Record<string, number>;
    failedTransformations?: number;
    errors?: Array<{
      type: string;
      message?: string;
      count: number;
    }>;
  } & Partial<AnalysisStats>;
}

export interface LoaderOptions {
  coordinateSystem?: string;
  selectedLayers?: string[];
}

export interface GeoFileLoader {
  canLoad(file: File): Promise<boolean>;
  analyze(file: File): Promise<AnalyzeResult>;
  load(file: File, options: LoaderOptions): Promise<LoaderResult>;
}

export type Geometry = GeoJSONGeometry;
