/**
 * Type definitions for the geodata import pipeline
 */

import { GeoJSON } from 'geojson';

/**
 * Represents a feature in the full dataset with complete geometry and properties
 */
export interface GeoFeature {
  id: number;
  geometry: GeoJSON.Geometry;
  properties: Record<string, any>;
  originalIndex?: number;
}

/**
 * Represents a lightweight preview feature with simplified geometry
 */
export interface PreviewFeature extends Omit<GeoFeature, 'geometry'> {
  geometry: GeoJSON.Geometry;  // Simplified geometry
  previewId: number;
  originalFeatureIndex: number;
}

/**
 * Represents the complete dataset in memory
 */
export interface FullDataset {
  sourceFile: string;
  fileType: string;
  features: GeoFeature[];
  metadata?: {
    bounds?: [number, number, number, number];
    featureCount: number;
    geometryTypes: string[];
    properties: string[];
  };
}

/**
 * Represents the preview subset for visualization
 */
export interface PreviewDataset {
  sourceFile: string;
  features: PreviewFeature[];
  metadata?: FullDataset['metadata'];
}

/**
 * Configuration for preview generation
 */
export interface PreviewConfig {
  maxFeatures?: number;  // Maximum number of features to include in preview
  simplificationTolerance?: number;  // Tolerance for geometry simplification
  randomSampling?: boolean;  // Whether to use random sampling
}

/**
 * Status of the import process
 */
export type ImportStatus = 'idle' | 'parsing' | 'generating-preview' | 'ready' | 'error';

/**
 * Import session state
 */
export interface ImportSession {
  fileId: string;
  status: ImportStatus;
  fullDataset: FullDataset | null;
  previewDataset: PreviewDataset | null;
  selectedFeatureIndices: number[];
  error?: string;
}

/**
 * Parameters for creating a new import session
 */
export interface CreateImportSessionParams {
  fileId: string;
  fileName: string;
  fileType: string;
  fullDataset?: FullDataset;
} 