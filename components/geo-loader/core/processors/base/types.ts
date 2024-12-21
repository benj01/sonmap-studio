import { FeatureCollection } from 'geojson';
import { CoordinateSystem } from '../../../types/coordinates';
import { DxfData } from '../../../utils/dxf/types';
import { ErrorReporter } from '../../../core/errors/types';

/**
 * Options for file processing
 */
export interface ProcessorOptions {
  /** Target coordinate system for output */
  coordinateSystem?: CoordinateSystem;
  /** Layers to include in processing */
  selectedLayers?: string[];
  /** Entity types to include in processing */
  selectedTypes?: string[];
  /** Whether to import attribute data */
  importAttributes?: boolean;
  /** Custom error reporter instance */
  errorReporter?: ErrorReporter;
  /** Progress callback */
  onProgress?: (progress: number) => void;
}

/**
 * Statistics about processed features
 */
export interface ProcessorStats {
  /** Total number of features processed */
  featureCount: number;
  /** Number of layers found */
  layerCount: number;
  /** Count of each feature type */
  featureTypes: Record<string, number>;
  /** Number of failed coordinate transformations */
  failedTransformations: number;
  /** Processing errors by type */
  errors: Array<{
    type: string;
    code: string;
    message?: string;
    count: number;
    details?: Record<string, unknown>;
  }>;
}

/**
 * Result of file processing
 */
export interface ProcessorResult {
  /** Processed GeoJSON features */
  features: FeatureCollection;
  /** Bounds of all features */
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  /** Available layers */
  layers: string[];
  /** Coordinate system of output features */
  coordinateSystem: CoordinateSystem;
  /** Processing statistics */
  statistics: ProcessorStats;
  /** Optional DXF data for DXF processor */
  dxfData?: DxfData;
}

/**
 * Result of file analysis
 */
export interface AnalyzeResult {
  /** Available layers */
  layers: string[];
  /** Detected coordinate system */
  coordinateSystem?: CoordinateSystem;
  /** Bounds of preview features */
  bounds?: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  /** Preview features */
  preview: FeatureCollection;
  /** Optional DXF data for DXF processor */
  dxfData?: DxfData;
}
