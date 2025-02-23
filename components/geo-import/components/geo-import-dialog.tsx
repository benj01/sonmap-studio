'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { GeoFileUpload } from './geo-file-upload';
import { LoaderResult, GeoFeature as LoaderGeoFeature } from '@/types/geo';
import { ImportSession, GeoFeature as ImportGeoFeature } from '@/types/geo-import';
import { MapPreview } from './map-preview';

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

/**
 * Format file size in a human-readable way
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Get a human-readable file type description
 */
function getFileTypeDescription(type: string): string {
  const typeMap: Record<string, string> = {
    'application/x-esri-shape': 'ESRI Shapefile',
    'application/geo+json': 'GeoJSON',
    'application/vnd.google-earth.kml+xml': 'KML',
    'application/gpx+xml': 'GPX'
  };
  return typeMap[type] || type;
}

export function GeoImportDialog({
  projectId,
  open,
  onOpenChange,
  onImportComplete,
  fileInfo
}: GeoImportDialogProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [importSession, setImportSession] = useState<ImportSession | null>(null);
  const [selectedFeatureIds, setSelectedFeatureIds] = useState<number[]>([]);

  const handleImportSessionCreated = async (session: ImportSession) => {
    setImportSession(session);
    // Initially select all features
    if (session.previewDataset?.features) {
      const allFeatureIds = session.previewDataset.features.map(f => f.originalFeatureIndex);
      setSelectedFeatureIds(allFeatureIds);
    }
  };

  const handleFeaturesSelected = (featureIds: number[]) => {
    setSelectedFeatureIds(featureIds);
  };

  const handleImport = async () => {
    if (!importSession?.fullDataset) return;

    try {
      setIsProcessing(true);
      
      // Filter the full dataset based on selected preview features
      const selectedFeatures = importSession.fullDataset.features.filter(f => 
        selectedFeatureIds.includes(f.originalIndex || f.id)
      );

      // Create a LoaderResult from the selected features
      const result: LoaderResult = {
        features: selectedFeatures.map(convertFeature),
        bounds: {
          minX: importSession.fullDataset.metadata?.bounds?.[0] || 0,
          minY: importSession.fullDataset.metadata?.bounds?.[1] || 0,
          maxX: importSession.fullDataset.metadata?.bounds?.[2] || 0,
          maxY: importSession.fullDataset.metadata?.bounds?.[3] || 0
        },
        layers: importSession.fullDataset.metadata?.properties || [],
        statistics: {
          pointCount: selectedFeatures.length,
          layerCount: importSession.fullDataset.metadata?.properties?.length || 0,
          featureTypes: importSession.fullDataset.metadata?.geometryTypes.reduce((acc, type) => {
            acc[type] = selectedFeatures.filter(f => f.geometry.type === type).length;
            return acc;
          }, {} as Record<string, number>) || {}
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
            {importSession?.previewDataset && (
              <span className="block mt-1 text-sm">
                Click features on the map to select/deselect them for import.
              </span>
            )}
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
                      {formatFileSize(fileInfo.size)}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-sm font-medium">Type</p>
                    <p className="text-sm text-muted-foreground">
                      {getFileTypeDescription(fileInfo.type)}
                    </p>
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

          {/* Preview section */}
          <Card>
            <CardHeader>
              <CardTitle>Preview</CardTitle>
              <CardDescription>
                Preview of the geodata to be imported
              </CardDescription>
            </CardHeader>
            <CardContent>
              {importSession?.previewDataset ? (
                <MapPreview
                  features={importSession.previewDataset.features}
                  bounds={importSession.previewDataset.metadata?.bounds}
                  onFeaturesSelected={handleFeaturesSelected}
                />
              ) : (
                <div className="h-[300px] w-full bg-muted rounded-md flex items-center justify-center">
                  <p className="text-sm text-muted-foreground">
                    {isProcessing ? 'Loading preview...' : 'No data to preview'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Import statistics */}
          {importSession?.fullDataset?.metadata && (
            <Card>
              <CardHeader>
                <CardTitle>Import Details</CardTitle>
                <CardDescription>
                  Information about the data to be imported
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium">Features</p>
                    <p className="text-sm text-muted-foreground">
                      {selectedFeatureIds.length} selected of {importSession.fullDataset.metadata.featureCount} total
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Geometry Types</p>
                    <p className="text-sm text-muted-foreground">
                      {importSession.fullDataset.metadata.geometryTypes.join(', ')}
                    </p>
                  </div>
                  {importSession.fullDataset.metadata.srid && (
                    <div>
                      <p className="text-sm font-medium">Coordinate System</p>
                      <p className="text-sm text-muted-foreground">
                        EPSG:{importSession.fullDataset.metadata.srid}
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium">Properties</p>
                    <p className="text-sm text-muted-foreground">
                      {importSession.fullDataset.metadata.properties.length} columns
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
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
            onClick={handleImport}
            disabled={!importSession?.fullDataset || !selectedFeatureIds.length || isProcessing}
          >
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importing...
              </>
            ) : (
              `Import ${selectedFeatureIds.length} Features`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 