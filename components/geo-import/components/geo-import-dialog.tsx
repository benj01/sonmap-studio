'use client';

import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Download, Trash } from 'lucide-react';
import { GeoFileUpload } from './geo-file-upload';
import { LoaderResult, GeoFeature as LoaderGeoFeature } from '@/types/geo';
import { ImportSession, GeoFeature as ImportGeoFeature } from '@/types/geo-import';
import { MapPreview } from './map-preview';
import { FileTypeUtil } from '@/components/files/utils/file-types';
import { LogManager } from '@/core/logging/log-manager';
import { createClient } from '@/utils/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { LogLevel } from '@/core/logging/log-manager';
import { PostgrestError } from '@supabase/supabase-js';

interface ImportLoaderResult {
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

interface GeoImportDialogProps {
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
const supabase = createClient();

// Configure logger to output to console and set debug level
logManager.addFilter(SOURCE, LogLevel.DEBUG);

const logger = {
  info: (message: string, data?: any) => {
    // Remove filtering to ensure all logs are captured
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
    // Remove filtering to ensure all debug logs are captured
    console.debug(`[${SOURCE}] ${message}`, data);
    logManager.debug(SOURCE, message, data);
  }
};

interface ImportResult {
  collectionId: string;
  layerId: string;
  totalImported: number;
  totalFailed: number;
}

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
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');

  const memoizedFileInfo = useMemo(() => 
    fileInfo ? {
      id: fileInfo.id,
      name: fileInfo.name,
      size: fileInfo.size,
      type: fileInfo.type
    } : undefined
  , [fileInfo?.id, fileInfo?.name, fileInfo?.size, fileInfo?.type]);

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
    logger.debug('Import session created', {
      fileId: session.fileId,
      status: session.status,
      featureCount: session.fullDataset?.features.length || 0,
      geometryTypes: session.fullDataset?.metadata?.geometryTypes || [],
      sourceSrid: session.fullDataset?.metadata?.srid,
      bounds: session.fullDataset?.metadata?.bounds
    });
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
      
      // Show starting toast with more detail
      toast({
        title: 'Starting Import',
        description: `Processing ${selectedFeatureIds.length} features. This may take a while for complex geometries...`,
        duration: 5000,
      });
      
      // Filter the full dataset based on selected feature IDs
      const selectedFeatures = importSession.fullDataset.features.filter(f => 
        selectedFeatureIds.includes(f.originalIndex || f.id)
      );

      logger.debug('Selected features prepared', {
        count: selectedFeatures.length,
        geometryTypes: [...new Set(selectedFeatures.map(f => f.geometry.type))],
        srid: importSession.fullDataset.metadata?.srid || 2056
      });

