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

// Add a safe JSON stringify utility
const safeStringify = (obj: any): string => {
  try {
    return JSON.stringify(obj);
  } catch (e) {
    return '[Unserializable Object]';
  }
};

// Add a utility function to safely extract error messages
const extractErrorMessage = (event: any): string => {
  try {
    if (!event || typeof event !== 'object') {
      return 'Unknown error occurred';
    }

    if (event.type !== 'error' || !event.error) {
      return 'Import process failed with an unspecified error';
    }

    const errorObj = event.error;

    // Get the primary message
    let mainMessage = 'Unknown error occurred';
    if (typeof errorObj.message === 'string') {
      mainMessage = errorObj.message;
    } else if (errorObj.message && typeof errorObj.message === 'object') {
      try {
        mainMessage = JSON.stringify(errorObj.message);
      } catch {
        mainMessage = '[Complex Error Object]';
      }
    }

    // Check if the mainMessage itself contains "[object Object]"
    if (mainMessage === '[object Object]' && errorObj.details) {
      // Try to use details instead
      if (typeof errorObj.details === 'object' && errorObj.details.phase) {
        mainMessage = `Error occurred during ${errorObj.details.phase} phase`;
      }
    }

    // Collect additional details
    const detailParts: string[] = [];

    // Handle error details
    if (errorObj.details) {
      const details = errorObj.details;
      
      // If details is a string, use it directly
      if (typeof details === 'string') {
        if (details && details !== mainMessage) {
          detailParts.push(details);
        }
      } 
      // If details is an object, extract useful properties
      else if (typeof details === 'object' && details !== null) {
        // Extract nested error message if present
        if (details.error && details.error.message) {
          const errorMessage = details.error.message;
          if (typeof errorMessage === 'string' && errorMessage !== mainMessage && errorMessage !== '[object Object]') {
            detailParts.push(`Error: ${errorMessage}`);
          }
        }
        
        // Extract hint
        if (details.hint && typeof details.hint === 'string') {
          detailParts.push(`Hint: ${details.hint}`);
        }
        
        // Extract details property if it's a string and not duplicate
        if (details.details && typeof details.details === 'string' && details.details !== mainMessage) {
          detailParts.push(`Details: ${details.details}`);
        }
        
        // Extract message if it's different from main message
        if (details.message && typeof details.message === 'string' && details.message !== mainMessage) {
          detailParts.push(`Note: ${details.message}`);
        }
        
        // Extract phase if present
        if (details.phase && typeof details.phase === 'string') {
          detailParts.push(`Phase: ${details.phase}`);
        }
      }
    }

    // Add error code if it's not the default
    if (errorObj.code && 
        typeof errorObj.code === 'string' && 
        errorObj.code !== 'STREAM_FEATURES_ERROR') {
      detailParts.push(`Code: ${errorObj.code}`);
    }

    // If we still have [object Object] as the only message and no details, provide a fallback
    if (mainMessage === '[object Object]' && detailParts.length === 0) {
      return 'An error occurred during the import process. Please check the logs for more details.';
    }

    // Combine everything into a user-friendly message
    if (detailParts.length > 0) {
      return `${mainMessage}\n\n${detailParts.join('\n')}`;
    }
    
    return mainMessage;
  } catch (e) {
    return `Error processing server response: ${e instanceof Error ? e.message : String(e)}`;
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

  const handleImportCompletion = useCallback((status: string, data: any) => {
    try {
      if (status === 'completed') {
        // Handle successful completion
        onImportComplete({
          features: [],
          bounds: {
            minX: 0,
            minY: 0,
            maxX: 0,
            maxY: 0
          },
          layers: [],
          statistics: {
            pointCount: 0,
            layerCount: 0,
            featureTypes: {}
          },
          collectionId: data.collection_id,
          layerId: data.layer_id,
          totalImported: data.imported_count,
          totalFailed: data.failed_count
        });

        toast({
          title: 'Import Complete',
          description: `Successfully imported ${data.imported_count} features`,
          duration: 5000,
        });
      } else {
        // Handle failure
        const errorMessage = data.metadata?.error || 'Import failed with unknown error';
        toast({
          title: 'Import Failed',
          description: errorMessage,
          variant: 'destructive',
          duration: 5000,
        });
      }

      // Clean up
      setIsProcessing(false);
      setProgress(0);
      setProgressMessage('');
      
    } catch (error) {
      safeLogger.error('Error in import completion handler', {
        error: error instanceof Error ? error.message : String(error),
        status,
        data: safeStringify(data)
      });
      
      toast({
        title: 'Import Error',
        description: 'Failed to process import completion',
        variant: 'destructive',
        duration: 5000,
      });
    }
  }, [onImportComplete, toast]);

  const handleImportUpdate = useCallback((payload: any) => {
    // Guard against non-object payloads
    if (!payload || typeof payload !== 'object') {
      safeLogger.warn('Received invalid payload in import update', {
        payloadType: typeof payload
      });
      return;
    }
    
    // Safely extract values with defaults to prevent errors
    const status = payload.status || 'unknown';
    const imported_count = Number(payload.imported_count) || 0;
    const failed_count = Number(payload.failed_count) || 0;
    const total_features = Number(payload.total_features) || 0;
    const collection_id = payload.collection_id;
    const layer_id = payload.layer_id;
    const metadata = payload.metadata || {};
    
    // Log only summary information
    safeLogger.debug('Processing import update', {
      status,
      progress: {
        imported: imported_count,
        failed: failed_count,
        total: total_features
      },
      collection: collection_id,
      layer: layer_id,
      // Include only non-geometry metadata
      summary: metadata?.debug_info || {},
      errors: metadata?.featureErrors?.length || 0,
      updateTimestamp: new Date().toISOString()
    });
    
    // Update progress - guard against division by zero
    const progressPercent = total_features > 0 ? Math.round((imported_count / total_features) * 100) : 0;
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
  }, [toast, handleImportCompletion]);

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
    if (!currentImportLogId || !isProcessing) {
      // Clean up any existing subscription when processing stops or import log changes
      if (channelRef.current) {
        safeLogger.debug('Cleaning up subscription due to state change', {
          importLogId: currentImportLogId,
          isProcessing
        });
        channelRef.current.unsubscribe();
        channelRef.current = null;
      }
      return;
    }

    let isActive = true;

    const setupChannel = async () => {
      if (!currentImportLogId || !isActive) {
        return;
      }

      try {
        // Clean up existing subscription if any
        if (channelRef.current) {
          safeLogger.debug('Cleaning up existing channel before new setup');
          await channelRef.current.unsubscribe();
          channelRef.current = null;
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
              if (!isActive) return;
              
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
            if (!isActive) return;

            if (status === 'SUBSCRIBED') {
              safeLogger.debug('Successfully subscribed to realtime updates', {
                importLogId: currentImportLogId
              });
              setSubscriptionStatus('connected');
              setRetryCount(0);
            } else if (status === 'CHANNEL_ERROR') {
              safeLogger.error('Channel subscription error', {
                importLogId: currentImportLogId,
                status,
                retryCount
              });
              setSubscriptionStatus('error');
              
              // Only retry if we're still processing and haven't exceeded retries
              if (isProcessing && retryCount < MAX_RETRIES) {
                const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);
                setTimeout(() => {
                  if (isActive && isProcessing) {
                    setRetryCount(prev => prev + 1);
                    setupChannel();
                  }
                }, delay);
              }
            } else if (status === 'CLOSED') {
              safeLogger.debug('Channel closed', {
                importLogId: currentImportLogId,
                wasConnected: subscriptionStatus === 'connected'
              });
              setSubscriptionStatus('disconnected');
              
              // Only attempt reconnect if we were previously connected and still processing
              if (subscriptionStatus === 'connected' && isProcessing && retryCount < MAX_RETRIES && isActive) {
                setRetryCount(prev => prev + 1);
                setupChannel();
              }
            }
          });

        channelRef.current = channel;

      } catch (error) {
        if (!isActive) return;
        
        safeLogger.error('Error setting up realtime subscription', {
          error,
          importLogId: currentImportLogId,
          retryCount
        });
        setSubscriptionStatus('error');
        
        // Only retry if we're still processing and haven't exceeded retries
        if (isProcessing && retryCount < MAX_RETRIES) {
          const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);
          setTimeout(() => {
            if (isActive && isProcessing) {
              setRetryCount(prev => prev + 1);
              setupChannel();
            }
          }, delay);
        }
      }
    };

    setupChannel();

    return () => {
      isActive = false;
      if (channelRef.current) {
        safeLogger.debug('Cleaning up subscription in cleanup function', {
          importLogId: currentImportLogId
        });
        channelRef.current.unsubscribe();
        channelRef.current = null;
      }
    };
  }, [currentImportLogId, retryCount, isProcessing, subscriptionStatus, handleImportUpdate]);

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
          total_features: selectedFeatures.length,
          imported_count: 0,
          failed_count: 0
        })
        .select()
        .single();

      if (createError) throw createError;
      
      safeLogger.debug('Created import log', { importLogId: importLog.id });
      setCurrentImportLogId(importLog.id);

      const requestPayload = {
        projectFileId: importSession.fileId,  // Changed from fileId to projectFileId
        importLogId: importLog.id,
        collectionName: fileInfo?.name || 'Imported Features',
        features: selectedFeatures.map(f => ({
          type: 'Feature' as const,
          geometry: f.geometry,
          properties: f.properties || {}
        })),
        sourceSrid: importSession.fullDataset.metadata?.srid || 2056,
        targetSrid: 4326,
        batchSize: 10,
        retries: 3,
        checkpointInterval: 500
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
        body: JSON.stringify({
          ...requestPayload,
          features: requestPayload.features
        }),
        signal: AbortSignal.timeout(300000) // 5 minute timeout
      });

      if (!response.ok || !response.body) {
        const errorData = await response.json().catch(() => null);
        throw new Error(
          errorData?.error || errorData?.details?.error || `HTTP error! status: ${response.status}`
        );
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let lastProgressTime = Date.now();
      const PROGRESS_TIMEOUT = 30000; // 30 seconds

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          break;
        }

        // Check for progress timeout
        const currentTime = Date.now();
        if (currentTime - lastProgressTime > PROGRESS_TIMEOUT) {
          throw new Error('Import timed out - no progress for 30 seconds');
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          try {
            if (!line.trim()) continue;
            
            const event = JSON.parse(line);
            lastProgressTime = currentTime; // Reset timeout on successful event

            if (event.type === 'error') {
              // Extract error details from the structured error response
              const errorData = event.error || {};
              const errorDetails = errorData.details || {};
              
              // Build a comprehensive error message
              const messageParts = [];
              
              // Add main error message
              if (errorData.message) {
                messageParts.push(errorData.message);
              }
              
              // Add hint if available
              if (errorDetails.hint) {
                messageParts.push(`Hint: ${errorDetails.hint}`);
              }
              
              // Add additional details if available
              if (errorDetails.details) {
                messageParts.push(`Details: ${errorDetails.details}`);
              }
              
              // Add phase information
              if (errorDetails.phase) {
                messageParts.push(`Phase: ${errorDetails.phase}`);
              }
              
              // Log the complete error context
              safeLogger.error('Import stream error', {
                code: errorData.code,
                message: errorData.message,
                details: errorDetails,
                timestamp: errorDetails.timestamp,
                phase: errorDetails.phase,
                errorType: errorDetails.errorType
              });
              
              // Throw error with user-friendly message
              throw new Error(messageParts.filter(Boolean).join('\n'));
            }

            if (event.type === 'progress') {
              safeLogger.debug('Processing import progress', {
                imported: event.imported,
                total: event.total,
                percent: Math.round((event.imported / event.total) * 100)
              });
              
              // Handle progress update
              setProgress(Math.round((event.imported / event.total) * 100));
              setProgressMessage(`Imported ${event.imported} of ${event.total} features`);
            }

            if (event.type === 'complete') {
              safeLogger.info('Completed import process', {
                timestamp: new Date().toISOString(),
                result: {
                  features: event.features?.length || 0,
                  collection: event.collection_id,
                  layer: event.layer_id
                }
              });
            }
          } catch (parseError) {
            safeLogger.error('Failed to parse stream data', {
              line,
              error: parseError instanceof Error ? parseError.message : String(parseError)
            });
          }
        }
      }

      safeLogger.debug('Import started', { importLogId: importLog.id });

    } catch (error) {
      const currentImportId = currentImportLogId;
      safeLogger.error('Import failed', {
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack,
          name: error.name
        } : String(error),
        importLogId: currentImportId
      });
      handleImportError(error);
    }
  };

  const handleImportError = async (error: unknown) => {
    // Simple error message extraction
    let errorMessage = "An unknown error occurred during import";
    
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === 'string') {
      errorMessage = error;
    }
    
    console.error('Import error:', error);
    
    // Update import log if available
    if (currentImportLogId) {
      try {
        await supabase
          .from('realtime_import_logs')
          .update({
            status: 'failed',
            metadata: {
              error: errorMessage,
              timestamp: new Date().toISOString()
            }
          })
          .eq('id', currentImportLogId);
      } catch (updateError) {
        console.error('Failed to update import log:', updateError);
      }
    }
    
    // Simple toast with the error message
    toast({
      title: 'Import Failed',
      description: errorMessage,
      variant: 'destructive'
    });

    setIsProcessing(false);
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