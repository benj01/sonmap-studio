import { Feature, FeatureCollection, Geometry, Position } from 'geojson';
import { CoordinateSystem } from '../../types/coordinates';
import { Bounds } from '../../core/feature-manager/bounds';

export type ViewportBounds = [number, number, number, number];

export interface PreviewCollections {
  points: FeatureCollection;
  lines: FeatureCollection;
  polygons: FeatureCollection;
  bounds?: Bounds;
  totalCount: number;
}

export interface PreviewOptions {
  coordinateSystem: CoordinateSystem;
  viewportBounds?: ViewportBounds;
  visibleLayers?: string[];
  enableCaching?: boolean;
  smartSampling?: boolean;
  maxFeatures?: number;
}

export interface PreviewFeatureManagerOptions {
  enableCaching?: boolean;
  smartSampling?: boolean;
  maxFeatures?: number;
} 