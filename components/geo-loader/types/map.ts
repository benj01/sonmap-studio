import { FeatureCollection } from 'geojson';
import { CoordinateSystem, Bounds } from './coordinates';

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

export interface PreviewMapProps {
  preview: FeatureCollection;
  bounds?: Bounds;
  coordinateSystem?: CoordinateSystem;
  visibleLayers?: string[];
  analysis?: Analysis;
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
}
