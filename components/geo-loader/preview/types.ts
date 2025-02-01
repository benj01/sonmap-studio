import { Feature, FeatureCollection, GeoJsonProperties } from 'geojson';
import { CoordinateSystem } from '../types/coordinates';
import { Bounds } from '../core/feature-manager/bounds';
import { GeoFeature, GeoFeatureCollection } from '../../../types/geo';

export interface PreviewCollections {
  points: GeoFeatureCollection;
  lines: GeoFeatureCollection;
  polygons: GeoFeatureCollection;
}

export interface PreviewCollectionResult extends PreviewCollections {
  totalCount: number;
  bounds: Required<Bounds>;
  coordinateSystem: CoordinateSystem;
  timestamp: number;
}

export interface SamplingStrategy {
  shouldIncludeFeature(feature: Feature<any, GeoJsonProperties>): boolean;
  reset(): void;
}

export interface PreviewOptions {
  maxFeatures?: number;
  coordinateSystem?: CoordinateSystem;
  visibleLayers?: string[];
  viewportBounds?: [number, number, number, number];
  enableCaching?: boolean;
  smartSampling?: boolean;
  analysis?: {
    warnings: string[];
  };
  initialBounds?: Bounds;
  onProgress?: (progress: number) => void;
  selectedElement?: string;
}
