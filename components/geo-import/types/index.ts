import { GeoFeature as LoaderGeoFeature } from '@/types/geo';
import { ImportSession, GeoFeature as ImportGeoFeature } from '@/types/geo-import';
import { ImportResult as ServiceImportResult, FeatureError } from '@/core/services/geo-import/types/index';

export interface ImportLoaderResult {
  features: LoaderGeoFeature[];
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  layers: string[];
  statistics: {
    pointCount: number;
    layerCount: number;
    featureTypes: Record<string, number>;
  };
  collectionId?: string;
  layerId?: string;
  totalImported?: number;
  totalFailed?: number;
}

export interface GeoImportDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete: (result: ImportLoaderResult) => Promise<void>;
  fileInfo?: {
    id: string;
    name: string;
    size: number;
    type: string;
  };
}

export interface ImportResult {
  totalImported: number;
  totalFailed: number;
  collectionId: string;
  layerId: string;
  notices: Array<{
    level: string;
    message: string;
    details?: unknown;
  }>;
  featureErrors: Array<{
    feature_index: number;
    error: string;
    error_state: string;
    invalid_reason?: string;
    geometry_type_after_repair?: string;
  }>;
}

// Re-export types from core services
export type { LoaderGeoFeature, ImportSession, ImportGeoFeature, ServiceImportResult, FeatureError }; 