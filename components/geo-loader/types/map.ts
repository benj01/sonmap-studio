import { FeatureCollection, Feature, BBox } from 'geojson';
import { ViewStateChangeEvent } from 'react-map-gl';
import { CoordinateSystem, Bounds } from './coordinates';
import { ErrorReporter } from '../utils/errors';

export interface Warning {
  type: string;
  message: string;
  entity?: {
    type: string;
    handle?: string;
    layer?: string;
  };
}

export interface Analysis {
  warnings: Warning[];
}

export interface SelectedElement {
  type: string;
  layer: string;
}

export interface PreviewMapProps {
  preview: FeatureCollection;
  bounds?: Bounds;
  coordinateSystem?: CoordinateSystem;
  visibleLayers?: string[];
  selectedElement?: SelectedElement;
  analysis?: Analysis;
  errorReporter: ErrorReporter;
}

export interface ViewState {
  longitude: number;
  latitude: number;
  zoom: number;
  bearing: number;
  pitch: number;
}

export interface MapFeatureCollections {
  pointFeatures: FeatureCollection;
  lineFeatures: FeatureCollection;
  polygonFeatures: FeatureCollection;
  getFeaturesByTypeAndLayer: (type: string, layer: string) => Feature[];
  totalFeatureCount: number;
  visibleFeatureCount: number;
}

export interface UseMapViewResult {
  viewState: ViewState;
  onMove: (evt: ViewStateChangeEvent) => void;
  updateViewFromBounds: (bounds: Bounds) => void;
  focusOnFeatures: (features: Feature[], padding?: number) => void;
  getViewportBounds: () => BBox | undefined;
}

export interface UseFeatureProcessingProps {
  preview: FeatureCollection;
  coordinateSystem: CoordinateSystem;
  visibleLayers: string[];
  zoom: number;
  analysis?: Analysis;
  viewportBounds?: BBox;
  batchSize?: number;
}
