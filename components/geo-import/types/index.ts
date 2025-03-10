import { GeoFeature as LoaderGeoFeature } from '@/types/geo';
import { ImportSession, GeoFeature as ImportGeoFeature } from '@/types/geo-import';

export interface ImportLoaderResult {
  features: any[];
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  layers: any[];
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
  collectionId: string;
  layerId: string;
  totalImported: number;
  totalFailed: number;
}

export type { LoaderGeoFeature, ImportSession, ImportGeoFeature }; 