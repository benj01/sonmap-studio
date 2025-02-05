import { Feature } from 'geojson';

/**
 * Configuration for the preview generation strategy
 */
export interface PreviewStrategy {
  /** Target number of features to show in preview */
  targetFeatureCount: number;
  
  /** Minimum distance between selected features (in coordinate units) */
  minFeatureDistance?: number;
  
  /** Weight factors for feature selection */
  weights: {
    /** Weight for density-based selection (0-1) */
    density: number;
    /** Weight for geographic distribution (0-1) */
    distribution: number;
    /** Weight for feature importance (0-1) */
    importance: number;
  };
}

/**
 * Geographic bounds of the data
 */
export interface GeoBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Result of feature density analysis
 */
export interface DensityAnalysis {
  /** Overall feature density (features per square unit) */
  overallDensity: number;
  /** Density hotspots */
  hotspots: Array<{
    bounds: GeoBounds;
    density: number;
  }>;
  /** Areas with sparse features */
  sparseAreas: Array<{
    bounds: GeoBounds;
    density: number;
  }>;
}

/**
 * Score for a feature's importance in preview
 */
export interface FeatureScore {
  /** Reference to the original feature */
  feature: Feature;
  /** Overall score (0-1) */
  score: number;
  /** Individual scoring components */
  components: {
    /** Score based on local feature density */
    density: number;
    /** Score based on geographic distribution */
    distribution: number;
    /** Score based on feature attributes/properties */
    importance: number;
  };
}

/**
 * Configuration for viewport optimization
 */
export interface ViewportConfig {
  /** Desired aspect ratio (width/height) */
  aspectRatio: number;
  /** Padding percentage around features (0-1) */
  padding: number;
  /** Maximum zoom level */
  maxZoom?: number;
}

/**
 * Result of preview generation
 */
export interface PreviewResult {
  /** Selected features for preview */
  features: Feature[];
  /** Optimized viewport settings */
  viewport: {
    bounds: GeoBounds;
    zoom: number;
  };
  /** Analysis results */
  analysis: {
    density: DensityAnalysis;
    coverage: number;
    representativeness: number;
  };
  /** Performance metrics */
  metrics: {
    processingTime: number;
    originalFeatureCount: number;
    selectedFeatureCount: number;
  };
} 