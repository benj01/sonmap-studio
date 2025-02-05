import { Feature } from 'geojson';
import { GeoBounds } from '../preview/types';

/**
 * Supported coordinate system types
 */
export enum CoordinateSystemType {
  GEOGRAPHIC = 'geographic',  // Lat/Lon systems (e.g., WGS84)
  PROJECTED = 'projected',    // Projected systems (e.g., UTM, State Plane)
  COMPOUND = 'compound',      // Combined systems
  UNKNOWN = 'unknown'
}

/**
 * Common coordinate systems with their EPSG codes
 */
export enum CommonCoordinateSystems {
  WGS84 = 'EPSG:4326',
  WEB_MERCATOR = 'EPSG:3857',
  NAD83 = 'EPSG:4269',
  NAD27 = 'EPSG:4267'
}

/**
 * Confidence level in coordinate system detection
 */
export enum DetectionConfidence {
  HIGH = 'high',       // Multiple indicators strongly suggest the system
  MEDIUM = 'medium',   // Some indicators suggest the system
  LOW = 'low',        // Weak or conflicting indicators
  UNKNOWN = 'unknown' // Not enough information to determine
}

/**
 * Result of a single detection method
 */
export interface DetectionResult {
  /** Detected coordinate system EPSG code or WKT */
  system: string;
  /** Type of coordinate system */
  type: CoordinateSystemType;
  /** Confidence in the detection */
  confidence: DetectionConfidence;
  /** Method used for detection */
  method: DetectionMethod;
  /** Additional details about the detection */
  details?: {
    /** Why this system was chosen */
    reasoning: string;
    /** Alternative possibilities */
    alternatives?: string[];
    /** Any warnings or notes */
    warnings?: string[];
  };
}

/**
 * Methods used for coordinate system detection
 */
export enum DetectionMethod {
  PRJ_FILE = 'prj_file',           // Based on .prj file content
  BOUNDS_ANALYSIS = 'bounds',       // Based on coordinate ranges
  PATTERN_RECOGNITION = 'pattern',  // Based on feature patterns
  PROPERTY_ANALYSIS = 'properties', // Based on feature properties
  COMBINED = 'combined'            // Multiple methods combined
}

/**
 * Configuration for coordinate system detection
 */
export interface DetectionConfig {
  /** Preferred coordinate systems in order of preference */
  preferredSystems?: string[];
  /** Whether to attempt pattern recognition (can be slow) */
  enablePatternRecognition?: boolean;
  /** Minimum confidence level required */
  minConfidence?: DetectionConfidence;
  /** Maximum number of alternatives to suggest */
  maxAlternatives?: number;
}

/**
 * Pattern recognition result
 */
export interface PatternRecognitionResult {
  /** Detected patterns in the data */
  patterns: {
    /** Grid-like arrangement */
    isGridLike: boolean;
    /** Road network characteristics */
    hasRoadPatterns: boolean;
    /** Building footprint characteristics */
    hasBuildingPatterns: boolean;
    /** Natural feature characteristics */
    hasNaturalPatterns: boolean;
  };
  /** Scale characteristics */
  scale: {
    /** Typical feature size */
    typicalFeatureSize: number;
    /** Typical distances between features */
    typicalDistance: number;
    /** Whether values appear to be in meters */
    likelyMeters: boolean;
    /** Whether values appear to be in degrees */
    likelyDegrees: boolean;
  };
}

/**
 * Combined detection result
 */
export interface CombinedDetectionResult {
  /** Primary detection result */
  primary: DetectionResult;
  /** All individual detection results */
  all: DetectionResult[];
  /** Suggested transformations if needed */
  suggestedTransformations?: {
    /** Source coordinate system */
    from: string;
    /** Target coordinate system */
    to: string;
    /** Reason for suggestion */
    reason: string;
  }[];
  /** Data quality indicators */
  quality: {
    /** Whether coordinates appear valid */
    hasValidCoordinates: boolean;
    /** Whether the data needs transformation */
    needsTransformation: boolean;
    /** Any detected anomalies */
    anomalies: string[];
  };
} 