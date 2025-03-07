/**
 * Type definitions for the geodata import pipeline
 */

import { GeoJSON } from 'geojson';
import type { Geometry } from 'geojson';

/**
 * Represents a feature in the full dataset with complete geometry and properties
 */
export interface GeoFeature {
  id: number;
  geometry: Geometry;
  properties?: Record<string, any>;
  validation?: ValidationResult;
  originalIndex?: number;
}

/**
 * Represents a lightweight preview feature with simplified geometry
 */
export interface PreviewFeature extends Omit<GeoFeature, 'geometry'> {
  geometry: Geometry;  // Simplified geometry
  previewId: number;
  originalFeatureIndex: number;
  properties: Record<string, any> & {
    wasRepaired?: boolean;
    wasCleaned?: boolean;
  };
}

/**
 * Represents the complete dataset in memory
 */
export interface FullDataset {
  sourceFile: string;
  fileType: string;
  features: GeoFeature[];
  previewFeatures: GeoFeature[]; // Features with transformed coordinates for preview
  metadata?: DatasetMetadata;
}

/**
 * Represents the preview subset for visualization
 */
export interface PreviewDataset {
  sourceFile: string;
  features: PreviewFeature[];
  metadata?: DatasetMetadata;
}

/**
 * Configuration for preview generation
 */
export interface PreviewConfig {
  maxFeatures?: number;  // Maximum number of features to include in preview
  simplificationTolerance?: number;  // Tolerance for geometry simplification
  randomSampling?: boolean;  // Whether to use random sampling
  chunkSize?: number;  // Size of chunks for processing features
}

/**
 * Status of the import process
 */
export type ImportStatus = 'idle' | 'parsing' | 'generating-preview' | 'ready' | 'error';

/**
 * Import session state
 */
export interface ImportSession {
  id: string;
  fileId: string;
  status: 'created' | 'processing' | 'completed' | 'failed';
  error?: string;
  fullDataset: FullDataset | null;
  previewDataset: PreviewDataset | null;
  selectedFeatures: number[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Parameters for creating a new import session
 */
export interface CreateImportSessionParams {
  fileId: string;
  fileName: string;
  fileType: string;
  fullDataset?: FullDataset;
  previewDataset?: PreviewDataset;
  selectedFeatures?: number[];
}

export interface UpdateImportSessionParams {
  status?: ImportSession['status'];
  error?: string;
  fullDataset?: FullDataset;
  previewDataset?: PreviewDataset;
  selectedFeatures?: number[];
}

export interface ValidationResult {
  hasIssues: boolean;
  issues: string[];
}

export interface ValidationSummary {
  featuresWithIssues: number;
  totalFeatures: number;
}

export interface DatasetMetadata {
  featureCount: number;
  bounds?: [number, number, number, number];
  geometryTypes: string[];
  properties: string[];
  srid?: number;
  validationSummary?: ValidationSummary;
} 