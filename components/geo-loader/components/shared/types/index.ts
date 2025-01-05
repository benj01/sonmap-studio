import { Feature, FeatureCollection, Geometry, GeoJsonProperties } from 'geojson';
import { CoordinateSystem } from '../../../types/coordinates';

export interface ProgressInfo {
  progress: number;
  status: string;
  details?: string;
}

export interface ErrorInfo {
  message: string;
  code?: string;
  details?: Record<string, unknown>;
}

export interface ControlProps {
  className?: string;
  disabled?: boolean;
  children?: React.ReactNode;
}

export interface FeatureState {
  features: Feature[];
  filteredFeatures: Feature[];
  selectedFeature?: Feature;
  bounds?: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  coordinateSystem?: CoordinateSystem;
}

export interface ProcessingOptions {
  coordinateSystem?: CoordinateSystem;
  validate?: boolean;
  repair?: boolean;
  simplify?: boolean;
  simplifyTolerance?: number;
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expires: number;
}

export interface CacheOptions {
  ttl?: number;
  maxSize?: number;
}
