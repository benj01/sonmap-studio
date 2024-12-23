import { FeatureCollection, Feature, BBox } from 'geojson';
import { ViewStateChangeEvent } from 'react-map-gl';
import { CoordinateSystem } from './coordinates';
import { ProcessorResult } from '../core/processors/base/types';

export interface PreviewOptions {
  /** Maximum number of features to include in preview */
  maxFeatures?: number;
  /** Visible layers to include */
  visibleLayers?: string[];
  /** Selected element type and layer */
  selectedElement?: {
    type: string;
    layer: string;
  } | null;
  /** Target coordinate system */
  coordinateSystem?: CoordinateSystem;
  /** Whether to enable caching */
  enableCaching?: boolean;
  /** Whether to use smart sampling */
  smartSampling?: boolean;
  /** Analysis results including warnings */
  analysis?: {
    warnings: Array<{ type: string; message: string; }>;
  };
  /** Progress callback */
  onProgress?: (progress: number) => void;
  /** Viewport bounds for filtering */
  viewportBounds?: [number, number, number, number];
}

export interface PreviewMapProps {
  /** Preview data from processor */
  preview: ProcessorResult;
  /** Bounds for initial view */
  bounds?: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  /** Target coordinate system */
  coordinateSystem?: CoordinateSystem;
  /** Visible layers */
  visibleLayers?: string[];
  /** Selected element for focus */
  selectedElement?: {
    type: string;
    layer: string;
  };
  /** Analysis results including warnings */
  analysis?: {
    warnings: Array<{ type: string; message: string }>;
  };
}

export interface ViewState {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch?: number;
  bearing?: number;
  padding?: { top: number; bottom: number; left: number; right: number };
}

export interface MapFeature {
  id?: string | number;
  type: 'Feature';
  geometry: any;
  properties: {
    layer?: string;
    type?: string;
    hasWarning?: boolean;
    warningMessage?: string;
    [key: string]: any;
  };
  point?: [number, number];
}

export interface MapEvent {
  type: string;
  features: MapFeature[];
  lngLat?: {
    lng: number;
    lat: number;
  };
  point?: [number, number];
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
}

export interface UseMapViewResult {
  viewState: ViewState;
  onMove: (evt: ViewStateChangeEvent) => void;
  updateViewFromBounds: (bounds: { minX: number; minY: number; maxX: number; maxY: number }) => Promise<void>;
  focusOnFeatures: (features: Feature[], padding?: number) => Promise<void>;
  getViewportBounds: () => BBox | undefined;
}
