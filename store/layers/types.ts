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
    // Primary configuration mode
    mode?: 'simple' | 'advanced';
    
    // Simple mode (backward compatible)
    sourceType: 'z_coord' | 'attribute' | 'none';
    attributeName?: string;
    interpretationMode?: 'absolute' | 'relative' | 'extrusion';
    
    // Advanced mode
    advanced?: {
      // Base elevation configuration
      baseElevation: {
        source: 'z_coord' | 'attribute' | 'terrain';
        attributeName?: string;
        isAbsolute: boolean; // true = absolute elevation, false = relative to terrain
      };
      
      // Height/Top configuration
      heightConfig: {
        source: 'attribute' | 'calculated' | 'none';
        attributeName?: string;
        isRelative: boolean; // true = height value, false = absolute top elevation
      };
      
      // Visualization settings
      visualization: {
        type: 'extrusion' | 'point_elevation' | 'line_elevation';
        extrudedFaces?: boolean; // For polygon extrusion: show side faces
        extrudedTop?: boolean; // For polygon extrusion: show top face
      };
    };
    
    // Existing fields for transformation tracking
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