      // Call our PostGIS import function with timeout handling
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Import timeout')), 300000); // 5 minute timeout
      });

      // Log the features being sent to PostGIS
      logger.info('Starting PostGIS import', {
        featureCount: selectedFeatures.length,
        sampleFeature: {
          id: selectedFeatures[0].id,
          type: selectedFeatures[0].geometry.type,
          geometry: selectedFeatures[0].geometry,
          properties: selectedFeatures[0].properties
        },
        srid: importSession.fullDataset.metadata?.srid || 2056,
        geometryTypes: [...new Set(selectedFeatures.map(f => f.geometry.type))],
        totalFeatures: selectedFeatures.length
      });

      // Test log to verify logging system
      logger.info('TEST LOG - About to start streaming import');

      let importResults = {
        totalImported: 0,
        totalFailed: 0,
        collectionId: '',
        layerId: ''
      };

      const response = await fetch('/api/geo-import/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileId: importSession.fileId,
          collectionName: fileInfo?.name || 'Imported Features',
          features: selectedFeatures.map(f => ({
            type: 'Feature' as const,
            geometry: f.geometry,
            properties: f.properties || {}
          })),
          sourceSrid: importSession.fullDataset.metadata?.srid || 2056,
          batchSize: 600
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No reader available');
      }

      try {
        while (true) {
          const { value, done } = await reader.read();
          
          if (done) {
            logger.info('Stream complete', { importResults });
            break;
          }
          
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const eventData = JSON.parse(line.slice(6));
              
              switch (eventData.type) {
                case 'batch_complete':
                  logger.info('Batch complete', eventData);
                  importResults.totalImported += eventData.importedCount;
                  importResults.totalFailed += eventData.failedCount;
                  importResults.collectionId = eventData.collectionId;
                  importResults.layerId = eventData.layerId;
                  
                  // Update progress
                  setProgress(Math.round((eventData.batchIndex + 1) * 100 / eventData.totalBatches));
                  break;
                  
                case 'notice':
                  logger.info(`Import ${eventData.level}:`, eventData.message);
                  break;
                  
                case 'feature_errors':
                  logger.warn('Feature errors:', eventData.errors);
                  break;
                  
                case 'error':
                  throw new Error(eventData.message);
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      if (importResults.totalImported === 0) {
        throw new Error('No features were imported');
      }

      logger.info('Import completed successfully', { 
        importResults,
        selectedCount: selectedFeatures.length
      });

      // Show success toast
      toast({
        title: 'Import Complete',
        description: `Successfully imported ${importResults.totalImported} features${importResults.totalFailed > 0 ? ` (${importResults.totalFailed} failed)` : ''}.${
          importResults.totalImported !== selectedFeatures.length 
            ? ` Note: ${selectedFeatures.length - importResults.totalImported} features were skipped.`
            : ''
        }`,
        duration: 5000,
      });

      // Call onImportComplete with the results
      await onImportComplete({
        features: [],
        bounds: {
          minX: importSession?.fullDataset.metadata?.bounds?.[0] || 0,
          minY: importSession?.fullDataset.metadata?.bounds?.[1] || 0,
          maxX: importSession?.fullDataset.metadata?.bounds?.[2] || 0,
          maxY: importSession?.fullDataset.metadata?.bounds?.[3] || 0
        },
        layers: [],
        statistics: {
          pointCount: importResults.totalImported,
          layerCount: 1,
          featureTypes: {}
        },
        collectionId: importResults.collectionId,
        layerId: importResults.layerId,
        totalImported: importResults.totalImported,
        totalFailed: importResults.totalFailed
      });

      setIsProcessing(false);
      onOpenChange(false);

    } catch (error) {
      logger.error('Import failed', {
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack,
          name: error.name
        } : error,
        importSession: {
          fileId: importSession.fileId,
          fileName: fileInfo?.name,
          featureCount: selectedFeatureIds.length,
          metadata: importSession.fullDataset.metadata
        }
      });
      
      // Show error toast with more details
      toast({
        title: 'Import Failed',
        description: error instanceof Error ? error.message : 'An unknown error occurred during import',
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
        },
        collectionId: undefined,
        layerId: undefined,
        totalImported: undefined,
        totalFailed: undefined
      });
    }
  };

  const handleImportLargeFile = async () => {
    if (!importSession?.fullDataset) {
      logger.error('No import session or dataset available');
      return;
    }

    try {
      setIsProcessing(true);
      
      // Filter the full dataset based on selected feature IDs
      const selectedFeatures = importSession.fullDataset.features.filter(f => 
        selectedFeatureIds.includes(f.originalIndex || f.id)
      );
      
      let importResults = {
        totalImported: 0,
        totalFailed: 0,
        collectionId: '',
        layerId: ''
      };
      
      logger.info('Starting batch import process', {
        totalFeatures: selectedFeatures.length,
        fileId: importSession.fileId,
        fileName: fileInfo?.name,
        geometryTypes: [...new Set(selectedFeatures.map(f => f.geometry.type))]
      });
      
      // Show starting toast
      toast({
        title: 'Starting Import',
        description: `Processing ${selectedFeatures.length} features in batches of 100...`,
        duration: 5000,
      });
      
      // Test log to verify logging system
      logger.info('TEST LOG - About to start streaming import');

      const response = await fetch('/api/geo-import/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileId: importSession.fileId,
          collectionName: fileInfo?.name || 'Imported Features',
          features: selectedFeatures.map(f => ({
            type: 'Feature',
            geometry: f.geometry,
            properties: f.properties
          })),
          sourceSrid: importSession.fullDataset.metadata?.srid || 2056,
          batchSize: 600
        })
      });

      if (!response.ok || !response.body) {
        const errorData = await response.json();
        logger.error(`Batch import failed`, {
          status: response.status,
          statusText: response.statusText,
          error: errorData
        });
        throw new Error(`Batch import failed: ${errorData.error}`);
      }

      // Process the stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let lastMessageTime = Date.now();

      // Set up a watchdog timer
      const watchdogTimer = setInterval(() => {
        const timeSinceLastMessage = Date.now() - lastMessageTime;
        if (timeSinceLastMessage > 60000) { // 1 minute without messages
          logger.error(`Stream timeout: No messages received for ${timeSinceLastMessage}ms`);
          clearInterval(watchdogTimer);
          reader.cancel('Stream timeout').catch(e => {
            logger.error('Error canceling stream', e);
          });
        }
      }, 10000);

      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            logger.info(`Batch import completed`, { importResults });
            
            // Send completion notification
            setIsProcessing(false);
            onImportComplete({
              features: [],
              bounds: {
                minX: importSession?.fullDataset.metadata?.bounds?.[0] || 0,
                minY: importSession?.fullDataset.metadata?.bounds?.[1] || 0,
                maxX: importSession?.fullDataset.metadata?.bounds?.[2] || 0,
                maxY: importSession?.fullDataset.metadata?.bounds?.[3] || 0
              },
              layers: [],
              statistics: {
                pointCount: importResults.totalImported,
                layerCount: 1,
                featureTypes: {}
              },
              collectionId: importResults.collectionId,
              layerId: importResults.layerId,
              totalImported: importResults.totalImported,
              totalFailed: importResults.totalFailed
            });
            onOpenChange(false);
            break;
          }

          if (!value) {
            logger.warn('Received empty value from stream');
            continue;
          }

          lastMessageTime = Date.now();
          
          try {
            // Append new data to buffer and split by double newlines
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n\n');
            buffer = lines.pop() || ''; // Keep last incomplete chunk in buffer

            // Process complete messages
            for (const line of lines) {
              if (!line.trim() || !line.startsWith('data: ')) {
                logger.debug('Skipping invalid line', { line });
                continue;
              }
              
              try {
                const data = JSON.parse(line.slice(6));
                logger.debug(`Received stream message`, { type: data.type });
                
                switch (data.type) {
                  case 'notice':
                    logger.info(`[${data.level.toUpperCase()}] ${data.message}`);
                    break;
                  case 'error':
                    throw new Error(data.message);
                  case 'feature_errors':
                    logger.warn('Feature errors:', data.errors);
                    break;
                  case 'batch_complete':
                    importResults.totalImported += data.importedCount;
                    importResults.totalFailed += data.failedCount;
                    importResults.collectionId = data.collectionId;
                    importResults.layerId = data.layerId;
                    break;
                  case 'import_complete':
                    logger.info('Import completed successfully', {
                      totalImported: importResults.totalImported,
                      totalFailed: importResults.totalFailed,
                      collectionId: importResults.collectionId,
                      layerId: importResults.layerId,
                      actualFeatureCount: data.finalStats.actualFeatureCount,
                      expectedFeatureCount: selectedFeatures.length
                    });
                    
                    // Show completion toast with actual counts
                    toast({
                      title: 'Import Complete',
                      description: `Successfully imported ${importResults.totalImported} features${importResults.totalFailed > 0 ? ` (${importResults.totalFailed} failed)` : ''}.${
                        importResults.totalImported !== selectedFeatures.length 
                          ? ` Note: ${selectedFeatures.length - importResults.totalImported} features were skipped.`
                          : ''
                      }`,
                      duration: 5000,
                    });
                    
                    // Close the dialog and notify parent
                    setIsProcessing(false);
                    await onImportComplete({
                      features: [],
                      bounds: {
                        minX: importSession?.fullDataset.metadata?.bounds?.[0] || 0,
                        minY: importSession?.fullDataset.metadata?.bounds?.[1] || 0,
                        maxX: importSession?.fullDataset.metadata?.bounds?.[2] || 0,
                        maxY: importSession?.fullDataset.metadata?.bounds?.[3] || 0
                      },
                      layers: [],
                      statistics: {
                        pointCount: importResults.totalImported,
                        layerCount: 1,
                        featureTypes: {}
                      },
                      collectionId: importResults.collectionId,
                      layerId: importResults.layerId,
                      totalImported: importResults.totalImported,
                      totalFailed: importResults.totalFailed
                    });
                    onOpenChange(false);
                    break;
                  default:
                    logger.warn('Unknown message type:', data.type);
                }
              } catch (e) {
                logger.error('Error processing message', {
                  error: e instanceof Error ? e.message : 'Unknown error',
                  line
                });
              }
            }
          } catch (e) {
            logger.error('Error decoding stream chunk', {
              error: e instanceof Error ? e.message : 'Unknown error',
              bufferLength: buffer.length
            });
          }
        }
      } catch (e) {
        logger.error('Stream reading error', {
          error: e instanceof Error ? {
            message: e.message,
            stack: e.stack,
            name: e.name
          } : 'Unknown error'
        });
        throw e;
      } finally {
        clearInterval(watchdogTimer);
        try {
          await reader.cancel();
        } catch (e) {
          logger.error('Error canceling reader', e);
        }
        reader.releaseLock();
      }

      // Final update
      setProgress(100);
      setProgressMessage('Import complete');

      logger.info('Batch import completed', {
        totalImported: importResults.totalImported,
        totalFailed: importResults.totalFailed,
        collectionId: importResults.collectionId,
        layerId: importResults.layerId
      });

      // Show repair notification if any geometries were repaired
      if (importResults.totalFailed > 0) {
        toast({
          title: 'Geometries Repaired',
          description: `${importResults.totalFailed} geometries were automatically repaired during import`,
          duration: 5000,
        });
      }
      
      // Update the project_files record
      const importMetadata = {
        collection_id: importResults.collectionId,
        layer_id: importResults.layerId,
        imported_count: importResults.totalImported,
        failed_count: importResults.totalFailed,
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
      const result: ImportLoaderResult = {
        features: [],
        bounds: {
          minX: importSession?.fullDataset.metadata?.bounds?.[0] || 0,
          minY: importSession?.fullDataset.metadata?.bounds?.[1] || 0,
          maxX: importSession?.fullDataset.metadata?.bounds?.[2] || 0,
          maxY: importSession?.fullDataset.metadata?.bounds?.[3] || 0
        },
        layers: [],
        statistics: {
          pointCount: importResults.totalImported,
          layerCount: 1,
          featureTypes: {}
        },
        collectionId: importResults.collectionId,
        layerId: importResults.layerId,
        totalImported: importResults.totalImported,
        totalFailed: importResults.totalFailed
      };

      await onImportComplete(result);
      logger.info('Import completed successfully', { result });
      
      // Close dialog
      onOpenChange(false);

    } catch (error) {
      logger.error('Import failed', {
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack,
          name: error.name
        } : error,
        importSession: {
          fileId: importSession.fileId,
          fileName: fileInfo?.name,
          featureCount: selectedFeatureIds.length,
          metadata: importSession.fullDataset.metadata
        }
      });
      
      // Show error toast with more details
      toast({
        title: 'Import Failed',
        description: error instanceof Error ? error.message : 'An unknown error occurred during import',
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
        },
        collectionId: undefined,
        layerId: undefined,
        totalImported: undefined,
        totalFailed: undefined
      });
    }
  };

  const handleImportWithSizeDetection = async () => {
    if (!importSession?.fullDataset) return;
    
    const selectedFeatures = importSession.fullDataset.features.filter(f => 
      selectedFeatureIds.includes(f.originalIndex || f.id)
    );
    
    // Determine which import method to use based on feature count and complexity
    const featureCount = selectedFeatures.length;
    const isComplex = selectedFeatures.some(f => 
      f.geometry.type === 'MultiPolygon' || 
      (f.geometry.type === 'Polygon' && JSON.stringify(f.geometry).length > 10000)
    );
    
    if (featureCount > 1000 || (featureCount > 500 && isComplex)) {
      // Use chunked approach for large datasets
      await handleImportLargeFile();
    } else {
      // Use single-call approach for smaller datasets
      await handleImport();
    }
  };

  const handleDownloadLogs = () => {
    const logManager = LogManager.getInstance();
    const logs = logManager.getLogs();
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `geo-import-logs-${new Date().toISOString()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleClearLogs = () => {
    const logManager = LogManager.getInstance();
    logManager.clearLogs();
    toast({
      title: 'Logs Cleared',
      description: 'All debug logs have been cleared.',
      duration: 3000,
    });
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
              {importSession?.fullDataset ? (
                <MapPreview
                  features={importSession.fullDataset.previewFeatures || []}
                  bounds={importSession.fullDataset.metadata?.bounds}
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
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleDownloadLogs}
              className="flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              Download Logs
            </Button>
            <Button
              variant="outline"
              onClick={handleClearLogs}
              className="flex items-center gap-2"
            >
              <Trash className="h-4 w-4" />
              Clear Logs
            </Button>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button
              onClick={handleImportWithSizeDetection}
              disabled={!importSession?.fullDataset || !selectedFeatureIds.length || isProcessing}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {progressMessage || 'Importing...'}
                </>
              ) : (
                <>Import Selected Features</>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 