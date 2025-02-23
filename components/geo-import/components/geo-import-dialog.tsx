'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { GeoFileUpload } from './geo-file-upload';
import { LoaderResult, GeoFeature as LoaderGeoFeature } from '@/types/geo';
import { ImportSession, GeoFeature as ImportGeoFeature } from '@/types/geo-import';

interface GeoImportDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete: (result: LoaderResult) => Promise<void>;
  fileInfo?: {
    name: string;
    size: number;
    type: string;
  };
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
  onImportComplete,
  fileInfo
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
      <DialogContent className="sm:max-w-[800px]">
        <DialogHeader>
          <DialogTitle>Import Geodata</DialogTitle>
          <DialogDescription>
            Import your geodata file into the project for visualization and analysis.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          {fileInfo ? (
            <Card>
              <CardHeader>
                <CardTitle>File Information</CardTitle>
                <CardDescription>
                  Details about the file to be imported
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium">Name</p>
                    <p className="text-sm text-muted-foreground">{fileInfo.name}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Size</p>
                    <p className="text-sm text-muted-foreground">
                      {(fileInfo.size / 1024).toFixed(2)} KB
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Type</p>
                    <p className="text-sm text-muted-foreground">{fileInfo.type}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <GeoFileUpload
              projectId={projectId}
              onImportSessionCreated={handleImportSessionCreated}
            />
          )}

          {/* Preview section - to be implemented */}
          <Card>
            <CardHeader>
              <CardTitle>Preview</CardTitle>
              <CardDescription>
                Preview of the geodata to be imported
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full bg-muted rounded-md flex items-center justify-center">
                <p className="text-sm text-muted-foreground">Preview coming soon</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isProcessing}
          >
            Cancel
          </Button>
          <Button
            onClick={() => handleImportSessionCreated({
              fileId: '',
              status: 'idle',
              fullDataset: null,
              previewDataset: null,
              selectedFeatureIndices: []
            })}
            disabled={!fileInfo || isProcessing}
          >
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importing...
              </>
            ) : (
              'Import'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 