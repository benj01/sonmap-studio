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
import { LogManager } from '@/core/logging/log-manager';
import { LogLevel } from '@/core/logging/log-manager';
import { createClient } from '@/utils/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { processImportStream } from '../services/import-stream';
import { GeoImportDialogProps, ImportSession } from '../types';
import { TestImport } from './test-import';
import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

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
    logger.debug('Processing import update', { payload });
    
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
      handleImportCompletion(status, {
        imported_count,
        failed_count,
        collection_id,
        layer_id,
        metadata
      });
    }
  }, [toast]);

  const handleImportCompletion = useCallback((status: string, data: any) => {
    logger.debug(`Import ${status}`, data);
    
    setIsProcessing(false);
    
    if (status === 'completed') {
      toast({
        title: 'Import Complete',
        description: `Successfully imported ${data.imported_count} features${data.failed_count > 0 ? `, ${data.failed_count} failed` : ''}`,
        duration: 5000,
      });
      
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
    }
    
    onOpenChange(false);
  }, [importSession, onImportComplete, onOpenChange, toast]);

  const checkImportStatus = useCallback(async () => {
    if (!currentImportLogId) return;
    
    const { data, error } = await supabase
      .from('realtime_import_logs')
      .select('*')
      .eq('id', currentImportLogId)
      .single();

    if (error) {
      logger.error('Failed to check import status', { error });
      return;
    }

    if (data) {
      handleImportUpdate(data);
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
        logger.error('Import timeout reached', { importLogId: currentImportLogId });
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
      try {
        // Clean up existing channel if any
        if (channelRef.current) {
          await channelRef.current.unsubscribe();
          channelRef.current = null;
        }

        if (!isActive) return; // Don't proceed if cleanup has started

        // Ensure we have a valid session
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          await supabase.realtime.setAuth(session.access_token);
        }

        if (!isActive) return; // Don't proceed if cleanup has started

        logger.debug('Setting up new channel', { 
          importLogId: currentImportLogId,
          retryCount,
          connectionState: supabase.realtime.connectionState()
        });

        // Create and store channel reference
        const channel = supabase
          .channel(`import-progress-${currentImportLogId}-${Date.now()}`)
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'realtime_import_logs',
              filter: `id=eq.${currentImportLogId}`
            },
            (payload: RealtimePostgresChangesPayload<any>) => {
              if (!isActive) return; // Don't process updates if cleanup has started
              logger.debug('Received real-time update', { payload });
              if (!payload.new) return;
              handleImportUpdate(payload.new);
            }
          );

        channelRef.current = channel;

        const status = (await channel.subscribe()) as unknown as ChannelStatus;
        if (!isActive) {
          // If cleanup started during subscribe, clean up the channel
          channel.unsubscribe();
          return;
        }

        logger.debug('Channel subscription status', { status });

        if (status === 'SUBSCRIBED') {
          logger.debug('Channel subscribed successfully');
          setSubscriptionStatus('connected');
          setRetryCount(0);
          await checkImportStatus(); // Initial status check
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          logger.error('Channel subscription error', { status });
          setSubscriptionStatus('disconnected');

          if (retryCount < MAX_RETRIES && isActive) {
            const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
            logger.debug(`Retrying in ${delay}ms`, { retryCount });
            
            setTimeout(() => {
              if (isActive && isProcessing) {
                setRetryCount(prev => prev + 1);
                setupChannel();
              }
            }, delay);
          } else if (isActive) {
            logger.error('Max retry attempts reached', { retryCount });
            toast({
              title: 'Connection Error',
              description: 'Failed to maintain real-time connection. Falling back to polling.',
              variant: 'destructive',
              duration: 5000,
            });
          }
        }
      } catch (error) {
        if (!isActive) return;
        logger.error('Error setting up channel', { error });
        setSubscriptionStatus('error');
      }
    };

    // Set up initial channel
    setupChannel();

    // Clean up function
    return () => {
      isActive = false;
      const cleanup = async () => {
        logger.debug('Cleaning up subscription', { importLogId: currentImportLogId });
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
    logger.debug('Import session received by dialog', {
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
      logger.info('Selected all features', { count: allFeatureIds.length });
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
      
      logger.debug('Created import log', { importLogId: importLog.id });
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
        batchSize: 600
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

      logger.debug('Import started', { importLogId: importLog.id });

    } catch (error) {
      handleImportError(error);
    }
  };

  const handleImportError = async (error: unknown) => {
    const errorData = error instanceof Error 
      ? { message: error.message, stack: error.stack, name: error.name }
      : { message: String(error) };
      
    logger.error('Import failed', errorData);
    
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
        
      logger.error('Error in onImportComplete during error handling', completeErrorData);
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