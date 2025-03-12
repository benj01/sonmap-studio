'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Download, Trash } from 'lucide-react';
import { GeoFileUpload } from './geo-file-upload';
import { MapPreview } from './map-preview';
import { FileInfoCard } from './file-info-card';
import { ImportDetailsCard } from './import-details-card';
import { LogLevel, LogManager } from '@/core/logging/log-manager';
import { createClient } from '@/utils/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { processImportStream } from '../services/import-stream';
import { GeoImportDialogProps, ImportSession } from '../types';
import { TestImport } from './test-import';
import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { logger } from '@/utils/logger';

const SOURCE = 'GeoImportDialog';
const supabase = createClient();

// Configure logger to output to console and set debug level
logger.setComponentLogLevel(SOURCE, LogLevel.DEBUG);

// Create safe logging wrapper
const safeLogger = {
  info: (message: string, data?: any) => {
    try {
      const safeData = data ? JSON.parse(JSON.stringify(data)) : undefined;
      logger.info(SOURCE, message, safeData);
    } catch (err) {
      logger.info(SOURCE, message, { error: 'Data contained circular references' });
    }
  },
  warn: (message: string, error?: any) => {
    try {
      const safeError = error ? JSON.parse(JSON.stringify(error)) : undefined;
      logger.warn(SOURCE, message, safeError);
    } catch (err) {
      logger.warn(SOURCE, message, { error: 'Error object contained circular references' });
    }
  },
  error: (message: string, error?: any) => {
    try {
      const safeError = error ? JSON.parse(JSON.stringify(error)) : undefined;
      logger.error(SOURCE, message, safeError);
    } catch (err) {
      logger.error(SOURCE, message, { error: 'Error object contained circular references' });
    }
  },
  debug: (message: string, data?: any) => {
    try {
      const safeData = data ? JSON.parse(JSON.stringify(data)) : undefined;
      logger.debug(SOURCE, message, safeData);
    } catch (err) {
      logger.debug(SOURCE, message, { error: 'Data contained circular references' });
    }
  }
};

