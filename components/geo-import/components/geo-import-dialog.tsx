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
    logManager.info(SOURCE, message, data);
  },
  warn: (message: string, error?: any) => {
    logManager.warn(SOURCE, message, error);
  },
  error: (message: string, error?: any) => {
    logManager.error(SOURCE, message, error);
  },
  debug: (message: string, data?: any) => {
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
    logger.debug('Import session received by dialog', {
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

    // Initialize results outside try block for wider scope
    let importResults = {
      totalImported: 0,
      totalFailed: 0,
      collectionId: '',
      layerId: ''
    };

    const startTime = Date.now();
    let importCompleted = false;

    try {
      setIsProcessing(true);
      
      logger.info('DIAGNOSTIC: Import starting - Initial selection state', { 
        selectedFeatureIds: selectedFeatureIds,
        selectedFeatureIdsCount: selectedFeatureIds.length,
        totalFeaturesInDataset: importSession.fullDataset.features.length,
        fileId: importSession.fileId,
        fileName: fileInfo?.name,
        metadata: importSession.fullDataset.metadata,
        timestamp: new Date().toISOString(),
        startTime
      });
      
      toast({
        title: 'Starting Import',
        description: `Processing ${selectedFeatureIds.length} features. This may take a while for complex geometries...`,
        duration: 5000,
      });
      
      const selectedFeatures = importSession.fullDataset.features.filter(f => 
        selectedFeatureIds.includes(f.originalIndex || f.id)
      );

      logger.info('DIAGNOSTIC: Features after filtering', {
        filteredFeaturesCount: selectedFeatures.length,
        originalSelectedIdsCount: selectedFeatureIds.length,
        mismatchCount: selectedFeatureIds.length - selectedFeatures.length,
        geometryTypes: [...new Set(selectedFeatures.map(f => f.geometry.type))],
        srid: importSession.fullDataset.metadata?.srid || 2056
      });

      const requestPayload = {
        fileId: importSession.fileId,
        collectionName: fileInfo?.name || 'Imported Features',
        features: selectedFeatures.map(f => ({
          type: 'Feature' as const,
          geometry: f.geometry,
          properties: f.properties || {}
        })),
        sourceSrid: importSession.fullDataset.metadata?.srid || 2056,
        batchSize: 600
      };

      // Create an AbortController for the timeout
      const controller = new AbortController();
      const timeout = setTimeout(() => {
        controller.abort();
        logger.error('DIAGNOSTIC: Fetch timeout after 120 seconds');
      }, 120000);

      try {
        logger.info('DIAGNOSTIC: Starting fetch request', {
          url: '/api/geo-import/stream',
          payloadSize: JSON.stringify(requestPayload).length,
          featureCount: selectedFeatures.length
        });

        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          throw new Error('No authentication token available');
        }

        const response = await fetch('/api/geo-import/stream', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify(requestPayload),
          signal: controller.signal
        });

        // Clear the timeout since we got a response
        clearTimeout(timeout);

        // Log EVERYTHING about the response
        logger.info('DIAGNOSTIC: Raw response details', {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries([...response.headers.entries()]),
          ok: response.ok,
          bodyUsed: response.bodyUsed,
          type: response.type,
          url: response.url
        });

        // Try to get response text if not OK
        if (!response.ok) {
          let errorText = '';
          try {
            errorText = await response.text();
            logger.error('DIAGNOSTIC: Error response body', { errorText });
            throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
          } catch (e) {
            logger.error('DIAGNOSTIC: Failed to read error response', e);
            throw new Error(`HTTP error! status: ${response.status}`);
          }
        }

        // Verify we have a readable stream
        if (!response.body) {
          logger.error('DIAGNOSTIC: Response has no body stream');
          throw new Error('Response has no body stream');
        }

        logger.info('DIAGNOSTIC: Setting up stream reader');
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        const allEvents = [];

        try {
          logger.info('DIAGNOSTIC: Starting stream read loop');
          while (true) {
            // Log loop iteration
            logger.debug('DIAGNOSTIC: Stream read loop iteration', {
              importCompleted,
              eventsReceived: allEvents.length,
              lastEventType: allEvents.length > 0 ? allEvents[allEvents.length - 1].type : 'none'
            });

            // Check importCompleted flag first
            if (importCompleted) {
              logger.info('DIAGNOSTIC: Breaking loop because importCompleted is true');
              break;
            }

            const { value, done } = await reader.read();
            
            // Log read operation result
            logger.debug('DIAGNOSTIC: Stream read operation', {
              done,
              hasValue: !!value,
              valueSize: value ? value.length : 0,
              importCompleted
            });
            
            if (done) {
              logger.info('DIAGNOSTIC: Stream complete signal received', { 
                importResults,
                totalEventsReceived: allEvents.length,
                eventTypes: allEvents.map(e => e.type),
                importCompleted
              });
              break;
            }
            
            const chunk = decoder.decode(value);
            // Split by double newlines for server-sent events format
            const lines = chunk.split('\n\n');
            
            // Log chunk details
            logger.debug('DIAGNOSTIC: Processing chunk', {
              chunkSize: chunk.length,
              lineCount: lines.length,
              firstLine: lines[0]?.substring(0, 100)
            });
            
            for (const line of lines) {
              if (!line.trim()) continue; // Skip empty lines
              
              const eventLine = line.split('\n').find(l => l.startsWith('data: '));
              if (!eventLine) continue;
              
              try {
                const eventData = JSON.parse(eventLine.slice(6));
                allEvents.push(eventData);
                
                // Log each event
                logger.debug('DIAGNOSTIC: Processing event', {
                  type: eventData.type,
                  importCompleted
                });
                
                switch (eventData.type) {
                  case 'batch_complete':
                    importResults.totalImported += eventData.importedCount;
                    importResults.totalFailed += eventData.failedCount;
                    importResults.collectionId = eventData.collectionId;
                    importResults.layerId = eventData.layerId;
                    
                    setProgress(Math.round((eventData.batchIndex + 1) * 100 / eventData.totalBatches));
                    setProgressMessage(`Imported ${importResults.totalImported} features (${Math.round((eventData.batchIndex + 1) / eventData.totalBatches * 100)}%)`);
                    break;
                    
                  case 'import_complete':
                    logger.info('DIAGNOSTIC: Received import_complete event', {
                      eventData,
                      currentImportResults: { ...importResults },
                      timestamp: new Date().toISOString(),
                      elapsedMs: Date.now() - startTime
                    });
                    
                    if (eventData.finalStats) {
                      if (eventData.finalStats.totalImported !== undefined) {
                        importResults.totalImported = eventData.finalStats.totalImported;
                      }
                      if (eventData.finalStats.totalFailed !== undefined) {
                        importResults.totalFailed = eventData.finalStats.totalFailed;
                      }
                    }

                    importCompleted = true;
                    break;
                    
                  case 'notice':
                    logger.info(`Import ${eventData.level}:`, eventData.message);
                    break;
                    
                  case 'feature_errors':
                    logger.warn('Feature import failures:', {
                      errors: eventData.errors,
                      batchInfo: {
                        currentImported: importResults.totalImported,
                        currentFailed: importResults.totalFailed
                      }
                    });
                    break;
                    
                  case 'error':
                    throw new Error(eventData.message);
                }
              } catch (parseError) {
                logger.error('DIAGNOSTIC: Error parsing event data', {
                  error: parseError instanceof Error ? parseError.message : String(parseError),
                  line: eventLine.substring(0, 100), // Log first 100 chars of problematic line
                  fullLineLength: eventLine.length
                });
                throw parseError;
              }
            }
          }
        } catch (streamError) {
          logger.error('DIAGNOSTIC: Error in stream reading process', {
            error: streamError instanceof Error ? {
              message: streamError.message,
              stack: streamError.stack,
              name: streamError.name
            } : String(streamError),
            eventsReceived: allEvents.length,
            lastEventType: allEvents.length > 0 ? allEvents[allEvents.length - 1].type : 'none'
          });
          throw streamError;
        } finally {
          reader.releaseLock();
          logger.info('DIAGNOSTIC: Stream reader released', {
            totalEvents: allEvents.length,
            importCompleted,
            lastEventType: allEvents.length > 0 ? allEvents[allEvents.length - 1].type : 'none'
          });
        }

        // Only proceed with completion if we got the import_complete event
        if (!importCompleted) {
          throw new Error('Import did not complete successfully - no completion event received');
        }

        // Update project_files record
        try {
          const importMetadata = {
            collection_id: importResults.collectionId,
            layer_id: importResults.layerId,
            imported_count: importResults.totalImported,
            failed_count: importResults.totalFailed,
            imported_at: new Date().toISOString()
          };

          const { error: updateError } = await supabase
            .from('project_files')
            .update({
              is_imported: true,
              import_metadata: importMetadata
            })
            .eq('id', importSession.fileId);

          if (updateError) {
            throw updateError;
          }
        } catch (updateError) {
          logger.error('Failed to update file import status', { 
            error: updateError instanceof Error ? updateError.message : String(updateError),
            fileId: importSession.fileId
          });
          // Continue with completion - file status update is not critical
        }

        // Show success toast
        toast({
          title: 'Import Complete',
          description: `Successfully imported ${importResults.totalImported} features${importResults.totalFailed > 0 ? ` (${importResults.totalFailed} failed)` : ''}.`,
          duration: 5000,
        });

        // Complete the import process
        setIsProcessing(false);
        
        try {
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
        } catch (completeError) {
          logger.error('Error in onImportComplete', {
            error: completeError instanceof Error ? completeError.message : String(completeError)
          });
          // Continue with dialog close even if onImportComplete fails
        }

        // Always try to close the dialog
        onOpenChange(false);

      } catch (error) {
        logger.error('Import failed', {
          error: error instanceof Error ? {
            message: error.message,
            stack: error.stack,
            name: error.name
          } : String(error)
        });
        
        toast({
          title: 'Import Failed',
          description: error instanceof Error ? error.message : 'An unknown error occurred during import',
          variant: 'destructive',
          duration: 5000,
        });

        // Ensure we clean up state and close dialog even on error
        setIsProcessing(false);
        
        try {
          await onImportComplete({
            features: [],
            bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
            layers: [],
            statistics: { pointCount: 0, layerCount: 0, featureTypes: {} },
            collectionId: undefined,
            layerId: undefined,
            totalImported: undefined,
            totalFailed: undefined
          });
        } catch (completeError) {
          logger.error('Error in onImportComplete during error handling', {
            error: completeError instanceof Error ? completeError.message : String(completeError)
          });
        }

        // Always try to close the dialog
        onOpenChange(false);
      }

    } catch (error) {
      logger.error('Import failed', {
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack,
          name: error.name
        } : String(error)
      });
      
      toast({
        title: 'Import Failed',
        description: error instanceof Error ? error.message : 'An unknown error occurred during import',
        variant: 'destructive',
        duration: 5000,
      });

      // Ensure we clean up state and close dialog even on error
      setIsProcessing(false);
      
      try {
        await onImportComplete({
          features: [],
          bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
          layers: [],
          statistics: { pointCount: 0, layerCount: 0, featureTypes: {} },
          collectionId: undefined,
          layerId: undefined,
          totalImported: undefined,
          totalFailed: undefined
        });
      } catch (completeError) {
        logger.error('Error in onImportComplete during error handling', {
          error: completeError instanceof Error ? completeError.message : String(completeError)
        });
      }

      // Always try to close the dialog
      onOpenChange(false);
    }
  };

  const handleImportLargeFile = async () => {
    if (!importSession?.fullDataset) {
      logger.error('No import session or dataset available');
      return;
    }

    // Initialize results outside try block for wider scope
    let importResults = {
      totalImported: 0,
      totalFailed: 0,
      collectionId: '',
      layerId: ''
    };

    const startTime = Date.now();
    let importCompleted = false;

    try {
      setIsProcessing(true);
      
      const selectedFeatures = importSession.fullDataset.features.filter(f => 
        selectedFeatureIds.includes(f.originalIndex || f.id)
      );
      
      logger.info('Starting batch import process', {
        totalFeatures: selectedFeatures.length,
        fileId: importSession.fileId,
        fileName: fileInfo?.name
      });
      
      toast({
        title: 'Starting Import',
        description: `Processing ${selectedFeatures.length} features in batches...`,
        duration: 5000,
      });

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
        throw new Error(`HTTP error! status: ${response.status}`);
      }

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
          // Check importCompleted flag first
          if (importCompleted) {
            logger.info('Breaking loop because importCompleted is true');
            break;
          }

          const { done, value } = await reader.read();
          
          if (done) {
            logger.info(`Stream complete signal received`);
            break;
          }

          if (!value) {
            logger.warn('Received empty value from stream');
            continue;
          }

          lastMessageTime = Date.now();
          
          try {
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (!line.trim() || !line.startsWith('data: ')) {
                continue;
              }
              
              try {
                const data = JSON.parse(line.slice(6));
                
                switch (data.type) {
                  case 'notice':
                    logger.info(`[${data.level.toUpperCase()}] ${data.message}`);
                    break;

                  case 'error':
                    throw new Error(data.message);

                  case 'feature_errors':
                    logger.warn('Feature import failures:', {
                      errors: data.errors,
                      batchInfo: {
                        currentImported: importResults.totalImported,
                        currentFailed: importResults.totalFailed
                      }
                    });
                    break;

                  case 'batch_complete':
                    importResults.totalImported += data.importedCount;
                    importResults.totalFailed += data.failedCount;
                    importResults.collectionId = data.collectionId;
                    importResults.layerId = data.layerId;

                    setProgress(Math.round((data.batchIndex + 1) * 100 / data.totalBatches));
                    setProgressMessage(`Imported ${importResults.totalImported} features (${Math.round((data.batchIndex + 1) / data.totalBatches * 100)}%)`);
                    break;

                  case 'import_complete':
                    logger.info('Import completed successfully', {
                      totalImported: importResults.totalImported,
                      totalFailed: importResults.totalFailed,
                      collectionId: importResults.collectionId,
                      layerId: importResults.layerId
                    });
                    
                    if (data.finalStats) {
                      if (data.finalStats.totalImported !== undefined) {
                        importResults.totalImported = data.finalStats.totalImported;
                      }
                      if (data.finalStats.totalFailed !== undefined) {
                        importResults.totalFailed = data.finalStats.totalFailed;
                      }
                    }
                    
                    importCompleted = true;
                    break;
                }
              } catch (parseError) {
                logger.error('Error processing message', {
                  error: parseError instanceof Error ? parseError.message : String(parseError),
                  line
                });
                throw parseError; // Re-throw to be caught by outer catch
              }
            }
          } catch (decodeError) {
            logger.error('Error decoding stream chunk', {
              error: decodeError instanceof Error ? decodeError.message : String(decodeError)
            });
            throw decodeError;
          }
        }
      } catch (streamError) {
        logger.error('Stream reading error', {
          error: streamError instanceof Error ? streamError.message : String(streamError)
        });
        throw streamError;
      } finally {
        clearInterval(watchdogTimer);
        try {
          await reader.cancel();
        } catch (e) {
          logger.error('Error canceling reader', e);
        }
        reader.releaseLock();
      }

      // Only proceed with completion if we got the import_complete event
      if (!importCompleted) {
        throw new Error('Import did not complete successfully - no completion event received');
      }

      // Update project_files record
      try {
        const importMetadata = {
          collection_id: importResults.collectionId,
          layer_id: importResults.layerId,
          imported_count: importResults.totalImported,
          failed_count: importResults.totalFailed,
          imported_at: new Date().toISOString()
        };

        const { error: updateError } = await supabase
          .from('project_files')
          .update({
            is_imported: true,
            import_metadata: importMetadata
          })
          .eq('id', importSession.fileId);

        if (updateError) {
          throw updateError;
        }
      } catch (updateError) {
        logger.error('Failed to update file import status', {
          error: updateError instanceof Error ? updateError.message : String(updateError),
          fileId: importSession.fileId
        });
        // Continue with completion - file status update is not critical
      }

      // Show success toast
      toast({
        title: 'Import Complete',
        description: `Successfully imported ${importResults.totalImported} features${importResults.totalFailed > 0 ? ` (${importResults.totalFailed} failed)` : ''}.`,
        duration: 5000,
      });

      // Complete the import process
      setIsProcessing(false);
      
      try {
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
      } catch (completeError) {
        logger.error('Error in onImportComplete', {
          error: completeError instanceof Error ? completeError.message : String(completeError)
        });
        // Continue with dialog close even if onImportComplete fails
      }

      // Always try to close the dialog
      onOpenChange(false);

    } catch (error) {
      logger.error('Import failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      
      toast({
        title: 'Import Failed',
        description: error instanceof Error ? error.message : 'An unknown error occurred during import',
        variant: 'destructive',
        duration: 5000,
      });

      // Ensure we clean up state and close dialog even on error
      setIsProcessing(false);
      
      try {
        await onImportComplete({
          features: [],
          bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
          layers: [],
          statistics: { pointCount: 0, layerCount: 0, featureTypes: {} },
          collectionId: undefined,
          layerId: undefined,
          totalImported: undefined,
          totalFailed: undefined
        });
      } catch (completeError) {
        logger.error('Error in onImportComplete during error handling', {
          error: completeError instanceof Error ? completeError.message : String(completeError)
        });
      }

      // Always try to close the dialog
      onOpenChange(false);
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
    
    if (featureCount > 1000 || (featureCount > 800 && isComplex)) {
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