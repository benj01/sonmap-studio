import { Feature, FeatureCollection, GeoJsonProperties } from 'geojson';
import { CoordinateSystem } from '../../types/coordinates';
import { Bounds } from '../../core/feature-manager/bounds';
import { GeoFeature } from '../../../../types/geo';

export interface PreviewOptions {
  maxFeatures?: number;
  coordinateSystem?: CoordinateSystem;
  visibleLayers?: string[];
  viewportBounds?: [number, number, number, number];
  enableCaching?: boolean;
  smartSampling?: boolean;
  analysis?: { warnings: string[] };
  initialBounds?: Bounds;
  onProgress?: (progress: number) => void;
  selectedElement?: string;
}

export interface PreviewCollections {
  points: FeatureCollection;
  lines: FeatureCollection;
  polygons: FeatureCollection;
}

export interface PreviewCollectionResult extends PreviewCollections {
  bounds: Bounds;
  totalCount: number;
  coordinateSystem: CoordinateSystem;
  timestamp: number;
}

export interface SamplingStrategy {
  shouldIncludeFeature: (feature: Feature<any, GeoJsonProperties>) => boolean;
  reset: () => void;
}
