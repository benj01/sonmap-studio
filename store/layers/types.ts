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
  height?: {
    sourceType: 'z_coord' | 'attribute' | 'none';
    attributeName?: string;
    extrusion?: number;
    scale?: number;
    transformationStatus?: 'pending' | 'in_progress' | 'complete' | 'failed';
    transformationProgress?: {
      processed: number;
      total: number;
      startTime?: number;
      endTime?: number;
    };
    transformationError?: string;
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
  geoJsonData?: GeoJSON.FeatureCollection;
} 