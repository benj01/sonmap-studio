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
 * Represents the complete dataset in memory
 */
export interface FullDataset {
  sourceFile: string;
  fileType: string;
  features: GeoFeature[];
  metadata?: DatasetMetadata;
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
  selectedFeatures?: number[];
}

export interface UpdateImportSessionParams {
  status?: ImportSession['status'];
  error?: string;
  fullDataset?: FullDataset;
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