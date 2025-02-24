'use client';

import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Download } from 'lucide-react';
import { GeoFileUpload } from './geo-file-upload';
import { LoaderResult, GeoFeature as LoaderGeoFeature } from '@/types/geo';
import { ImportSession, GeoFeature as ImportGeoFeature } from '@/types/geo-import';
import { MapPreview } from './map-preview';
import { FileTypeUtil } from '@/components/files/utils/file-types';
import { LogManager } from '@/core/logging/log-manager';
import { supabaseBrowserClient as supabase } from '@/utils/supabase/browser-client';
import { useToast } from '@/components/ui/use-toast';
import { LogLevel } from '@/core/logging/log-manager';

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
 * Get a descriptive name for the file type
 */
function getFileTypeDescription(fileName: string): string {
  const extension = fileName.split('.').pop()?.toLowerCase();
  if (!extension) return 'Unknown';
  
  const fileType = FileTypeUtil.getConfigForFile(fileName);
  return fileType?.description || 'Unknown';
}

/**
 * Format file size in a human-readable way
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const SOURCE = 'GeoImportDialog';
const logManager = LogManager.getInstance();

// Configure logger to output to console
logManager.addFilter(SOURCE, LogLevel.DEBUG);

const logger = {
  info: (message: string, data?: any) => {
    console.info(`[${SOURCE}] ${message}`, data);
    logManager.info(SOURCE, message, data);
  },
  warn: (message: string, error?: any) => {
    console.warn(`[${SOURCE}] ${message}`, error);
    logManager.warn(SOURCE, message, error);
  },
  error: (message: string, error?: any) => {
    console.error(`[${SOURCE}] ${message}`, error);
    logManager.error(SOURCE, message, error);
  },
  debug: (message: string, data?: any) => {
    console.debug(`[${SOURCE}] ${message}`, data);
    logManager.debug(SOURCE, message, data);
  }
};

export function GeoImportDialog({
  projectId,
  open,
  onOpenChange,
  onImportComplete,
  fileInfo
}: GeoImportDialogProps) {
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [importSession, setImportSession] = useState<ImportSession | null>(null);
  const [selectedFeatureIds, setSelectedFeatureIds] = useState<number[]>([]);
  const [processedFiles] = useState(() => new Set<string>());

  const memoizedFileInfo = useMemo(() => 
    fileInfo ? {
      id: fileInfo.name, // Use filename as stable ID
      ...fileInfo
    } : undefined
  , [fileInfo?.name, fileInfo?.size, fileInfo?.type]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setImportSession(null);
      setSelectedFeatureIds([]);
    }
  }, [open]);

  // Log initial props and detect file type
  useEffect(() => {
    if (memoizedFileInfo) {
      const fileType = FileTypeUtil.getConfigForFile(memoizedFileInfo.name);
      logger.debug('Dialog mounted/updated', {
        projectId,
        open,
        fileInfo: memoizedFileInfo,
        detectedType: fileType?.description
      });
    }
  }, [projectId, open, memoizedFileInfo]);

  const handleImportSessionCreated = async (session: ImportSession) => {
    logger.debug('Import session created', session);
    setImportSession(session);
    // Initially select all features from the full dataset, not just preview
    if (session.fullDataset?.features) {
      const allFeatureIds = session.fullDataset.features.map(f => f.originalIndex || f.id);
      setSelectedFeatureIds(allFeatureIds);
      if (memoizedFileInfo?.name) {
        processedFiles.add(memoizedFileInfo.name);
      }
      logger.info('Selected all features', { count: allFeatureIds.length });
    }
  };

  const handleFeaturesSelected = (previewFeatureIds: number[]) => {
    if (!importSession?.fullDataset) return;

    // Map preview feature selections back to full dataset features
    const selectedOriginalIds = importSession.previewDataset?.features
      .filter(f => previewFeatureIds.includes(f.previewId))
      .map(f => f.originalFeatureIndex);

    // Get all feature IDs from the full dataset that match the selected preview features
    const fullDatasetSelectedIds = importSession.fullDataset.features
      .filter(f => selectedOriginalIds?.includes(f.originalIndex || f.id))
      .map(f => f.originalIndex || f.id);

    logger.debug('Features selection updated', { 
      selectedCount: fullDatasetSelectedIds.length,
      totalFeatures: importSession.fullDataset.features.length
    });
    setSelectedFeatureIds(fullDatasetSelectedIds);
  };

  const handleImport = async () => {
    if (!importSession?.fullDataset) {
      logger.error('No import session or dataset available');
      return;
    }

    try {
      setIsProcessing(true);
      logger.info('Starting import process', { 
        selectedCount: selectedFeatureIds.length,
        fileId: importSession.fileId,
        fileName: fileInfo?.name,
        metadata: importSession.fullDataset.metadata
      });
      
      // Show starting toast
      toast({
        title: 'Starting Import',
        description: `Importing ${selectedFeatureIds.length} features...`,
        duration: 3000,
      });
      
      // Filter the full dataset based on selected feature IDs
      const selectedFeatures = importSession.fullDataset.features.filter(f => 
        selectedFeatureIds.includes(f.originalIndex || f.id)
      );

      logger.debug('Selected features prepared', {
        count: selectedFeatures.length,
        firstFeature: selectedFeatures[0],
        srid: importSession.fullDataset.metadata?.srid || 2056
      });

      // Call our PostGIS import function
      const importParams = {
        p_project_file_id: importSession.fileId,
        p_collection_name: fileInfo?.name || 'Imported Features',
        p_features: selectedFeatures.map(f => ({
          type: 'Feature',
          geometry: f.geometry,
          properties: f.properties
        })),
        p_source_srid: importSession.fullDataset.metadata?.srid || 2056,
        p_target_srid: 4326
      };

      logger.debug('Calling import_geo_features with params', {
        fileId: importParams.p_project_file_id,
        collectionName: importParams.p_collection_name,
        featureCount: importParams.p_features.length,
        sourceSrid: importParams.p_source_srid,
        targetSrid: importParams.p_target_srid,
        sampleFeature: importParams.p_features[0]
      });

      const { data: importResults, error } = await supabase.rpc('import_geo_features', importParams);

      if (error) {
        logger.error('PostGIS import failed', { 
          error: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
          params: {
            fileId: importParams.p_project_file_id,
            featureCount: importParams.p_features.length
          }
        });
        throw error;
      }

      // Get the first row of results since it's a table-returning function
      const importResult = importResults?.[0];
      
      logger.info('PostGIS import completed', { 
        result: importResult,
        fileId: importSession.fileId,
        featureCount: selectedFeatures.length
      });

      if (!importResult?.collection_id || !importResult?.layer_id) {
        logger.error('Import result missing required fields', { importResult });
        throw new Error('Import failed: Missing collection or layer ID in result');
      }

      // Update the project_files record to mark it as imported
      const importMetadata = {
        collection_id: importResult.collection_id,
        layer_id: importResult.layer_id,
        imported_count: importResult.imported_count || selectedFeatures.length,
        failed_count: importResult.failed_count || 0,
        imported_at: new Date().toISOString()
      };

      logger.debug('Updating project_files record', { 
        fileId: importSession.fileId, 
        metadata: importMetadata
      });

      // Update main file record
      const { error: updateError, data: updateData } = await supabase
        .from('project_files')
        .update({
          is_imported: true,
          import_metadata: importMetadata
        })
        .eq('id', importSession.fileId)
        .select();

      if (updateError) {
        logger.error('Failed to update file import status', { 
          error: updateError,
          code: updateError.code,
          details: updateError.details,
          message: updateError.message,
          fileId: importSession.fileId
        });

        // Check if file exists
        const { data: existingFile, error: checkError } = await supabase
          .from('project_files')
          .select('id, is_imported')
          .eq('id', importSession.fileId)
          .single();

        if (checkError) {
          logger.error('Failed to check if file exists', {
            error: checkError,
            fileId: importSession.fileId
          });
        } else {
          logger.info('File check result', {
            exists: !!existingFile,
            isImported: existingFile?.is_imported,
            fileId: importSession.fileId
          });
        }

        throw updateError;
      }

      // Log the update result for debugging
      logger.info('Project file updated successfully', { 
        fileId: importSession.fileId,
        metadata: importMetadata,
        response: updateData
      });
      
      // Create a LoaderResult for compatibility with existing code
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
          pointCount: importMetadata.imported_count,
          layerCount: 1,
          featureTypes: importSession.fullDataset.metadata?.geometryTypes.reduce((acc, type) => {
            acc[type] = selectedFeatures.filter(f => f.geometry.type === type).length;
            return acc;
          }, {} as Record<string, number>) || {}
        }
      };

      await onImportComplete(result);
      logger.info('Import completed successfully', { result });
      
      // Show success toast with actual count
      toast({
        title: 'Import Complete',
        description: `Successfully imported ${importMetadata.imported_count} features`,
        duration: 5000,
      });

      // Close dialog
      onOpenChange(false);

    } catch (error) {
      logger.error('Import failed', error);
      
      // Show error toast
      toast({
        title: 'Import Failed',
        description: error instanceof Error ? error.message : 'An unknown error occurred',
        variant: 'destructive',
        duration: 5000,
      });

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

  const handleDownloadLogs = () => {
    const logManager = LogManager.getInstance();
    const filename = `sonmap-import-${fileInfo?.name || 'unknown'}-${new Date().toISOString()}.txt`;
    logManager.downloadLogs(filename);
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
            <>
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
                        {getFileTypeDescription(fileInfo.name)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <GeoFileUpload
                projectId={projectId}
                fileInfo={fileInfo}
                onImportSessionCreated={handleImportSessionCreated}
              />
            </>
          ) : (
            <div className="text-sm text-muted-foreground text-center p-4">
              No file selected for import
            </div>
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

        <DialogFooter className="flex justify-between items-center">
          <Button
            variant="outline"
            onClick={handleDownloadLogs}
            className="flex items-center gap-2"
          >
            <Download className="h-4 w-4" />
            Download Logs
          </Button>
          <div className="flex gap-2">
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
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 