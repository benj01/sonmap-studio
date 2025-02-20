'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { GeoFileUpload } from './geo-file-upload';
import { LoaderResult, GeoFeature as LoaderGeoFeature } from '@/types/geo';
import { ImportSession, GeoFeature as ImportGeoFeature } from '@/types/geo-import';

interface GeoImportDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete: (result: LoaderResult) => Promise<void>;
}

/**
 * Convert an import feature to a loader feature
 */
function convertFeature(feature: ImportGeoFeature): LoaderGeoFeature {
  return {
    type: 'Feature',
    id: feature.id,
    geometry: feature.geometry,
    properties: {
      ...feature.properties,
      originalIndex: feature.originalIndex
    }
  };
}

export function GeoImportDialog({
  projectId,
  open,
  onOpenChange,
  onImportComplete
}: GeoImportDialogProps) {
  const [isProcessing, setIsProcessing] = useState(false);

  const handleImportSessionCreated = async (session: ImportSession) => {
    try {
      setIsProcessing(true);
      
      // Create a LoaderResult from the import session
      const result: LoaderResult = {
        features: (session.fullDataset?.features || []).map(convertFeature),
        bounds: {
          minX: session.fullDataset?.metadata?.bounds?.[0] || 0,
          minY: session.fullDataset?.metadata?.bounds?.[1] || 0,
          maxX: session.fullDataset?.metadata?.bounds?.[2] || 0,
          maxY: session.fullDataset?.metadata?.bounds?.[3] || 0
        },
        layers: session.fullDataset?.metadata?.properties || [],
        statistics: {
          pointCount: 0, // TODO: Calculate from features
          layerCount: session.fullDataset?.metadata?.properties?.length || 0,
          featureTypes: {} // TODO: Calculate from features
        }
      };

      await onImportComplete(result);
      onOpenChange(false);
    } catch (error) {
      console.error('Import failed:', error);
      // In case of error, create a minimal valid LoaderResult
      await onImportComplete({
        features: [],
        bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
        layers: [],
        statistics: {
          pointCount: 0,
          layerCount: 0,
          featureTypes: {}
        }
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Import Geodata</DialogTitle>
        </DialogHeader>
        
        <div className="py-4">
          <GeoFileUpload
            projectId={projectId}
            onImportSessionCreated={handleImportSessionCreated}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
} 