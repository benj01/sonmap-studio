import type { FeatureCollection } from 'geojson';

export interface LayerMetadata {
  name: string;
  type: string;
  properties: Record<string, any>;
  fileId?: string;
  sourceType: 'file' | '2d' | '3d';
  geojson?: FeatureCollection;
  dataUrl?: string;
  style?: {
    paint?: Record<string, any>;
    layout?: Record<string, any>;
  };
}

export interface Layer {
  id: string;
  sourceId?: string;
  visible: boolean;
  added: boolean;
  setupStatus: 'pending' | 'adding' | 'complete' | 'error';
  metadata?: LayerMetadata;
  error?: string;
} 