// Add type for channel status
type ChannelStatus = 'SUBSCRIBED' | 'CLOSED' | 'CHANNEL_ERROR' | 'TIMED_OUT';

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
  const [currentImportLogId, setCurrentImportLogId] = useState<string | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<'connected' | 'disconnected' | 'error'>('disconnected');
  const [channelRef] = useState<{ current: RealtimeChannel | null }>({ current: null });
  const [retryCount, setRetryCount] = useState(0);
  const MAX_RETRIES = 5;

  const memoizedFileInfo = useMemo(() => 
    fileInfo ? {
      id: fileInfo.id,
      name: fileInfo.name,
      size: fileInfo.size,
      type: fileInfo.type
    } : undefined
  , [fileInfo?.id, fileInfo?.name, fileInfo?.size, fileInfo?.type]);

  const handleImportUpdate = useCallback((payload: any) => {
    // Log only summary information
    safeLogger.debug('Processing import update', {
      status: payload.status,
      progress: {
        imported: payload.imported_count,
        failed: payload.failed_count,
        total: payload.total_features
      },
      collection: payload.collection_id,
      layer: payload.layer_id,
      // Include only non-geometry metadata
      summary: payload.metadata?.debug_info || {},
      errors: payload.metadata?.featureErrors?.length || 0,
      updateTimestamp: new Date().toISOString()
    });
    
    const { imported_count, failed_count, total_features, status, collection_id, layer_id, metadata } = payload;
    
    // Update progress
    const progressPercent = Math.round((imported_count / total_features) * 100);
    setProgress(progressPercent);
    setProgressMessage(`Imported ${imported_count} of ${total_features} features`);

    // Show progress toast (only for significant changes)
    if (progressPercent % 20 === 0 || status === 'completed' || status === 'failed') {
      toast({
        title: 'Import Progress',
        description: `Imported ${imported_count} of ${total_features} features (${progressPercent}%)`,
        duration: 3000,
      });
    }

    // Handle completion
    if (status === 'completed' || status === 'failed') {
      safeLogger.debug('Import status is completed or failed, calling handleImportCompletion', {
        status,
        imported_count,
        failed_count,
        hasCollectionId: !!collection_id,
        hasLayerId: !!layer_id
      });
      
      handleImportCompletion(status, {
        imported_count,
        failed_count,
        collection_id,
        layer_id,
        metadata: {
          debug_info: metadata?.debug_info,
          error: metadata?.error,
          errorCount: metadata?.featureErrors?.length || 0
        },
        import_log_id: payload.id
      });
    }
  }, [toast]);

  const handleImportCompletion = useCallback((status: string, data: any) => {
    safeLogger.debug(`Import ${status}`, {
      status,
      summary: {
        imported: data.imported_count,
        failed: data.failed_count,
        collection: data.collection_id,
        layer: data.layer_id,
        debug_info: data.metadata?.debug_info,
        errors: data.metadata?.errorCount || 0,
        import_log_id: data.import_log_id
      }
    });
    
    // Add detailed logging of current state
    safeLogger.debug('Current state at import completion', {
      hasImportSession: !!importSession,
      importSessionFileId: importSession?.fileId,
      hasFileInfo: !!fileInfo,
      fileInfoId: fileInfo?.id,
      fileInfoName: fileInfo?.name,
      dataCollectionId: data.collection_id,
      dataLayerId: data.layer_id,
      currentImportLogId,
      dataImportLogId: data.import_log_id
    });
    
    setIsProcessing(false);
    
    if (status === 'completed') {
      toast({
        title: 'Import Complete',
        description: `Successfully imported ${data.imported_count} features${data.failed_count > 0 ? `, ${data.failed_count} failed` : ''}`,
        duration: 5000,
      });
      
      // Capture values before they're reset
      const capturedImportSession = importSession;
      const capturedFileInfo = fileInfo;
      const capturedImportLogId = data.import_log_id || currentImportLogId;
      
      // Update file relationships in the database
      (async () => {
        try {
          // Check if we have the necessary file IDs
          let sourceFileId = capturedFileInfo?.id;
          let importedFileId = capturedImportSession?.fileId;
          
          // If either ID is missing, try to get them from the import log
          if (!sourceFileId || !importedFileId) {
            safeLogger.debug('Missing file IDs, attempting to retrieve from import log', {
              importLogId: capturedImportLogId,
              hasSourceFileId: !!sourceFileId,
              hasImportedFileId: !!importedFileId
            });
            
            if (capturedImportLogId) {
              // Try to get the project_file_id from the import log
              const { data: importLog, error: importLogError } = await supabase
                .from('realtime_import_logs')
                .select('project_file_id')
                .eq('id', capturedImportLogId)
                .single();
                
              if (importLogError) {
                safeLogger.warn('Failed to retrieve import log', {
                  error: importLogError,
                  importLogId: capturedImportLogId
                });
              } else if (importLog?.project_file_id) {
                importedFileId = importLog.project_file_id;
                safeLogger.debug('Retrieved imported file ID from import log', {
                  importedFileId,
                  importLogId: capturedImportLogId
                });
                
                // If we have the imported file ID but not the source file ID,
                // try to get it from the file name
                if (!sourceFileId && capturedFileInfo?.name) {
                  // Try to find the source file by name
                  const { data: sourceFiles, error: sourceFilesError } = await supabase
                    .from('project_files')
                    .select('id')
                    .eq('name', capturedFileInfo.name)
                    .eq('project_id', projectId)
                    .neq('id', importedFileId) // Exclude the imported file itself
                    .order('uploaded_at', { ascending: false })
                    .limit(1);
                    
                  if (sourceFilesError) {
                    safeLogger.warn('Failed to find source file by name', {
                      error: sourceFilesError,
                      fileName: capturedFileInfo.name
                    });
                  } else if (sourceFiles?.length > 0) {
                    sourceFileId = sourceFiles[0].id;
                    safeLogger.debug('Found source file by name', {
                      sourceFileId,
                      fileName: capturedFileInfo.name
                    });
                  }
                }
              }
            }
          }
          
          // If we still don't have both IDs, try one more approach - get the imported file directly from the collection ID
          if (!importedFileId && data.collection_id) {
            safeLogger.debug('Attempting to find imported file by collection ID', {
              collectionId: data.collection_id
            });
            
            // Try to find the file that has this collection ID in its feature_collections
            const { data: featureCollections, error: featureCollectionsError } = await supabase
              .from('feature_collections')
              .select('project_file_id')
              .eq('id', data.collection_id)
              .single();
              
            if (featureCollectionsError) {
              safeLogger.warn('Failed to find feature collection', {
                error: featureCollectionsError,
                collectionId: data.collection_id
              });
            } else if (featureCollections?.project_file_id) {
              importedFileId = featureCollections.project_file_id;
              safeLogger.debug('Found imported file ID from feature collection', {
                importedFileId,
                collectionId: data.collection_id
              });
              
              // Check if this is a shapefile by looking at the file extension
              const { data: importedFile, error: importedFileError } = await supabase
                .from('project_files')
                .select('name, is_shapefile_component, main_file_id')
                .eq('id', importedFileId)
                .single();
                
              if (importedFileError) {
                safeLogger.warn('Failed to get imported file details', {
                  error: importedFileError,
                  importedFileId
                });
              } else if (importedFile) {
                // For shapefiles, the source file is the same as the imported file
                // This is because shapefiles are directly imported without creating a new file
                if (importedFile.name.toLowerCase().endsWith('.shp')) {
                  safeLogger.debug('Detected shapefile import - using same file as source', {
                    importedFileId
                  });
                  sourceFileId = importedFileId;
                } else if (importedFile.is_shapefile_component && importedFile.main_file_id) {
                  // If this is a shapefile component, use the main file as both source and imported
                  safeLogger.debug('Detected shapefile component - using main file as source', {
                    componentId: importedFileId,
                    mainFileId: importedFile.main_file_id
                  });
                  sourceFileId = importedFile.main_file_id;
                  importedFileId = importedFile.main_file_id;
                } else {
                  // If we have the imported file ID but not the source file ID,
                  // try to find a file with the same name but without the .geojson extension
                  const baseName = importedFile.name.replace(/\.geojson$/i, '');
                  
                  // Try to find the source file by base name
                  const { data: sourceFiles, error: sourceFilesError } = await supabase
                    .from('project_files')
                    .select('id')
                    .eq('name', baseName)
                    .eq('project_id', projectId)
                    .neq('id', importedFileId) // Exclude the imported file itself
                    .order('uploaded_at', { ascending: false })
                    .limit(1);
                    
                  if (sourceFilesError) {
                    safeLogger.warn('Failed to find source file by base name', {
                      error: sourceFilesError,
                      baseName
                    });
                  } else if (sourceFiles?.length > 0) {
                    sourceFileId = sourceFiles[0].id;
                    safeLogger.debug('Found source file by base name', {
                      sourceFileId,
                      baseName
                    });
                  }
                }
              }
            }
          }
          
          // If we still don't have both IDs, we can't proceed
          if (!importedFileId) {
            safeLogger.warn('Missing imported file ID for relationship update, even after fallback attempts', {
              importSessionFileId: importedFileId,
              sourceFileId: sourceFileId,
              importLogId: capturedImportLogId
            });
            return;
          }
          
          // For shapefiles, if we have the imported file ID but no source file ID, use the imported file as the source
          if (!sourceFileId && importedFileId) {
            // Check if this is a shapefile
            const { data: fileInfo, error: fileInfoError } = await supabase
              .from('project_files')
              .select('name')
              .eq('id', importedFileId)
              .single();
              
            if (!fileInfoError && fileInfo?.name?.toLowerCase().endsWith('.shp')) {
              safeLogger.debug('Using shapefile as its own source file', {
                importedFileId
              });
              sourceFileId = importedFileId;
            } else {
              safeLogger.warn('Missing source file ID for relationship update', {
                importedFileId,
                importLogId: capturedImportLogId
              });
              // We can still proceed with just the imported file ID
            }
          }
          
          // Now proceed with the updates using the IDs we have
          safeLogger.debug('Proceeding with file relationship updates', {
            importedFileId,
            sourceFileId,
            isSourceSameAsImported: sourceFileId === importedFileId
          });

          // Create the import metadata
          const importMetadata = {
            sourceFile: sourceFileId ? {
              id: sourceFileId,
              name: capturedFileInfo?.name || 'Unknown File'
            } : undefined,
            importedLayers: [{
              name: capturedFileInfo?.name || 'Unknown Layer',
              featureCount: data.imported_count,
              featureTypes: {}
            }],
            statistics: {
              totalFeatures: data.imported_count + data.failed_count,
              failedTransformations: data.failed_count,
              errors: data.metadata?.errorCount || 0
            },
            imported_count: data.imported_count,
            failed_count: data.failed_count,
            collection_id: data.collection_id,
            layer_id: data.layer_id,
            importedAt: new Date().toISOString()
          };

          safeLogger.debug('Prepared import metadata', { 
            importMetadata,
            importedFileId,
            sourceFileId
          });

          // First update the imported file with metadata and source_file_id
          const updateData: any = { import_metadata: importMetadata };
          if (sourceFileId) {
            updateData.source_file_id = sourceFileId;
          }
          
          // If the source and imported files are the same (as with shapefiles),
          // also set is_imported to true
          if (sourceFileId && sourceFileId === importedFileId) {
            updateData.is_imported = true;
            safeLogger.debug('Setting is_imported=true for shapefile', { 
              importedFileId
            });
          }
          
          const { error: updateImportedError } = await supabase
            .from('project_files')
            .update(updateData)
            .eq('id', importedFileId);

          if (updateImportedError) {
            safeLogger.warn('Failed to update imported file with metadata', {
              error: updateImportedError,
              importedFileId,
              sourceFileId
            });
            // Don't proceed if this update fails
            return;
          } else {
            safeLogger.debug('Successfully updated imported file with metadata', { 
              importedFileId,
              sourceFileId
            });
          }

          // Then update the source file to mark it as imported (if it's different from the imported file)
          if (sourceFileId && sourceFileId !== importedFileId) {
            const { error: updateSourceError } = await supabase
              .from('project_files')
              .update({ is_imported: true })
              .eq('id', sourceFileId);

            if (updateSourceError) {
              safeLogger.warn('Failed to update source file import status', {
                error: updateSourceError,
                sourceFileId
              });
            } else {
              safeLogger.debug('Successfully updated source file import status', { 
                sourceFileId
              });
            }
          }

          // Verify the updates were successful
          const { data: verifyImported, error: verifyImportedError } = await supabase
            .from('project_files')
            .select('id, source_file_id, import_metadata')
            .eq('id', importedFileId)
            .single();

          if (verifyImportedError) {
            safeLogger.warn('Failed to verify imported file update', {
              error: verifyImportedError,
              importedFileId
            });
          } else {
            safeLogger.debug('Verification of imported file update', {
              importedFileId,
              hasSourceFileId: !!verifyImported.source_file_id,
              hasImportMetadata: !!verifyImported.import_metadata,
              sourceFileId: verifyImported.source_file_id,
              importMetadataKeys: verifyImported.import_metadata ? Object.keys(verifyImported.import_metadata) : []
            });
          }

          if (sourceFileId && sourceFileId !== importedFileId) {
            const { data: verifySource, error: verifySourceError } = await supabase
              .from('project_files')
              .select('id, is_imported')
              .eq('id', sourceFileId)
              .single();

            if (verifySourceError) {
              safeLogger.warn('Failed to verify source file update', {
                error: verifySourceError,
                sourceFileId
              });
            } else {
              safeLogger.debug('Verification of source file update', {
                sourceFileId,
                isImported: verifySource.is_imported
              });
            }
          }
        } catch (error) {
          safeLogger.error('Error updating file relationships', error);
        } finally {
          // Only close the dialog after the database updates are complete
          onOpenChange(false);
        }
      })();
      
      const bounds = importSession?.fullDataset?.metadata?.bounds || [0, 0, 0, 0];
      onImportComplete({
        features: [],
        bounds: {
          minX: bounds[0],
          minY: bounds[1],
          maxX: bounds[2],
          maxY: bounds[3]
        },
        layers: [],
        statistics: {
          pointCount: data.imported_count,
          layerCount: 1,
          featureTypes: {}
        },
        collectionId: data.collection_id,
        layerId: data.layer_id,
        totalImported: data.imported_count,
        totalFailed: data.failed_count
      });
    } else {
      toast({
        title: 'Import Failed',
        description: data.metadata?.error || 'Failed to import features',
        variant: 'destructive',
        duration: 5000,
      });
      
      // Close the dialog for failed imports
      onOpenChange(false);
    }
  }, [importSession, onImportComplete, onOpenChange, toast, fileInfo, currentImportLogId, projectId]);

  const checkImportStatus = useCallback(async () => {
    if (!currentImportLogId) return;
    
    safeLogger.debug('Checking import status', { importLogId: currentImportLogId });
    
    const { data, error } = await supabase
      .from('realtime_import_logs')
      .select('*')
      .eq('id', currentImportLogId)
      .single();

    if (error) {
      safeLogger.error('Failed to check import status', { error });
      return;
    }

    if (data) {
      safeLogger.debug('Retrieved import status', { 
        status: data.status,
        imported: data.imported_count,
        failed: data.failed_count,
        total: data.total_features,
        hasCollectionId: !!data.collection_id,
        hasLayerId: !!data.layer_id
      });
      handleImportUpdate(data);
    } else {
      safeLogger.warn('No import log found', { importLogId: currentImportLogId });
    }
  }, [currentImportLogId, handleImportUpdate]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setImportSession(null);
      setSelectedFeatureIds([]);
      setCurrentImportLogId(null);
    }
  }, [open]);

  // Add timeout handling
  useEffect(() => {
    if (!isProcessing) return;

    const timeoutDuration = 5 * 60 * 1000; // 5 minutes
    const timeoutId = setTimeout(() => {
      if (isProcessing) {
        safeLogger.error('Import timeout reached', { importLogId: currentImportLogId });
        toast({
          title: 'Import Timeout',
          description: 'The import is taking longer than expected. Please check the import logs for status.',
          variant: 'destructive',
          duration: 5000,
        });
        setIsProcessing(false);
        onOpenChange(false);
      }
    }, timeoutDuration);

    return () => clearTimeout(timeoutId);
  }, [isProcessing, currentImportLogId, toast, onOpenChange]);

  // Monitor WebSocket connection
  useEffect(() => {
    if (!currentImportLogId || !isProcessing) return;

    let isActive = true; // For cleanup handling

    const setupChannel = async () => {
      if (!currentImportLogId) {
        safeLogger.warn('No import log ID available for subscription');
        return;
      }

      try {
        // Clean up existing subscription if any
        if (channelRef.current) {
          safeLogger.debug('Cleaning up existing channel subscription');
          await channelRef.current.unsubscribe();
        }

        safeLogger.debug('Setting up new realtime subscription', {
          importLogId: currentImportLogId,
          retryCount
        });

        // Create new channel subscription
        const channel = supabase.channel(`import_progress_${currentImportLogId}`)
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'realtime_import_logs',
              filter: `id=eq.${currentImportLogId}`
            },
            (payload: RealtimePostgresChangesPayload<any>) => {
              safeLogger.debug('Received realtime update', {
                importLogId: currentImportLogId,
                status: payload.new.status,
                progress: {
                  imported: payload.new.imported_count,
                  failed: payload.new.failed_count
                }
              });
              handleImportUpdate(payload.new);
            }
          )
          .subscribe(async (status: string) => {
            if (status === 'SUBSCRIBED') {
              safeLogger.debug('Successfully subscribed to realtime updates', {
                importLogId: currentImportLogId
              });
              setSubscriptionStatus('connected');
              setRetryCount(0); // Reset retry count on successful connection
            } else if (status === 'CHANNEL_ERROR') {
              safeLogger.error('Channel subscription error', {
                importLogId: currentImportLogId,
                status,
                retryCount
              });
              setSubscriptionStatus('error');
              
              // Implement exponential backoff for retries
              if (retryCount < MAX_RETRIES) {
                const delay = Math.min(1000 * Math.pow(2, retryCount), 30000); // Max 30 second delay
                setTimeout(() => {
                  setRetryCount(prev => prev + 1);
                  setupChannel(); // Retry subscription
                }, delay);
              }
            } else if (status === 'CLOSED') {
              safeLogger.warn('Channel closed', {
                importLogId: currentImportLogId,
                wasConnected: subscriptionStatus === 'connected'
              });
              setSubscriptionStatus('disconnected');
              
              // If this was an unexpected closure, attempt to reconnect
              if (subscriptionStatus === 'connected' && retryCount < MAX_RETRIES) {
                setRetryCount(prev => prev + 1);
                setupChannel();
              }
            }
          });

        channelRef.current = channel;

      } catch (error) {
        safeLogger.error('Error setting up realtime subscription', {
          error,
          importLogId: currentImportLogId,
          retryCount
        });
        setSubscriptionStatus('error');
        
        // Attempt to retry on error
        if (retryCount < MAX_RETRIES) {
          const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);
          setTimeout(() => {
            setRetryCount(prev => prev + 1);
            setupChannel();
          }, delay);
        }
      }
    };

    // Set up initial channel
    setupChannel();

    // Clean up function
    return () => {
      isActive = false;
      const cleanup = async () => {
        safeLogger.debug('Cleaning up subscription', { importLogId: currentImportLogId });
        if (channelRef.current) {
          await channelRef.current.unsubscribe();
          channelRef.current = null;
        }
      };
      cleanup();
    };
  }, [currentImportLogId, retryCount, isProcessing, toast, checkImportStatus, handleImportUpdate]);

  // Set up periodic status check as fallback
  useEffect(() => {
    if (!currentImportLogId || !isProcessing) return;

    // Check more frequently if disconnected, less if connected
    const interval = subscriptionStatus === 'connected' ? 30000 : 5000;
    const statusCheckInterval = setInterval(checkImportStatus, interval);

    return () => clearInterval(statusCheckInterval);
  }, [currentImportLogId, isProcessing, subscriptionStatus, checkImportStatus]);

  const handleImportSessionCreated = async (session: ImportSession) => {
    safeLogger.debug('Import session received by dialog', {
      fileId: session.fileId,
      status: session.status,
      featureCount: session.fullDataset?.features.length || 0,
      geometryTypes: session.fullDataset?.metadata?.geometryTypes || [],
      sourceSrid: session.fullDataset?.metadata?.srid,
      bounds: session.fullDataset?.metadata?.bounds
    });
    setImportSession(session);
    
    if (session.fullDataset?.features) {
      const allFeatureIds = session.fullDataset.features.map(f => f.originalIndex || f.id);
      setSelectedFeatureIds(allFeatureIds);
      if (memoizedFileInfo?.name) {
        processedFiles.add(memoizedFileInfo.name);
      }
      safeLogger.info('Selected all features', { count: allFeatureIds.length });
    }
  };

  const handleFeaturesSelected = (previewFeatureIds: number[]) => {
    if (!importSession?.fullDataset) return;

    const selectedOriginalIds = importSession.previewDataset?.features
      .filter(f => previewFeatureIds.includes(f.previewId))
      .map(f => f.originalFeatureIndex);

    const fullDatasetSelectedIds = importSession.fullDataset.features
      .filter(f => selectedOriginalIds?.includes(f.originalIndex || f.id))
      .map(f => f.originalIndex || f.id);

    safeLogger.debug('Features selection updated', { 
      selectedCount: fullDatasetSelectedIds.length,
      totalFeatures: importSession.fullDataset.features.length
    });
    setSelectedFeatureIds(fullDatasetSelectedIds);
  };

  const handleImport = async () => {
    if (!importSession?.fullDataset) {
      safeLogger.error('No import session or dataset available');
      return;
    }

    try {
      setIsProcessing(true);
      
      const selectedFeatures = importSession.fullDataset.features.filter(f => 
        selectedFeatureIds.includes(f.originalIndex || f.id)
      );

      // Create initial import log
      const { data: importLog, error: createError } = await supabase
        .from('realtime_import_logs')
        .insert({
          project_file_id: importSession.fileId,
          status: 'started',
          total_features: selectedFeatures.length
        })
        .select()
        .single();

      if (createError) throw createError;
      
      safeLogger.debug('Created import log', { importLogId: importLog.id });
      setCurrentImportLogId(importLog.id);

      const requestPayload = {
        fileId: importSession.fileId,
        importLogId: importLog.id,
        collectionName: fileInfo?.name || 'Imported Features',
        features: selectedFeatures.map(f => ({
          type: 'Feature' as const,
          geometry: f.geometry,
          properties: f.properties || {}
        })),
        sourceSrid: importSession.fullDataset.metadata?.srid || 2056,
        batchSize: 50
      };

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
        body: JSON.stringify(requestPayload)
      });

      if (!response.ok || !response.body) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      safeLogger.debug('Import started', { importLogId: importLog.id });

    } catch (error) {
      handleImportError(error);
    }
  };

  const handleImportError = async (error: unknown) => {
    const errorData = error instanceof Error 
      ? { message: error.message, stack: error.stack, name: error.name }
      : { message: String(error) };
      
    safeLogger.error('Import failed', errorData);
    
    toast({
      title: 'Import Failed',
      description: error instanceof Error ? error.message : 'An unknown error occurred during import',
      variant: 'destructive',
      duration: 5000,
    });

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
      const completeErrorData = completeError instanceof Error 
        ? { message: completeError.message }
        : { message: String(completeError) };
        
      safeLogger.error('Error in onImportComplete during error handling', completeErrorData);
    }

    onOpenChange(false);
  };

  const handleDownloadLogs = () => {
    const logManager = LogManager.getInstance();
    const logs = logManager.getLogs();
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'import-logs.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleClearLogs = () => {
    const logManager = LogManager.getInstance();
    logManager.clearLogs();
    toast({
      title: 'Logs cleared',
      description: 'All logs have been cleared from memory.',
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
          <div className="flex justify-end">
            <TestImport projectId={projectId} />
          </div>

          {fileInfo ? (
            <>
              <FileInfoCard
                name={fileInfo.name}
                size={fileInfo.size}
                type={fileInfo.type}
              />
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

          {importSession && (
            <ImportDetailsCard
              importSession={importSession}
              selectedFeatureIds={selectedFeatureIds}
            />
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
              onClick={handleImport}
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