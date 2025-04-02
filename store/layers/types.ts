export interface LayerMetadata {
  name: string;
  type: string;
  properties: Record<string, any>;
  fileId?: string;
  style?: {
    paint?: Record<string, any>;
    layout?: Record<string, any>;
  };
  geometryTypes?: {
    hasPolygons: boolean;
    hasLines: boolean;
    hasPoints: boolean;
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